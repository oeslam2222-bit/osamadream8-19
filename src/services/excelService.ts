import * as XLSX from 'xlsx-js-style';
import { COMPANY_INFO } from '../data/mockData';
import { Customer, CustomerTier, Invoice, ItemStatus, Product, SalesPriority } from '../types';
import { inferBranchFromText, resolveCustomerFinancials, getBranchStockForProduct } from './arabicMatchingService';
import { decodeBufferSmart, parseExcelOrCsvBuffer } from './encodingService';

/**
 * Preserves the product code exactly as supplied by the sheet, including prefixes
 * such as DRM- and any meaningful separators.
 */
export function cleanProductCode(code?: string | number): string {
  if (code === undefined || code === null) return '';
  return String(code).trim();
}

/**
 * Resolves true customer code, prioritizing valid ERP codes (e.g. CUST012295)
 * and strictly forbidding placeholder words like "كاش" or "نقدي".
 */
export function resolveSafeCustomerCode(invoice: Partial<Invoice>, matchedCustomer?: Customer): string {
  const isInvalidPlaceholder = (val?: string) => {
    if (!val) return true;
    const v = val.trim().toLowerCase();
    return (
      v === 'كاش' ||
      v === 'نقدي' ||
      v === 'نقدى' ||
      v === 'cash' ||
      v === 'غير محدد' ||
      v === '---' ||
      v === 'cash-direct' ||
      v === 'undefined' ||
      v === 'null'
    );
  };

  // 1. Matched customer from database (e.g. CUST012295)
  if (matchedCustomer?.code && !isInvalidPlaceholder(matchedCustomer.code)) {
    return matchedCustomer.code.trim();
  }

  // 2. Customer code already set on invoice (if not a placeholder)
  if (invoice.customerCode && !isInvalidPlaceholder(invoice.customerCode)) {
    return invoice.customerCode.trim();
  }

  // 3. Customer ID if it has CUST prefix
  if (invoice.customerId && !isInvalidPlaceholder(invoice.customerId)) {
    const cid = invoice.customerId.trim();
    if (cid.toUpperCase().startsWith('CUST')) {
      return cid.replace(/^cust[-_]/i, 'CUST');
    }
  }

  // 4. Default standard fallback code for customer (never output "كاش" as customer code)
  return 'CUST012295';
}

/**
 * Smart Branch Name normalizer for Excel input
 * Supports all 7 company branches + central warehouse, and handles any flexible naming or custom branches
 */
export function normalizeExcelBranchName(rawBranch?: string): string {
  if (!rawBranch || !rawBranch.trim()) {
    return '';
  }
  const clean = rawBranch.trim();
  const inferred = inferBranchFromText(clean);
  if (inferred) {
    return inferred;
  }

  // If user provided a specific branch name, format nicely
  if (!clean.startsWith('فرع') && !clean.includes('المخزن')) {
    return `فرع ${clean}`;
  }
  return clean;
}

/**
 * Clean and extract raw Image URL from Google Sheets cells
 * Handles =IMAGE("..."), =HYPERLINK("...", "..."), Drive file sharing links, Google UserContent thumbnails, raw IDs with =w800, and standard web links.
 */
export function cleanGoogleSheetImageUrl(raw: string): string {
  if (!raw) return '';
  let clean = String(raw).trim();

  // 1. Extract URL if inside =IMAGE("https://...") or =IMAGE('https://...')
  const imageFormulaMatch = clean.match(/=IMAGE\s*\(\s*["']([^"']+)["']/i);
  if (imageFormulaMatch) {
    clean = imageFormulaMatch[1].trim();
  }

  // 2. Extract URL if inside =HYPERLINK("https://...", "...")
  const hyperlinkMatch = clean.match(/=HYPERLINK\s*\(\s*["']([^"']+)["']/i);
  if (hyperlinkMatch) {
    clean = hyperlinkMatch[1].trim();
  }

  // 3. Strip enclosing single or double quotes
  clean = clean.replace(/^["']+|["']+$/g, '').trim();

  // 4. If someone entered googleusercontent.com/d/{ID} directly without https://
  if (clean.startsWith('googleusercontent.com') || clean.startsWith('lh3.googleusercontent.com')) {
    clean = `https://${clean}`;
  }

  // 5. Drive sharing URLs: drive.google.com/file/d/{ID}/view -> Google Direct CDN Thumbnail
  const driveFileMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch) {
    return `https://lh3.googleusercontent.com/d/${driveFileMatch[1]}=w800`;
  }

  // 6. Drive open?id={ID} or uc?id={ID} or thumbnail?id={ID}
  const driveIdMatch = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (driveIdMatch) {
    return `https://lh3.googleusercontent.com/d/${driveIdMatch[1]}=w800`;
  }

  // 7. If raw contains googleusercontent /d/{ID}
  const lhMatch = clean.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (lhMatch) {
    return `https://lh3.googleusercontent.com/d/${lhMatch[1]}=w800`;
  }

  // 8. If raw is a naked Google ID (with or without leading slash or =w800 parameter)
  // e.g. "m6Z0e9dq9HwKa_AkEBbVhO0=w800" or "/dMJZNZDpeeZC1UcU19OX0zcdQ=w800"
  const nakedIdMatch = clean.match(/^(\/)?([a-zA-Z0-9_-]{20,})(=w\d+)?$/i);
  if (nakedIdMatch) {
    return `https://lh3.googleusercontent.com/d/${nakedIdMatch[2]}=w800`;
  }

  // 9. If someone has multiple space-separated or comma-separated URLs, take the first valid one
  if (clean.includes(' ') && (clean.startsWith('http://') || clean.startsWith('https://'))) {
    const parts = clean.split(/\s+/);
    if (parts[0] && parts[0].startsWith('http')) {
      clean = parts[0];
    }
  }

  return clean;
}

/**
 * Normalizes header string to match flexibly
 */
function normalizeHeader(header: string): string {
  if (!header) return '';
  return header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[ـ\s_-]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/**
 * Extract Google Sheet ID and GID from any Google Sheets URL
 */
export function extractGoogleSpreadsheetId(input: string): { sheetId: string; gid: string } {
  if (!input) return { sheetId: '', gid: '0' };
  const clean = input.trim();

  // If user pasted just the sheet ID directly
  if (!clean.includes('/') && clean.length > 20) {
    return { sheetId: clean, gid: '0' };
  }

  // Regex to match /d/{SPREADSHEET_ID}
  const idMatch = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const sheetId = idMatch ? idMatch[1] : '';

  // Match gid parameter
  const gidMatch = clean.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return { sheetId, gid };
}

/**
 * Build direct CSV export URL for any Google Sheet link
 */
export function buildGoogleSheetsPublicCsvUrl(input: string): string {
  const { sheetId, gid } = extractGoogleSpreadsheetId(input);
  if (!sheetId) {
    if (input.startsWith('http')) return input;
    return '';
  }
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

/**
 * Convert 2D array of rows from sheet/csv to Product list using Dream columns
 */
export function parseRawRowsToProducts(rawRows: any[]): {
  products: Product[];
  errors: string[];
  totalRows: number;
} {
  if (!rawRows || rawRows.length < 2) {
    return {
      products: [],
      errors: ['الملف فارغ أو لا يحتوي على صفوف بيانات صالحة'],
      totalRows: 0,
    };
  }

  // Find header row index
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i];
    const hasCodeOrName = row.some((cell: any) => {
      const str = String(cell);
      return str.includes('كود') || str.includes('اسم') || str.includes('الصنف') || str.includes('code');
    });
    if (hasCodeOrName) {
      headerRowIndex = i;
      break;
    }
  }

  const headers: string[] = rawRows[headerRowIndex].map((h: any) => String(h).trim());
  const errors: string[] = [];
  const products: Product[] = [];

  // Identify column indexes based on Arabic & English header variations
  const colMap: Record<string, number> = {
    code: -1,
    unifiedCode: -1,
    name: -1,
    salesPriority: -1,
    category: -1,
    status: -1,
    cartonQuantity: -1,
    factor: -1,
    size: -1,
    color: -1,
    branchStockActual: -1,
    branchStockReserved: -1,
    mainWarehouseActual: -1,
    mainWarehouseReserved: -1,
    department: -1,
    itemGroup: -1,
    classification: -1,
    familyName: -1,
    promoPrice: -1,
    promoPiecePrice: -1,
    piecePrice: -1,
    salesPrice: -1,
    cartonPrice: -1,
    branchName: -1,
    imageUrl: -1,
    barcode: -1,
    // Branch stocks
    stockBeheira: -1,
    stockFayoum: -1,
    stockCairo: -1,
    stockMinya: -1,
    stockDimeshalt: -1,
    stockOctober: -1,
    stockMenouf: -1,
    stockMeq: -1,
  };

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);

    // 1. الكود الموحد (Unified Code / Model Code)
    if (
      norm === 'الكودالموحد' ||
      norm === 'كودموحد' ||
      norm === 'الكودالموضح' ||
      norm === 'كودموضح' ||
      norm === 'الكودموضح' ||
      norm === 'كودالموضح' ||
      norm === 'الموضح' ||
      norm === 'كودتوضيحي' ||
      norm === 'كودالصنفالموضح' ||
      norm === 'كودالموديل' ||
      norm === 'الموديل' ||
      norm === 'كودالموديلالموحد' ||
      norm.includes('الكودالموحد') ||
      norm.includes('كودموحد') ||
      norm.includes('الكودالموضح') ||
      norm.includes('unifiedcode') ||
      norm.includes('modelcode') ||
      norm.includes('mastercode')
    ) {
      colMap.unifiedCode = idx;
    }
    // 2. كود المنتج (Product Code / SKU) - strictly separated from unifiedCode
    else if (
      idx !== colMap.unifiedCode &&
      !norm.includes('موحد') &&
      !norm.includes('موضح') &&
      !norm.includes('موديل') &&
      (norm === 'كودالمنتج' ||
        norm === 'كودالصنف' ||
        norm === 'الكودكامل' ||
        norm === 'كودكامل' ||
        norm === 'الكودالكامل' ||
        norm === 'كودالصنفالكامل' ||
        norm === 'الكود' ||
        norm === 'كود' ||
        norm.includes('كودالمنتج') ||
        norm.includes('كودالصنف') ||
        norm.includes('productcode') ||
        norm.includes('itemcode') ||
        norm.includes('sku') ||
        norm === 'code')
    ) {
      if (
        colMap.code === -1 ||
        norm === 'كودالمنتج' ||
        norm === 'كودالصنف' ||
        norm === 'الكودكامل' ||
        norm === 'كودكامل'
      ) {
        colMap.code = idx;
      }
    }
    // 3. اسم المنتج (Product Name / البيان)
    else if (
      !norm.includes('عائلة') &&
      !norm.includes('عائله') &&
      !norm.includes('فرع') &&
      !norm.includes('مندوب') &&
      (norm === 'اسمالمنتج' ||
        norm === 'اسمالصنف' ||
        norm === 'productname' ||
        norm === 'itemname' ||
        norm.includes('اسمالمنتج') ||
        norm.includes('productname') ||
        norm.includes('اسمالصنف') ||
        norm === 'الاسم' ||
        norm === 'اسم' ||
        norm.includes('البيان'))
    ) {
      if (colMap.name === -1 || norm === 'اسمالمنتج' || norm === 'اسمالصنف' || norm.includes('اسمالصنف')) {
        colMap.name = idx;
      }
    }
    // 4. الحجم (Size / Weight)
    else if (
      norm === 'الحجم' ||
      norm === 'حجم' ||
      norm === 'الوزن' ||
      norm === 'وزن' ||
      norm === 'المقاس' ||
      norm === 'مقاس' ||
      norm.includes('حجم') ||
      norm.includes('size')
    ) {
      colMap.size = idx;
    }
    // 5. عدد القطع (Factor / شدة الكرتونة / عدد القطع بالكرتونة)
    else if (
      norm === 'عددالقطع' ||
      norm === 'القطع' ||
      norm === 'عددالقط' ||
      norm === 'factor' ||
      norm.includes('factor') ||
      norm.includes('الفاكتور') ||
      norm.includes('فاكتور') ||
      norm.includes('شدةالكرتون') ||
      norm.includes('شدةالكرتونه') ||
      norm.includes('شدةالكرتونة') ||
      norm.includes('شدة') ||
      norm.includes('شده') ||
      norm.includes('عددالقطع') ||
      norm.includes('القطعبالكرتون') ||
      norm.includes('قطعبالكرتون')
    ) {
      colMap.factor = idx;
      colMap.cartonQuantity = idx;
    }
    // 6. سعر الكرتونه (Carton Price / سعر الكرتونة / سعر الكرتون)
    else if (
      norm === 'سعرالكرتونه' ||
      norm === 'سعرالكرتونة' ||
      norm === 'سعرالكرتون' ||
      norm === 'سعرالكر' ||
      norm.includes('سعرالكرتون') ||
      norm.includes('سعرالكرتونه') ||
      norm.includes('سعرالكرتونة') ||
      norm.includes('cartonprice') ||
      norm.includes('wholesaleprice')
    ) {
      colMap.cartonPrice = idx;
    }
    // 7. Item group (المجموعة الرئيسية / القسم / الماركة / البراند)
    else if (
      norm === 'itemgroup' ||
      norm === 'item_group' ||
      norm === 'item group' ||
      norm.includes('itemgroup') ||
      norm.includes('مجموعةالاصناف') ||
      norm.includes('مجموعةالأصناف') ||
      norm.includes('مجموعةالصنف') ||
      norm.includes('مجموعهالصنف') ||
      norm.includes('المجموعةالرئيسية') ||
      norm.includes('المجموعهالرئيسيه') ||
      norm.includes('المجموعةالرئيسيه') ||
      norm.includes('المجموعهالرئيسية') ||
      norm.includes('المجموعة') ||
      norm.includes('المجموعه') ||
      norm.includes('البراند') ||
      norm.includes('الماركة') ||
      norm.includes('الماركه')
    ) {
      colMap.itemGroup = idx;
      colMap.department = idx;
    }
    // 8. Family Name (عائلة الصنف / الفئة / المجموعة الفرعية / التصنيف)
    else if (
      norm === 'familyname' ||
      norm === 'family_name' ||
      norm === 'family name' ||
      norm.includes('familyname') ||
      norm.includes('اسمالعائلة') ||
      norm.includes('اسمالعائله') ||
      norm.includes('عائلةالصنف') ||
      norm.includes('عائلهالصنف') ||
      norm.includes('المجموعةالفرعية') ||
      norm.includes('المجموعهالفرعيه') ||
      norm.includes('العائلة') ||
      norm.includes('العائله') ||
      norm.includes('الفئة') ||
      norm.includes('الفئه') ||
      norm.includes('الفئات') ||
      norm.includes('فئة') ||
      norm.includes('فئه') ||
      norm.includes('عائلة') ||
      norm.includes('عائله')
    ) {
      colMap.familyName = idx;
      colMap.classification = idx;
    }
    // 9. اللون (Color)
    else if (norm === 'اللون' || norm === 'لون' || norm.includes('اللون') || norm.includes('color')) {
      colMap.color = idx;
    }
    // 10. البحيرة (Beheira Branch Stock)
    else if (
      norm === 'البحيرة' ||
      norm === 'البحيره' ||
      norm === 'البحير' ||
      norm.includes('مخزونالبحير') ||
      norm.includes('فرعالبحير') ||
      norm.includes('البحير')
    ) {
      colMap.stockBeheira = idx;
      if (colMap.branchStockActual === -1) colMap.branchStockActual = idx;
    }
    // 11. الفيوم (Fayoum Branch Stock)
    else if (
      norm === 'الفيوم' ||
      norm.includes('مخزونالفيوم') ||
      norm.includes('فرعالفيوم') ||
      norm.includes('الفيوم')
    ) {
      colMap.stockFayoum = idx;
    }
    // 12. القاهرة (Cairo Branch Stock)
    else if (
      norm === 'القاهرة' ||
      norm === 'القاهره' ||
      norm === 'القاهر' ||
      norm.includes('مخزونالقاهر') ||
      norm.includes('فرعالقاهر') ||
      norm.includes('القاهر')
    ) {
      colMap.stockCairo = idx;
    }
    // 13. المنيا (Minya Branch Stock - Upper Egypt, strictly separated from Minya El Qamh)
    else if (
      (norm === 'المنيا' || norm === 'المني' || norm.includes('المنيا')) &&
      !norm.includes('القمح') &&
      !norm.includes('قمح')
    ) {
      colMap.stockMinya = idx;
    }
    // 14. ديمشلت (Dimeshalt Branch Stock)
    else if (
      norm === 'ديمشلت' ||
      norm === 'ديمشل' ||
      norm.includes('مخزونديمشلت') ||
      norm.includes('فرعديمشلت') ||
      norm.includes('ديمشلت')
    ) {
      colMap.stockDimeshalt = idx;
    }
    // 15. مخزون اكتوبر (October Central Warehouse Stock - المخزن الرئيسي المركزي)
    else if (
      norm === 'مخزوناكتوبر' ||
      norm === 'مخزونأكتوبر' ||
      norm === 'مخزوناكتوب' ||
      norm === 'مخزونكتوب' ||
      norm === 'اكتوبر' ||
      norm === 'أكتوبر' ||
      norm.includes('مخزوناكتوبر') ||
      norm.includes('مخزنالمركزي') ||
      norm.includes('مخزنمركزي') ||
      norm.includes('المخزنالمركزي') ||
      norm.includes('المخزنالرئيسي') ||
      norm.includes('المخزنالرئيسى')
    ) {
      colMap.stockOctober = idx;
      colMap.mainWarehouseActual = idx;
    }
    // 16. منوف (Menouf Branch Stock)
    else if (
      norm === 'منوف' ||
      norm.includes('مخزونمنوف') ||
      norm.includes('فرعمنوف') ||
      norm.includes('منوف')
    ) {
      colMap.stockMenouf = idx;
    }
    // 17. منيا القمح (Minya El Qamh Branch Stock)
    else if (
      norm === 'منياالقمح' ||
      norm === 'منياالقم' ||
      norm === 'متياالقم' ||
      norm.includes('منياالقمح') ||
      norm.includes('القمح') ||
      norm.includes('قمح')
    ) {
      colMap.stockMeq = idx;
    }
    // 18. سعر العرض (Offer / Promo Price for Carton)
    else if (
      norm === 'سعرالعرض' ||
      norm === 'سعرالعرضكرتون' ||
      norm === 'سعرالعرضبالكرتون' ||
      norm === 'سعرعرضكرتون' ||
      norm === 'سعرعرض' ||
      norm.includes('سعرالعرض') ||
      norm.includes('سعرخاص') ||
      norm.includes('promo') ||
      norm.includes('promoprice') ||
      norm.includes('offerprice')
    ) {
      colMap.promoPrice = idx;
    } else if (
      norm.includes('سعرالعرضقطعة') ||
      norm.includes('سعرالعرضبالقطع') ||
      norm.includes('سعرعرضقطعة')
    ) {
      colMap.promoPiecePrice = idx;
    }
    // 19. لينك الصوره (Image URL / Link)
    else if (
      norm === 'لينكالصوره' ||
      norm === 'لينكالصورة' ||
      norm === 'رابطالصورة' ||
      norm === 'رابطالصوره' ||
      norm.includes('لينكالصور') ||
      norm.includes('لينك') ||
      norm.includes('صوره') ||
      norm.includes('صورة') ||
      norm.includes('image') ||
      norm.includes('url')
    ) {
      colMap.imageUrl = idx;
    }
    // Fallback piece price
    else if (
      norm === 'سعرالقطعة' ||
      norm === 'سعرالقطعه' ||
      norm === 'سعرالبيع' ||
      norm === 'salesprice' ||
      norm.includes('salesprice') ||
      norm.includes('سعرالقطعة') ||
      norm.includes('سعرالقطعه') ||
      norm.includes('سعرالبيع')
    ) {
      colMap.salesPrice = idx;
      colMap.piecePrice = idx;
    }
    // General matchers fallback
    else if (norm.includes('كود') || norm.includes('code')) {
      if (colMap.code === -1) colMap.code = idx;
    } else if (norm.includes('اسم') || norm.includes('البيان')) {
      if (colMap.name === -1) colMap.name = idx;
    } else if (norm.includes('اولويه') || norm.includes('priority')) {
      colMap.salesPriority = idx;
    } else if (norm.includes('تصنيف') || norm.includes('category')) {
      colMap.category = idx;
    } else if (norm.includes('حاله') || norm.includes('status')) {
      colMap.status = idx;
    } else if (norm.includes('قسم') || norm.includes('department')) {
      if (colMap.department === -1) colMap.department = idx;
    } else if (norm.includes('باركود') || norm.includes('barcode')) {
      colMap.barcode = idx;
    } else if (norm.includes('فرع') || norm.includes('branch')) {
      colMap.branchName = idx;
    }
  });

  // Positional fallback for the exact 19 columns:
  // [الكود الموحد, كود المنتج, اسم المنتج, الحجم, عدد القطع, سعر الكرتونه, Item group, Family Name, اللون, البحيرة, الفيوم, القاهرة, المنيا, ديمشلت, مخزون اكتوبر, منوف, منيا القمح, سعر العرض, لينك الصوره]
  if ((colMap.unifiedCode === -1 || colMap.code === -1) && headers.length >= 10) {
    if (colMap.unifiedCode === -1) colMap.unifiedCode = 0;
    if (colMap.code === -1) colMap.code = 1;
    if (colMap.name === -1 && headers.length > 2) colMap.name = 2;
    if (colMap.size === -1 && headers.length > 3) colMap.size = 3;
    if (colMap.factor === -1 && headers.length > 4) { colMap.factor = 4; colMap.cartonQuantity = 4; }
    if (colMap.cartonPrice === -1 && headers.length > 5) colMap.cartonPrice = 5;
    if (colMap.itemGroup === -1 && headers.length > 6) { colMap.itemGroup = 6; colMap.department = 6; }
    if (colMap.familyName === -1 && headers.length > 7) { colMap.familyName = 7; colMap.classification = 7; }
    if (colMap.color === -1 && headers.length > 8) colMap.color = 8;
    if (colMap.stockBeheira === -1 && headers.length > 9) colMap.stockBeheira = 9;
    if (colMap.stockFayoum === -1 && headers.length > 10) colMap.stockFayoum = 10;
    if (colMap.stockCairo === -1 && headers.length > 11) colMap.stockCairo = 11;
    if (colMap.stockMinya === -1 && headers.length > 12) colMap.stockMinya = 12;
    if (colMap.stockDimeshalt === -1 && headers.length > 13) colMap.stockDimeshalt = 13;
    if (colMap.stockOctober === -1 && headers.length > 14) { colMap.stockOctober = 14; colMap.mainWarehouseActual = 14; }
    if (colMap.stockMenouf === -1 && headers.length > 15) colMap.stockMenouf = 15;
    if (colMap.stockMeq === -1 && headers.length > 16) colMap.stockMeq = 16;
    if (colMap.promoPrice === -1 && headers.length > 17) colMap.promoPrice = 17;
    if (colMap.imageUrl === -1 && headers.length > 18) colMap.imageUrl = 18;
  }

  // Track code occurrences to ensure 100% of rows (all 5500+) get unique IDs without overwriting
  const codeOccurrences: Record<string, number> = {};

  // Loop rows
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every((c: any) => c === '' || c === null || c === undefined)) continue;

    const getVal = (colIdx: number) => (colIdx >= 0 && row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]).trim() : '');
    const getNum = (colIdx: number, fallback = 0) => {
      if (colIdx < 0 || row[colIdx] === undefined || row[colIdx] === null) return fallback;
      let rawStr = String(row[colIdx]).trim();
      const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i < 10; i++) {
        rawStr = rawStr.split(arabicNumerals[i]).join(String(i));
      }
      rawStr = rawStr.replace(/,/g, '').replace(/٬/g, '').replace(/٫/g, '.');
      const clean = rawStr.replace(/[^\d.-]/g, '');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? fallback : parsed;
    };

    const rawCode = getVal(colMap.code);
    const rawUnifiedCode = getVal(colMap.unifiedCode);

    // Keep the product-code column authoritative. The unified/model code is only
    // a fallback for rows where the product-code cell is genuinely empty.
    const productCode = cleanProductCode(rawCode);
    const fallbackCode = rawUnifiedCode.replace(/^#/, '').trim();
    const code = productCode || fallbackCode || String(1000 + r);

    let cleanUnified = rawUnifiedCode.trim();
    if (cleanUnified && /^drm[-_]?([0-9a-zA-Z]+)$/i.test(cleanUnified)) {
      cleanUnified = cleanUnified.replace(/^drm[-_]?/i, '');
    }
    const unifiedCode = cleanUnified
      ? (cleanUnified.startsWith('#') ? cleanUnified : `#${cleanUnified}`)
      : undefined;

    const rawName = getVal(colMap.name);
    const fallbackName = getVal(colMap.familyName) || getVal(colMap.itemGroup) || `صنف دريم ${code}`;
    const name = rawName || fallbackName;

    const rawPriority = getVal(colMap.salesPriority);
    let salesPriority: SalesPriority = 'عادي';
    if (rawPriority.includes('مرتفع') || rawPriority.includes('عالي') || rawPriority.toLowerCase().includes('high')) salesPriority = 'مرتفع';
    else if (rawPriority.includes('متوسط') || rawPriority.toLowerCase().includes('med')) salesPriority = 'متوسط';
    else if (rawPriority.includes('منخفض') || rawPriority.toLowerCase().includes('low')) salesPriority = 'منخفض';

    const rawStatus = getVal(colMap.status);
    let status: ItemStatus = 'متاح';
    if (rawStatus.includes('راكد')) status = 'راكد';
    else if (rawStatus.includes('عرض') || rawStatus.includes('promo')) status = 'عرض ترويجي';
    else if (rawStatus.includes('نواقص') || rawStatus.includes('شحيح')) status = 'نواقص';
    else if (rawStatus.includes('موقوف')) status = 'موقوف مؤقتاً';

    // Factor (شدة الكرتونة)
    const factorVal = getNum(colMap.factor > -1 ? colMap.factor : colMap.cartonQuantity, 0);
    const cartonQuantity = factorVal > 0 ? factorVal : 1;

    // Sales Price (سعر القطعة)
    const rawSalesPrice = getNum(colMap.salesPrice > -1 ? colMap.salesPrice : colMap.piecePrice, 0);
    const rawCartonPrice = getNum(colMap.cartonPrice, 0);
    const promoPriceCartonRaw = getNum(colMap.promoPrice, 0);
    const promoPricePieceRaw = getNum(colMap.promoPiecePrice, 0);

    let piecePrice = 0;
    let cartonPrice = 0;

    if (rawSalesPrice > 0) {
      piecePrice = rawSalesPrice;
      cartonPrice = Math.round(piecePrice * cartonQuantity * 100) / 100;
    } else if (rawCartonPrice > 0) {
      cartonPrice = rawCartonPrice;
      piecePrice = cartonQuantity > 0 ? Math.round((cartonPrice / cartonQuantity) * 100) / 100 : cartonPrice;
    }

    // Offer / Promo prices for carton and piece
    let finalPromoCartonPrice: number | undefined = undefined;
    let finalPromoPiecePrice: number | undefined = undefined;

    if (promoPriceCartonRaw > 0) {
      finalPromoCartonPrice = promoPriceCartonRaw;
      finalPromoPiecePrice = cartonQuantity > 0 ? Math.round((promoPriceCartonRaw / cartonQuantity) * 100) / 100 : promoPriceCartonRaw;
    } else if (promoPricePieceRaw > 0) {
      finalPromoPiecePrice = promoPricePieceRaw;
      finalPromoCartonPrice = Math.round(promoPricePieceRaw * cartonQuantity * 100) / 100;
    }

    // Item group and Family Name
    const rawItemGroup = getVal(colMap.itemGroup) || getVal(colMap.department) || getVal(colMap.category) || 'عام';
    const itemGroup = rawItemGroup.trim();
    const rawFamilyName = getVal(colMap.familyName) || getVal(colMap.classification) || 'أصناف عامة';
    const familyName = rawFamilyName.trim();

    // Multi-branch stocks for all 8 company warehouses
    const stockBeheira = colMap.stockBeheira > -1 ? getNum(colMap.stockBeheira, 0) : 0;
    const stockFayoum = colMap.stockFayoum > -1 ? getNum(colMap.stockFayoum, 0) : 0;
    const stockCairo = colMap.stockCairo > -1 ? getNum(colMap.stockCairo, 0) : 0;
    const stockMinya = colMap.stockMinya > -1 ? getNum(colMap.stockMinya, 0) : 0;
    const stockDimeshalt = colMap.stockDimeshalt > -1 ? getNum(colMap.stockDimeshalt, 0) : 0;
    const stockOctober = colMap.stockOctober > -1 ? getNum(colMap.stockOctober, 0) : getNum(colMap.mainWarehouseActual, 0);
    const stockMenouf = colMap.stockMenouf > -1 ? getNum(colMap.stockMenouf, 0) : 0;
    const stockMeq = colMap.stockMeq > -1 ? getNum(colMap.stockMeq, 0) : 0;

    const branchStocks: Record<string, number> = {
      // Beheira
      'فرع البحيرة': stockBeheira,
      'البحيرة': stockBeheira,
      // Fayoum
      'فرع الفيوم': stockFayoum,
      'الفيوم': stockFayoum,
      // Cairo
      'فرع القاهرة': stockCairo,
      'القاهرة': stockCairo,
      // Minya
      'فرع المنيا': stockMinya,
      'المنيا': stockMinya,
      // Dimeshalt
      'فرع ديمشلت': stockDimeshalt,
      'ديمشلت': stockDimeshalt,
      // October Central Warehouse
      'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)': stockOctober,
      'مخزون اكتوبر': stockOctober,
      'مخزون أكتوبر': stockOctober,
      'فرع أكتوبر': stockOctober,
      'أكتوبر': stockOctober,
      // Menouf
      'فرع منوف': stockMenouf,
      'منوف': stockMenouf,
      // Minya El Qamh
      'فرع منيا القمح': stockMeq,
      'منيا القمح': stockMeq,
    };

    // Calculate default branch stock if specific branch column was present
    const rawBranchStock = colMap.branchStockActual > -1 ? getNum(colMap.branchStockActual, stockCairo || stockBeheira || 0) : (stockCairo || stockBeheira || 0);

    const rawImg = cleanGoogleSheetImageUrl(getVal(colMap.imageUrl));
    const sizeVal = getVal(colMap.size) || '';
    const colorVal = getVal(colMap.color) || '';

    // Generate distinct product ID to guarantee preservation of all rows and prevent unwanted code merging
    const baseCode = (code || `prd_${r}`).replace(/\s+/g, '_').toLowerCase();
    const cleanUnifiedSlug = unifiedCode ? `_u${unifiedCode.replace(/[^a-zA-Z0-9]/g, '')}` : '';
    const cleanName = (name || '').replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '_').slice(0, 20).toLowerCase();
    const colorSlug = colorVal ? `_${colorVal.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '_').toLowerCase()}` : '';
    const sizeSlug = sizeVal ? `_${sizeVal.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '_').toLowerCase()}` : '';
    
    // Each row gets a distinct ID to completely prevent code merging as requested by user
    const deterministicId = `prod-${baseCode}${cleanUnifiedSlug}${cleanName ? '_' + cleanName : ''}${colorSlug}${sizeSlug}_r${r}`;

    const product: Product = {
      id: deterministicId,
      code: code,
      unifiedCode: unifiedCode,
      name: name || `صنف دريم ${code}`,
      salesPriority: salesPriority,
      category: itemGroup,
      status: status,
      cartonQuantity: cartonQuantity,
      factor: cartonQuantity,
      size: sizeVal,
      color: colorVal,
      branchStockActual: rawBranchStock,
      branchStockReserved: rawBranchStock,
      mainWarehouseActual: stockOctober,
      mainWarehouseReserved: stockOctober,
      branchStocks: branchStocks,
      department: itemGroup,
      itemGroup: itemGroup,
      classification: familyName,
      familyName: familyName,
      promoPrice: finalPromoCartonPrice,
      promoPiecePrice: finalPromoPiecePrice,
      offerPrice: finalPromoCartonPrice,
      piecePrice: piecePrice,
      salesPrice: piecePrice,
      cartonPrice: cartonPrice,
      branchName: normalizeExcelBranchName(getVal(colMap.branchName)),
      imageUrl: rawImg || undefined,
      cloudinaryPublicId: code,
      barcode: getVal(colMap.barcode) || undefined,
    };

    products.push(product);
  }

  return {
    products,
    errors,
    totalRows: products.length,
  };
}

/**
 * Smart Excel / CSV file parser for Dream Distribution product inventory
 */
export async function parseExcelProducts(file: File): Promise<{
  products: Product[];
  errors: string[];
  totalRows: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = parseExcelOrCsvBuffer(buffer, file.name);

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        const result = parseRawRowsToProducts(rawRows);
        resolve(result);
      } catch (err: any) {
        resolve({
          products: [],
          errors: [`فشل في قراءة الملف: ${err?.message || 'خطأ غير معروف'}`],
          totalRows: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        products: [],
        errors: ['حدث خطأ أثناء قراءة الملف من الجهاز'],
        totalRows: 0,
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Fetch and parse data live from Google Sheets URL
 */
export async function fetchAndParseGoogleSheet(googleSheetUrlOrId: string): Promise<{
  products: Product[];
  errors: string[];
  totalRows: number;
}> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(googleSheetUrlOrId);
  if (!csvUrl) {
    return {
      products: [],
      errors: ['رابط Google Sheets غير صالح. يرجى التأكد من نسخ رابط الشيت كاملاً.'],
      totalRows: 0,
    };
  }

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) {
      throw new Error(`تعذر جلب الشيت (كود ${response.status}). يرجى التأكد من أن الشيت منشور للعامة (Anyone with the link can view).`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const csvText = decodeBufferSmart(arrayBuffer).replace(/^\uFEFF/, '');
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('تم جلب الشيت لكنه لا يحتوي على أي بيانات.');
    }

    const workbook = XLSX.read(csvText, { type: 'string', codepage: 65001 });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    return parseRawRowsToProducts(rawRows);
  } catch (err: any) {
    return {
      products: [],
      errors: [err.message || 'فشل الاتصال بـ Google Sheets'],
      totalRows: 0,
    };
  }
}

/**
 * Build Complete Invoice Excel Workbook (Executive Tax Layout with Structured Grid, RTL & Multi-tabs)
 */
export function buildInvoiceExcelWorkbook(invoice: Invoice): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const {
    debtBefore,
    debtAfter,
    creditLimit,
    isExceeded,
    requiredDown,
    matchedCustomer,
  } = resolveCustomerFinancials(invoice);

  const resolvedCustomerCode = resolveSafeCustomerCode(invoice, matchedCustomer);

  const titleRows = [
    ['شركة دريم للتجارة والتوزيع - مجموعة الطنطاوي (TANTAWY GROUP)'],
    ['فاتورة مبيعات إلكترونية معتمدة - إذن صرف واستلام بضاعة وموقف حساب العميل'],
    [],
    // Row 4: Invoice Meta
    ['رقم الفاتورة:', invoice.invoiceNumber, '', 'تاريخ الإصدار:', invoice.date, '', 'وقت الإصدار:', invoice.time || '', '', 'طريقة السداد:', invoice.paymentMethod],
    // Row 5: Customer Meta
    ['اسم العميل / المحل:', invoice.customerName, '', 'كود العميل:', resolvedCustomerCode, '', 'هاتف العميل:', invoice.customerPhone || '---', '', 'الرقم الضريبي:', invoice.customerTaxNumber || '---'],
    // Row 6: Organization Meta
    ['الفرع المنفذ:', invoice.branchName, '', 'المندوب المسؤول:', invoice.repName, '', 'المشرف المعتمد:', invoice.supervisorName || '---', '', 'حالة الفاتورة:', invoice.status],
    // Row 7: Warehouse Meta
    ['مستودع الصرف:', invoice.items.some((it) => it.fulfilledFrom === 'main_warehouse') ? 'مخزن 6 أكتوبر المركزي + الفرع' : invoice.branchName, '', 'إجمالي الكراتين:', `${invoice.totalCartons} كرتونة`, '', 'إجمالي القطع:', `${invoice.totalPieces} قطعة`, '', 'النوع:', (invoice.isShortageInvoice || invoice.invoiceNumber?.endsWith('-NQ')) ? 'فاتورة نواقص (-NQ)' : 'فاتورة مبيعات'],
    [],
    // Row 9-10: Financial KPI Cards
    ['الموقف المالي والائتماني للعميل:', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [
      'المديونية السابقة:',
      debtBefore,
      '',
      'صافي الفاتورة الحالية:',
      invoice.estimatedGrandTotal,
      '',
      'إجمالي المديونية بعد الفاتورة:',
      debtAfter,
      '',
      'الحد الائتماني المعتمد:',
      creditLimit,
      '',
      '',
      ''
    ],
    [
      'حالة الائتمان:',
      isExceeded ? `⚠️ تجاوز الحد الائتماني (مطلوب دفعة نقدية: ${requiredDown.toLocaleString()} ج.م)` : '✅ الحساب سليم وضمن الحد الائتماني المعتمد',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    ],
    []
  ];

  // Exactly matching the 14 columns of the in-app Excel Invoice Preview Modal
  const tableHeaders = [
    'م',
    'كود الصنف',
    'الكود الموحد',
    'اسم الصنف والبيان التفصيلي',
    'شدة',
    'كرتون',
    'قطع',
    'إجمالي القطع',
    'سعر كرتونة',
    'سعر قطعة',
    'الإجمالي',
    'الخصم',
    'الصافي',
    'مصدر الصرف'
  ];

  const itemRows = invoice.items.map((item, index) => {
    const cartonQty = item.cartonQuantity || 1;
    const cCount = item.cartonCount || 0;
    const pCount = item.pieceCount || 0;
    const totalPcs = item.totalUnits || (cCount * cartonQty + pCount);
    const pieceP = item.pricePerPiece || (cartonQty > 0 ? Math.round(((item.pricePerCarton || item.appliedPrice) / cartonQty) * 100) / 100 : 0);
    const unified = item.unifiedCode || (item.product as any)?.unifiedCode || '---';
    const cleanPCode = cleanProductCode(item.productCode);
    const fulfillmentSource = item.fulfilledFrom === 'main_warehouse' ? 'مخزن 6 أكتوبر المركزي (نواقص)' : (invoice.branchName || 'مخزن الفرع');

    return [
      index + 1,
      cleanPCode,
      unified,
      item.productName,
      cartonQty,
      cCount,
      pCount,
      totalPcs,
      item.pricePerCarton || item.appliedPrice,
      pieceP,
      item.totalBeforeTax,
      item.discountAmount > 0 ? -item.discountAmount : 0,
      item.netTotal,
      fulfillmentSource
    ];
  });

  const summaryRows = [
    [],
    ['', '', '', '', '', '', '', '', '', '', 'إجمالي البضاعة قبل الخصم:', '', invoice.subtotal, ''],
    ['', '', '', '', '', '', '', '', '', '', `إجمالي الخصم التجاري (${invoice.discountPercentage}%):`, '', invoice.discountAmount > 0 ? -invoice.discountAmount : 0, ''],
    ['', '', '', '', '', '', '', '', '', '', 'الإجمالي النهائي المطلوب سداده (الصافي):', '', invoice.estimatedGrandTotal, ''],
    ['', '', '', '', '', '', '', '', '', '', 'المديونية السابقة للعميل:', '', debtBefore, ''],
    ['', '', '', '', '', '', '', '', '', '', 'إجمالي مديونية العميل بعد الفاتورة:', '', debtAfter, ''],
    ['', '', '', '', '', '', '', '', '', '', 'الحد الائتماني المعتمد للعميل:', '', creditLimit, ''],
    ['', '', '', '', '', '', '', '', '', '', 'الدفعة النقدية المطلوب تحصيلها فوراً:', '', isExceeded ? requiredDown : 0, ''],
    [],
    ['ملاحظات الفاتورة والتسليم:', invoice.notes || 'بضاعة مستلمة كاملة وبحالة جيدة ومطابقة للمواصفات.'],
    ['رسالة تقدير:', '✨ شكرًا لتعاملكم مع شركة دريم للتجارة والتوزيع - مجموعة الطنطاوي ❤️'],
    [`خدمة العملاء والشكاوى: ${COMPANY_INFO.customerService}`, 'الإدارة العامة والمخازن المركزية: المنطقة الصناعية - 6 أكتوبر - الجيزة'],
    [],
    ['توقيع واستلام العميل / المحل:', '', 'مندوب التوزيع والتسليم:', '', 'أمين مخزن الصرف:', '', 'اعتماد الإدارة والحسابات:', ''],
    ['....................................', '', `................ (${invoice.repName})`, '', '....................................', '', '....................................', '']
  ];

  const fullSheetData = [...titleRows, tableHeaders, ...itemRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);
  const lastColumn = tableHeaders.length - 1; // index 13 (N)
  const lastRow = fullSheetData.length - 1;

  // Merged headers and executive layout
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 2 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } },
    { s: { r: 4, c: 1 }, e: { r: 4, c: 2 } },
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } },
    { s: { r: 5, c: 1 }, e: { r: 5, c: 2 } },
    { s: { r: 5, c: 4 }, e: { r: 5, c: 5 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: lastColumn } },
    { s: { r: 10, c: 1 }, e: { r: 10, c: lastColumn } },
  ];
  ws['!freeze'] = { xSplit: 0, ySplit: titleRows.length + 1 };
  ws['!autofilter'] = { ref: `A${titleRows.length + 1}:N${titleRows.length + 1 + itemRows.length}` };
  ws['!sheetView'] = [{ rightToLeft: true }];
  ws['!views'] = [{ RTL: true }];
  ws['!rows'] = fullSheetData.map((_, rowIndex) => ({
    hpt: rowIndex === 0 ? 34 : rowIndex === 1 ? 26 : rowIndex === titleRows.length ? 28 : 22,
  }));

  const applyRangeStyle = (range: string, style: Record<string, unknown>) => {
    const decoded = XLSX.utils.decode_range(range);
    for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
      for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
        const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
        if (cell) cell.s = { ...(cell.s || {}), ...style };
      }
    }
  };

  const navy = '0F2942';
  const slateBlue = '1E3A5F';
  const gold = 'C88A2B';
  const paleGold = 'FEF3C7';
  const paleBlue = 'F8FAFC';
  const softGreen = 'DCFCE7';
  const borderColor = 'CBD5E1';

  const baseCellStyle = {
    font: { name: 'Segoe UI', sz: 10, color: { rgb: '1E293B' } },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: borderColor } },
      bottom: { style: 'thin', color: { rgb: borderColor } },
      left: { style: 'thin', color: { rgb: borderColor } },
      right: { style: 'thin', color: { rgb: borderColor } },
    },
  };

  applyRangeStyle(`A1:N${lastRow + 1}`, baseCellStyle);

  // Row 1 & 2: Header Banners
  applyRangeStyle('A1:N1', {
    font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 16 },
    fill: { fgColor: { rgb: navy } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'medium', color: { rgb: gold } } }
  });
  applyRangeStyle('A2:N2', {
    font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: slateBlue } },
    alignment: { horizontal: 'center', vertical: 'center' }
  });

  // Rows 4-7: Metadata Cards
  applyRangeStyle('A4:N7', {
    fill: { fgColor: { rgb: 'F8FAFC' } },
    font: { name: 'Segoe UI', sz: 10, color: { rgb: '1E293B' } }
  });

  // Row 9: Financial Section Title
  applyRangeStyle('A9:N9', {
    font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill: { fgColor: { rgb: navy } },
    alignment: { horizontal: 'right', vertical: 'center' }
  });

  // Row 10: Financial Values Row
  applyRangeStyle('A10:N10', {
    fill: { fgColor: { rgb: 'F1F5F9' } },
    font: { name: 'Segoe UI', bold: true, color: { rgb: '0F172A' }, sz: 10.5 }
  });

  // Row 11: Credit Status Banner
  applyRangeStyle('A11:N11', {
    fill: { fgColor: { rgb: isExceeded ? paleGold : softGreen } },
    font: { name: 'Segoe UI', bold: true, color: { rgb: isExceeded ? '92400E' : '166534' }, sz: 10.5 }
  });

  // Table Headers Row
  applyRangeStyle(`A${titleRows.length + 1}:N${titleRows.length + 1}`, {
    font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10.5 },
    fill: { fgColor: { rgb: navy } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { top: { style: 'medium', color: { rgb: gold } }, bottom: { style: 'medium', color: { rgb: gold } } }
  });

  // Zebra striping for item rows
  for (let itemIndex = 0; itemIndex < itemRows.length; itemIndex += 1) {
    if (itemIndex % 2 === 0) {
      applyRangeStyle(`A${titleRows.length + 2 + itemIndex}:N${titleRows.length + 2 + itemIndex}`, {
        fill: { fgColor: { rgb: paleBlue } }
      });
    }
  }

  // Summary Rows Styling
  const summaryStartRow = titleRows.length + 2 + itemRows.length;
  applyRangeStyle(`K${summaryStartRow}:M${summaryStartRow + 7}`, {
    alignment: { horizontal: 'right', vertical: 'center' },
    font: { name: 'Segoe UI', bold: true, color: { rgb: '1E293B' } }
  });

  // Grand Total Highlight Row
  const grandTotalRow = summaryStartRow + 3;
  applyRangeStyle(`K${grandTotalRow}:M${grandTotalRow}`, {
    fill: { fgColor: { rgb: paleGold } },
    font: { name: 'Segoe UI', bold: true, color: { rgb: '92400E' }, sz: 11.5 },
    border: {
      top: { style: 'thin', color: { rgb: gold } },
      bottom: { style: 'double', color: { rgb: gold } },
      left: { style: 'thin', color: { rgb: gold } },
      right: { style: 'thin', color: { rgb: gold } }
    }
  });

  ws['!cols'] = [
    { wch: 6 },   // م
    { wch: 15 },  // كود الصنف
    { wch: 15 },  // الكود الموحد
    { wch: 38 },  // اسم الصنف والبيان التفصيلي
    { wch: 10 },  // شدة
    { wch: 10 },  // كرتون
    { wch: 10 },  // قطع
    { wch: 14 },  // إجمالي القطع
    { wch: 14 },  // سعر كرتونة
    { wch: 14 },  // سعر قطعة
    { wch: 16 },  // الإجمالي
    { wch: 14 },  // الخصم
    { wch: 16 },  // الصافي
    { wch: 22 }   // مصدر الصرف
  ];

  XLSX.utils.book_append_sheet(wb, ws, `فاتورة_${invoice.invoiceNumber}`);

  // Tab 2: ERP Accounting Table (Auto-included in the official workbook)
  try {
    const erpItemHeaders = [
      'رقم الفاتورة',
      'تاريخ الفاتورة',
      'كود المندوب',
      'اسم المندوب',
      'اسم الفرع',
      'كود العميل',
      'اسم العميل',
      'رقم هاتف العميل',
      'كود الصنف',
      'الكود الموحد (#)',
      'اسم الصنف',
      'شدة الكرتونة',
      'عدد الكراتين',
      'قطع فردية',
      'إجمالي القطع',
      'سعر الكرتونة',
      'سعر القطعة',
      'الإجمالي قبل الخصم',
      'نسبة خصم الفاتورة %',
      'قيمة الخصم للصنف',
      'الصافي النهائي',
      'مصدر الصرف',
      'طريقة الدفع',
      'حالة الفاتورة'
    ];

    const erpRows = invoice.items.map((item) => {
      const cartonQty = item.cartonQuantity || 1;
      const cCount = item.cartonCount || 0;
      const pCount = item.pieceCount || 0;
      const totalPcs = item.totalUnits || (cCount * cartonQty + pCount);
      const pieceP = item.pricePerPiece || (cartonQty > 0 ? Math.round(((item.pricePerCarton || item.appliedPrice) / cartonQty) * 100) / 100 : 0);
      const unified = item.unifiedCode || (item.product as any)?.unifiedCode || '---';

      return [
        invoice.invoiceNumber,
        invoice.date,
        invoice.repId || '',
        invoice.repName,
        invoice.branchName,
        resolvedCustomerCode,
        invoice.customerName,
        invoice.customerPhone || '',
        cleanProductCode(item.productCode),
        unified,
        item.productName,
        cartonQty,
        cCount,
        pCount,
        totalPcs,
        item.pricePerCarton || item.appliedPrice,
        pieceP,
        item.totalBeforeTax,
        invoice.discountPercentage || 0,
        item.discountAmount || 0,
        item.netTotal,
        item.fulfilledFrom === 'main_warehouse' ? 'مخزن مركزي - 6 أكتوبر' : invoice.branchName,
        invoice.paymentMethod,
        invoice.status
      ];
    });

    const wsErp = XLSX.utils.aoa_to_sheet([erpItemHeaders, ...erpRows]);
    wsErp['!views'] = [{ RTL: true }];
    wsErp['!sheetView'] = [{ rightToLeft: true }];
    wsErp['!cols'] = [
      { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 22 },
      { wch: 14 }, { wch: 25 }, { wch: 16 }, { wch: 14 }, { wch: 16 },
      { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
      { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 18 }
    ];

    // Style Header & Cells for Tab 2
    const erpRange = XLSX.utils.decode_range(wsErp['!ref'] || 'A1:X1');
    for (let r = erpRange.s.r; r <= erpRange.e.r; r++) {
      for (let c = erpRange.s.c; c <= erpRange.e.c; c++) {
        const cell = wsErp[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (r === 0) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
            fill: { fgColor: { rgb: navy } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: { bottom: { style: 'medium', color: { rgb: gold } } }
          };
        } else {
          cell.s = {
            font: { name: 'Segoe UI', sz: 9.5, color: { rgb: '1E293B' } },
            fill: r % 2 === 0 ? { fgColor: { rgb: paleBlue } } : undefined,
            alignment: { vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: borderColor } },
              bottom: { style: 'thin', color: { rgb: borderColor } },
              left: { style: 'thin', color: { rgb: borderColor } },
              right: { style: 'thin', color: { rgb: borderColor } }
            }
          };
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, wsErp, 'بيانات_السيستم_ERP');

    // Tab 3: Customer Credit & Statement Audit
    const creditHeaders = [
      ['شركة دريم للتجارة والتوزيع - كشف الحساب والائتمان المعتمد'],
      [`العميل: ${invoice.customerName} (كود: ${resolvedCustomerCode})`],
      [],
      ['البيان المالي', 'المبلغ (ج.م)', 'ملاحظات وتدقيق الحساب'],
      ['المديونية السابقة قبل الفاتورة', debtBefore, 'رصيد سابق مسجل بالسيستم'],
      ['قيمة فاتورة المبيعات الحالية', invoice.estimatedGrandTotal, `فاتورة رقم ${invoice.invoiceNumber}`],
      ['إجمالي المديونية بعد الفاتورة', debtAfter, 'الرصيد التراكمي النهائي المطلوب سداده'],
      ['الحد الائتماني المعتمد للعميل', creditLimit, 'السقف المالي الائتماني المصرح به'],
      ['موقف الائتمان', isExceeded ? '⚠️ تجاوز الحد الائتماني' : '✅ ضمن الحد المسموح', isExceeded ? `دفعة نقدية مطلوبة: ${requiredDown.toLocaleString()} ج.م` : 'حساب سليم ومطابق للشروط'],
      [],
      ['مندوب التسليم:', invoice.repName, 'تاريخ وتوقيت الإصدار:', `${invoice.date} ${invoice.time || ''}`]
    ];
    const wsCredit = XLSX.utils.aoa_to_sheet(creditHeaders);
    wsCredit['!views'] = [{ RTL: true }];
    wsCredit['!sheetView'] = [{ rightToLeft: true }];
    wsCredit['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 38 }];

    // Style Tab 3
    const creditRange = XLSX.utils.decode_range(wsCredit['!ref'] || 'A1:C11');
    for (let r = creditRange.s.r; r <= creditRange.e.r; r++) {
      for (let c = creditRange.s.c; c <= creditRange.e.c; c++) {
        const cell = wsCredit[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        if (r === 0) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 14 },
            fill: { fgColor: { rgb: navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        } else if (r === 1) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
            fill: { fgColor: { rgb: slateBlue } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        } else if (r === 3) {
          cell.s = {
            font: { name: 'Segoe UI', bold: true, color: { rgb: 'FFFFFF' }, sz: 10.5 },
            fill: { fgColor: { rgb: navy } },
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        } else if (r >= 4 && r <= 8) {
          cell.s = {
            font: { name: 'Segoe UI', sz: 10, bold: r === 6 || r === 8, color: { rgb: '0F172A' } },
            fill: r === 8 ? { fgColor: { rgb: isExceeded ? paleGold : softGreen } } : (r % 2 === 0 ? { fgColor: { rgb: paleBlue } } : undefined),
            alignment: { vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: borderColor } },
              bottom: { style: 'thin', color: { rgb: borderColor } },
              left: { style: 'thin', color: { rgb: borderColor } },
              right: { style: 'thin', color: { rgb: borderColor } }
            }
          };
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, wsCredit, 'موقف_الائتمان_والحساب');
  } catch (err) {
    console.warn('Failed to append auxiliary tabs to workbook, standard sheet preserved:', err);
  }

  return wb;
}

/**
 * Export and download invoice directly to user's device as XLSX
 */
export function exportInvoiceToExcel(invoice: Invoice): void {
  const wb = buildInvoiceExcelWorkbook(invoice);
  const safeCustomer = (invoice.customerName || 'عميل').replace(/[^\w\u0621-\u064A]/g, '_');
  XLSX.writeFile(wb, `فاتورة_دريم_طنطاوي_${invoice.invoiceNumber}_${safeCustomer}.xlsx`, { cellStyles: true });
}

/**
 * Generate Base64 string of the Excel invoice for Microsoft Power Automate / Webhook sync
 */
export function generateInvoiceExcelBase64(invoice: Invoice): string {
  const wb = buildInvoiceExcelWorkbook(invoice);
  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64', cellStyles: true });
}

/**
 * Direct Dual Download: Downloads both PDF and Excel files directly to the device sequentially
 */
export async function downloadInvoiceBoth(
  invoice: Invoice,
  customCompanyInfo?: Record<string, any>
): Promise<void> {
  const { downloadInvoicePDF } = await import('./pdfService');
  // 1. Download PDF directly to rep device
  await downloadInvoicePDF(invoice, customCompanyInfo);
  // 2. Wait 600ms so mobile/desktop browsers don't block concurrent file downloads
  await new Promise((resolve) => setTimeout(resolve, 600));
  // 3. Download Excel directly to rep device
  exportInvoiceToExcel(invoice);
}

/**
 * Export Invoice specifically tailored for ERP / Accounting Main System Upload
 * Includes clean columnar data designed for direct copy-paste or automatic ERP file ingestion
 */
export function exportInvoiceForERP(invoice: Invoice): void {
  const wb = XLSX.utils.book_new();

  // Tab 1: ERP Item Details (Main import table for accounting software)
  const erpItemHeaders = [
    'رقم الفاتورة',
    'تاريخ الفاتورة',
    'كود المندوب',
    'اسم المندوب',
    'اسم الفرع',
    'كود العميل',
    'اسم العميل',
    'رقم هاتف العميل',
    'كود الصنف',
    'الكود الموحد (#)',
    'اسم الصنف',
    'القسم',
    'شدة الكرتونة',
    'عدد الكراتين',
    'قطع فردية',
    'إجمالي القطع',
    'سعر الكرتونة',
    'سعر القطعة',
    'الإجمالي قبل الخصم',
    'نسبة خصم الفاتورة %',
    'قيمة الخصم للصنف',
    'الصافي النهائي',
    'مصدر الصرف',
    'طريقة الدفع',
    'حالة الفاتورة'
  ];

  const erpItemRows = invoice.items.map((item) => {
    const cartonQty = item.cartonQuantity || 1;
    const cCount = item.cartonCount || 0;
    const pCount = item.pieceCount || 0;
    const totalPcs = item.totalUnits || (cCount * cartonQty + pCount);
    const pieceP = item.pricePerPiece || (cartonQty > 0 ? Math.round(((item.pricePerCarton || item.appliedPrice) / cartonQty) * 100) / 100 : 0);
    const unified = item.unifiedCode || (item.product as any)?.unifiedCode || '---';

    return [
      invoice.invoiceNumber,
      invoice.date,
      invoice.repId || '',
      invoice.repName,
      invoice.branchName,
      invoice.customerCode || '',
      invoice.customerName,
      invoice.customerPhone || '',
      item.productCode,
      unified,
      item.productName,
      item.fulfilledFrom === 'main_warehouse' ? 'مخزن مركزي (أكتوبر)' : 'فرع',
      cartonQty,
      cCount,
      pCount,
      totalPcs,
      item.pricePerCarton || item.appliedPrice,
      pieceP,
      item.totalBeforeTax,
      invoice.discountPercentage || 0,
      item.discountAmount || 0,
      item.netTotal,
      item.fulfilledFrom === 'main_warehouse' ? 'المخزن المركزي - 6 أكتوبر' : invoice.branchName,
      invoice.paymentMethod,
      invoice.status
    ];
  });

  const wsItems = XLSX.utils.aoa_to_sheet([erpItemHeaders, ...erpItemRows]);
  wsItems['!cols'] = [
    { wch: 16 }, // رقم الفاتورة
    { wch: 14 }, // التاريخ
    { wch: 12 }, // كود المندوب
    { wch: 18 }, // اسم المندوب
    { wch: 22 }, // اسم الفرع
    { wch: 14 }, // كود العميل
    { wch: 25 }, // اسم العميل
    { wch: 16 }, // هاتف العميل
    { wch: 14 }, // كود الصنف
    { wch: 32 }, // اسم الصنف
    { wch: 16 }, // القسم
    { wch: 12 }, // شدة الكرتونة
    { wch: 12 }, // عدد الكراتين
    { wch: 12 }, // قطع فردية
    { wch: 14 }, // إجمالي القطع
    { wch: 14 }, // سعر الكرتونة
    { wch: 14 }, // سعر القطعة
    { wch: 16 }, // الإجمالي قبل الخصم
    { wch: 16 }, // نسبة الخصم
    { wch: 16 }, // قيمة الخصم
    { wch: 16 }, // الصافي النهائي
    { wch: 24 }, // مصدر الصرف
    { wch: 16 }, // طريقة الدفع
    { wch: 18 }  // الحالة
  ];
  XLSX.utils.book_append_sheet(wb, wsItems, 'أصناف_الفاتورة_للسيستم_ERP');

  // Tab 2: Header Summary (Invoice Level)
  const {
    debtBefore,
    debtAfter,
    creditLimit,
    isExceeded,
    requiredDown,
  } = resolveCustomerFinancials(invoice);

  const headerData = [
    ['رقم الفاتورة', invoice.invoiceNumber],
    ['التاريخ', `${invoice.date} ${invoice.time || ''}`],
    ['المندوب', invoice.repName],
    ['المشرف', invoice.supervisorName || 'الإدارة المركزية'],
    ['الفرع', invoice.branchName],
    ['اسم العميل', invoice.customerName],
    ['هاتف العميل', invoice.customerPhone || ''],
    ['عنوان العميل', invoice.customerAddress || ''],
    ['الرقم الضريبي للعميل', invoice.customerTaxNumber || ''],
    ['مديونية العميل السابقة', debtBefore],
    ['إجمالي المديونية بعد الفاتورة', debtAfter],
    ['الحد الائتماني المعتمد', creditLimit],
    ['حالة الحد الائتماني', isExceeded ? '⚠️ تجاوز الحد الائتماني' : '✅ ضمن الحد المسموح'],
    ['الدفعة النقدية المطلوب تحصيلها فوراً', isExceeded ? requiredDown : 0],
    ['إجمالي عدد الكراتين', invoice.totalCartons],
    ['إجمالي عدد القطع', invoice.totalPieces],
    ['إجمالي القيمة قبل الخصم', invoice.subtotal],
    ['نسبة الخصم %', invoice.discountPercentage],
    ['قيمة الخصم الإجمالي', invoice.discountAmount],
    ['الصافي النهائي المستحق', invoice.estimatedGrandTotal],
    ['طريقة السداد', invoice.paymentMethod],
    ['حالة الفاتورة', invoice.status],
    ['ملاحظات الفاتورة', invoice.notes || '']
  ];
  const wsHeader = XLSX.utils.aoa_to_sheet(headerData);
  wsHeader['!cols'] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsHeader, 'بيانات_الفاتورة_الرئيسية');

  XLSX.writeFile(wb, `ERP_رفع_فاتورة_${invoice.invoiceNumber}_${invoice.customerName.replace(/[^\w\u0621-\u064A]/g, '_')}.xlsx`);
}

/**
 * Convert 2D array of rows to Customer list
 */
export function parseRawRowsToCustomers(rawRows: any[]): {
  customers: Customer[];
  errors: string[];
  totalRows: number;
} {
  if (!rawRows || rawRows.length < 2) {
    return {
      customers: [],
      errors: ['الملف فارغ أو لا يحتوي على صفوف عملاء صالحة'],
      totalRows: 0,
    };
  }

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i];
    const hasCodeOrName = row.some((cell: any) => {
      const str = String(cell);
      return str.includes('كود') || str.includes('عميل') || str.includes('اسم') || str.includes('phone') || str.includes('محل');
    });
    if (hasCodeOrName) {
      headerRowIndex = i;
      break;
    }
  }

  const headers: string[] = rawRows[headerRowIndex].map((h: any) => String(h).trim());
  const errors: string[] = [];
  const customers: Customer[] = [];

  // Customer sheet priority columns: كود العميل | اسم العميل | الفرع التابع له | اسم المندوب | الحد الائتماني | المديونية
  const colMap: Record<string, number> = {
    code: -1,
    name: -1,
    branchName: -1,
    repName: -1,
    phone: -1,
    address: -1,
    taxNumber: -1,
    tier: -1,
    creditLimit: -1,
    balance: -1,
    totalOverdueAndDue: -1,
    overdueBalance: -1,
    dueBalance: -1,
    notes: -1,
  };

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    
    // 1. Check Sales Rep first (to prevent "اسم المندوب" from being captured as customer name)
    if (
      norm.includes('اسمالمندوب') ||
      norm.includes('اسمالبائع') ||
      norm.includes('المندوبالمسؤول') ||
      norm.includes('المندوبالمسئول') ||
      norm.includes('المندوبالمشرف') ||
      norm.includes('مندوبالمبيعات') ||
      norm.includes('مسؤولالمبيعات') ||
      norm.includes('مسئولالمبيعات') ||
      norm.includes('مسوولالمبيعات') ||
      norm.includes('مسؤولالتوزيع') ||
      norm.includes('مسئولالتوزيع') ||
      norm.includes('مسؤولالخط') ||
      norm.includes('مسئو��الخط') ||
      norm.includes('مندوبالبيع') ||
      norm.includes('كودالمندوب') ||
      norm.includes('المندوب') ||
      norm.includes('مندوب') ||
      norm.includes('بائع') ||
      norm.includes('الموزع') ||
      norm.includes('موزع') ||
      norm.includes('salesrep') ||
      norm.includes('representative') ||
      norm.includes('salesman') ||
      norm.includes('salesperson') ||
      norm.includes('repname') ||
      norm === 'rep'
    ) {
      if (colMap.repName === -1) colMap.repName = idx;
    }
    // 2. Check Branch
    else if (
      norm.includes('اسمالفرع') ||
      norm.includes('فرع') ||
      norm.includes('الفرع') ||
      norm.includes('المنطقه') ||
      norm.includes('منطقة') ||
      norm.includes('branch') ||
      norm.includes('branchname')
    ) {
      if (colMap.branchName === -1) colMap.branchName = idx;
    }
    // 3. Check Customer Code
    else if (
      norm.includes('كودالعميل') ||
      norm.includes('رقمالعميل') ||
      norm.includes('رقمالمحل') ||
      norm.includes('كودالمحل') ||
      norm.includes('كودالحساب') ||
      norm.includes('رقمالحساب') ||
      norm.includes('كود') ||
      norm.includes('code') ||
      norm.includes('cust_id') ||
      norm.includes('custid') ||
      norm.includes('customercode')
    ) {
      if (colMap.code === -1) colMap.code = idx;
    }
    // 4. Check Credit Limit (الحد الائتماني)
    else if (
      norm.includes('حدائتمان') ||
      norm.includes('الحدالائتماني') ||
      norm.includes('الحدالائتمانى') ||
      norm.includes('الحدالائتمان') ||
      norm.includes('الحدالمسموح') ||
      norm.includes('الحدالمسموحبه') ||
      norm.includes('سقفالائتمان') ||
      norm.includes('الائتمانالمعتمد') ||
      norm.includes('حدالائتمان') ||
      norm.includes('حدالبيعالاجل') ||
      norm.includes('حدالدين') ||
      norm.includes('حدالاجل') ||
      norm.includes('حدالآجل') ||
      norm.includes('حدالكريديت') ||
      norm.includes('كريديت') ||
      norm.includes('ائتمان') ||
      norm.includes('الائتمان') ||
      norm.includes('creditlimit') ||
      norm.includes('cred') ||
      norm.includes('limit') ||
      norm.includes('credit')
    ) {
      if (colMap.creditLimit === -1) colMap.creditLimit = idx;
    }
    // 4. Check Total Overdue & Due (إجمالي المتأخرات والمستحق / المتأخرات)
    else if (
      (norm.includes('متاخر') && norm.includes('مستحق')) ||
      norm.includes('المتاخراتوالمستحق') ||
      norm.includes('المتاخراتومستحق') ||
      norm.includes('متاخراتوالمستحق') ||
      norm.includes('متاخراتومستحق') ||
      norm.includes('المستحقوالمتاخرات') ||
      norm.includes('مستحقومتاخرات') ||
      norm.includes('اجماليالمتاخرات') ||
      norm.includes('اجماليمتاخرات') ||
      norm.includes('اجماليالمستحق') ||
      norm.includes('المتاخرات') ||
      norm.includes('متاخرات') ||
      norm.includes('totaloverduedue') ||
      norm.includes('overdueanddue') ||
      norm.includes('totaloverdue') ||
      norm.includes('overdue')
    ) {
      if (colMap.totalOverdueAndDue === -1) colMap.totalOverdueAndDue = idx;
    }
    // 5. Check Balance / Debt (المديونية / الرصيد السابق)
    else if (
      norm.includes('المديونيةالسابقة') ||
      norm.includes('المديونيهالسابقه') ||
      norm.includes('المديونيةالحالية') ||
      norm.includes('المديونيهالحاليه') ||
      norm.includes('مديونيةسابقة') ||
      norm.includes('مديونيهسابقه') ||
      norm.includes('مديونيةالعميل') ||
      norm.includes('مديونيهالعميل') ||
      norm.includes('اجماليالمديونية') ||
      norm.includes('اجماليالمديونيه') ||
      norm.includes('المديونية') ||
      norm.includes('المديونيه') ||
      norm.includes('مديونية') ||
      norm.includes('مديونيه') ||
      norm.includes('الرصيدالافتتاحي') ||
      norm.includes('رصيدافتتاحي') ||
      norm.includes('الرصيدالسابق') ||
      norm.includes('رصيدسابق') ||
      norm.includes('الرصيدالحالي') ||
      norm.includes('رصيدحالي') ||
      norm.includes('رصيدالعميل') ||
      norm.includes('حسابالعميل') ||
      norm.includes('صافيالحساب') ||
      norm.includes('اجماليالحساب') ||
      norm.includes('المستحق') ||
      norm.includes('مستحق') ||
      norm.includes('المتبقي') ||
      norm.includes('متبقي') ||
      norm.includes('الرصيد') ||
      norm.includes('رصيد') ||
      norm.includes('حساب') ||
      norm.includes('عليه') ||
      norm.includes('دائن') ||
      norm.includes('مدين') ||
      norm.includes('اجماليمدين') ||
      norm.includes('رصيددائن') ||
      norm.includes('رصيدمدين') ||
      norm.includes('مديونيهعليه') ||
      norm.includes('مديونيةعليه') ||
      norm.includes('عليهالعميل') ||
      norm.includes('الديون') ||
      norm.includes('ديون') ||
      norm.includes('دفع') ||
      norm.includes('مطلوب') ||
      norm.includes('currentbalance') ||
      norm.includes('prevbalance') ||
      norm.includes('previousbalance') ||
      norm.includes('balance') ||
      norm.includes('debt')
    ) {
      if (colMap.balance === -1) colMap.balance = idx;
    }
    // 6. Check Customer Name
    else if (
      norm.includes('اسمالعميل') ||
      norm.includes('اسمالمحل') ||
      norm.includes('اسمالتاجر') ||
      norm.includes('اسمالزبون') ||
      norm.includes('اسمالشركه') ||
      norm.includes('اسمالشركة') ||
      norm.includes('عميل') ||
      norm.includes('محل') ||
      norm.includes('تاجر') ||
      norm.includes('زبون') ||
      norm.includes('customer') ||
      norm.includes('client') ||
      norm.includes('اسم') ||
      norm.includes('name')
    ) {
      if (colMap.name === -1) colMap.name = idx;
    }
    // 7. Optional extra fields
    else if (
      norm.includes('تليفون') ||
      norm.includes('هاتف') ||
      norm.includes('موبايل') ||
      norm.includes('محمول') ||
      norm.includes('phone') ||
      norm.includes('mobile') ||
      norm.includes('tel')
    ) {
      if (colMap.phone === -1) colMap.phone = idx;
    } else if (
      norm.includes('عنوان') ||
      norm.includes('منطقة') ||
      norm.includes('محافظة') ||
      norm.includes('مدينة') ||
      norm.includes('address') ||
      norm.includes('city')
    ) {
      if (colMap.address === -1) colMap.address = idx;
    } else if (
      norm.includes('تصنيف') ||
      norm.includes('فئة') ||
      norm.includes('فئه') ||
      norm.includes('tier') ||
      norm.includes('درجة') ||
      norm.includes('درجه')
    ) {
      if (colMap.tier === -1) colMap.tier = idx;
    } else if (norm.includes('ضريب') || norm.includes('tax') || norm.includes('سجل')) {
      if (colMap.taxNumber === -1) colMap.taxNumber = idx;
    } else if (norm.includes('ملاحظ') || norm.includes('note')) {
      if (colMap.notes === -1) colMap.notes = idx;
    }
  });

  // Positional fallback if standard 4-column format without specific header keywords
  if (colMap.code === -1 && colMap.name === -1 && headers.length >= 4) {
    colMap.code = 0;
    colMap.name = 1;
    colMap.branchName = 2;
    colMap.repName = 3;
  }

  // Positional fallback for debt & credit if headers weren't matched but sheet has 5+ columns
  if (colMap.balance === -1 && colMap.creditLimit === -1 && headers.length >= 6) {
    colMap.balance = 4;
    colMap.creditLimit = 5;
  }

  const getVal = (row: any[], colIdx: number, def = ''): string => {
    if (colIdx === -1 || colIdx >= row.length) return def;
    const val = row[colIdx];
    if (val === undefined || val === null) return def;
    return String(val)
      .replace(/[\uFFFD\uFEFF\u0000-\u001F\u007F-\u009F]/g, '')
      .trim();
  };

  const customerMap = new Map<string, Customer>();
  let totalRawRowsProcessed = 0;

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c: any) => c === undefined || c === null || String(c).trim() === '')) {
      continue;
    }

    totalRawRowsProcessed++;

    const rawName = getVal(row, colMap.name);
    const rawCode = getVal(row, colMap.code);
    const rawPhone = getVal(row, colMap.phone);
    const rawAddress = getVal(row, colMap.address);
    const rawBranch = getVal(row, colMap.branchName);
    const rawRep = getVal(row, colMap.repName);
    const rawTax = getVal(row, colMap.taxNumber);
    const rawNotes = getVal(row, colMap.notes);

    // Skip empty dummy rows
    if (!rawName && !rawCode && !rawPhone) continue;

    const rawTier = getVal(row, colMap.tier);
    let tier: CustomerTier = 'متوسط';
    if (rawTier.includes('مميز') || rawTier.toLowerCase().includes('vip') || rawTier.toLowerCase().includes('a')) {
      tier = 'مميز';
    } else if (rawTier.includes('راقي') || rawTier.includes('راقى') || rawTier.toLowerCase().includes('b')) {
      tier = 'راقي';
    }

    // Determine unique dedup key (normalized code, or normalized name + phone/address)
    const cleanCode = rawCode.trim().toLowerCase();
    const cleanName = (rawName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');

    let dedupKey = '';
    if (cleanCode && cleanCode !== '---' && !cleanCode.startsWith('cust-row') && cleanCode.length >= 2) {
      dedupKey = `code:::${cleanCode}`;
    } else if (cleanName && cleanPhone.length >= 7) {
      dedupKey = `name_phone:::${cleanName}:::${cleanPhone}`;
    } else if (cleanName && rawAddress && rawAddress.trim().length >= 3) {
      dedupKey = `name_addr:::${cleanName}:::${rawAddress.trim().toLowerCase()}`;
    } else if (cleanPhone.length >= 8) {
      dedupKey = `phone:::${cleanPhone}`;
    } else {
      dedupKey = `row:::${r}_${cleanName || 'cust'}`;
    }

    const assignedCode = rawCode || `CUST-${1000 + customerMap.size + 1}`;
    const safeCustId = cleanCode
      ? `cust-${cleanCode.replace(/\s+/g, '_')}`
      : `cust-${cleanName.replace(/\s+/g, '_').slice(0, 30)}_${cleanPhone || r}`;

    // Parse credit limit and current balance / debt
    const parseNumberValue = (colIdx: number): number | undefined => {
      if (colIdx === -1) return undefined;
      let valStr = getVal(row, colIdx);
      if (!valStr) return undefined;
      const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i < 10; i++) {
        valStr = valStr.split(arabicNumerals[i]).join(String(i));
      }
      valStr = valStr.replace(/,/g, '').replace(/٬/g, '').replace(/٫/g, '.');
      const clean = valStr.replace(/[^\d.-]/g, '');
      if (!clean) return undefined;
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? undefined : parsed;
    };

    const parsedCredit = parseNumberValue(colMap.creditLimit);
    const parsedBalance = parseNumberValue(colMap.balance);
    const parsedTotalOverdueAndDue = parseNumberValue(colMap.totalOverdueAndDue);

    const finalCreditLimit = parsedCredit !== undefined ? parsedCredit : 0;
    // If balance was not explicitly provided in a separate column but totalOverdueAndDue was, use it
    const finalBalance = parsedBalance !== undefined ? parsedBalance : (parsedTotalOverdueAndDue !== undefined ? parsedTotalOverdueAndDue : 0);
    const finalTotalOverdueAndDue = parsedTotalOverdueAndDue !== undefined ? parsedTotalOverdueAndDue : (finalBalance > 0 ? finalBalance : 0);

    const existing = customerMap.get(dedupKey);

    if (existing) {
      // Merge records - keep the richest data available
      if (!existing.phone && rawPhone) existing.phone = rawPhone;
      if (!existing.address && rawAddress) existing.address = rawAddress;
      if (!existing.taxNumber && rawTax) existing.taxNumber = rawTax;
      if (!existing.notes && rawNotes) existing.notes = rawNotes;
      if (parsedCredit !== undefined) existing.creditLimit = parsedCredit;
      if (parsedBalance !== undefined) {
        existing.currentBalance = parsedBalance;
        existing.balance = parsedBalance;
      }
      if (parsedTotalOverdueAndDue !== undefined) {
        existing.totalOverdueAndDue = parsedTotalOverdueAndDue;
      } else if (existing.totalOverdueAndDue === undefined && (existing.currentBalance || existing.balance)) {
        existing.totalOverdueAndDue = existing.currentBalance || existing.balance || 0;
      }
      if (rawRep && rawRep.trim()) {
        existing.repName = rawRep.trim();
        existing.salesRepName = rawRep.trim();
      }
      if (rawBranch && rawBranch.trim()) {
        existing.branchName = normalizeExcelBranchName(rawBranch);
      }
      if (tier === 'مميز' || (tier === 'راقي' && existing.tier === 'متوسط')) {
        existing.tier = tier;
      }
    } else {
      const newCustomer: Customer = {
        id: safeCustId,
        code: assignedCode,
        name: rawName || `عميل رقم ${assignedCode}`,
        storeName: rawName || `محل / سوبر ماركت ${assignedCode}`,
        tier: tier,
        phone: rawPhone,
        address: rawAddress,
        creditLimit: finalCreditLimit,
        currentBalance: finalBalance,
        balance: finalBalance,
        totalOverdueAndDue: finalTotalOverdueAndDue,
        branchName: normalizeExcelBranchName(rawBranch),
        repName: rawRep ? rawRep.trim() : '',
        salesRepName: rawRep ? rawRep.trim() : '',
        taxNumber: rawTax,
        notes: rawNotes,
        createdAt: new Date().toISOString(),
      };
      customerMap.set(dedupKey, newCustomer);
    }
  }

  const uniqueCustomers = Array.from(customerMap.values());
  return {
    customers: uniqueCustomers,
    errors,
    totalRows: totalRawRowsProcessed,
  };
}

/**
 * Specialized Warehouse & Logistics Fulfillment Excel Export
 * Separates Branch Available items (🟢) vs Central October Warehouse Dispatch (🔴)
 */
export function exportWarehouseFulfillmentExcel(invoice: Invoice) {
  const wb = XLSX.utils.book_new();

  // Branch items vs October warehouse items
  const branchItems = invoice.items.filter((item) => !item.fulfillFromMainWarehouse);
  const octoberItems = invoice.items.filter((item) => item.fulfillFromMainWarehouse);

  // Tab 1: All items with fulfillment source tag
  const allRows = invoice.items.map((item, idx) => {
    const isOctober = !!item.fulfillFromMainWarehouse;
    const factor = item.cartonQuantity || item.product?.cartonQuantity || item.product?.factor || 1;
    const cartons = item.cartonCount || 0;
    const pieces = item.pieceCount || 0;

    return {
      'م': idx + 1,
      'كود الصنف': item.product?.code || '---',
      'اسم الصنف': item.product?.name || 'صنف',
      'المجموعة (Item Group)': item.product?.itemGroup || item.product?.department || 'عام',
      'العائلة (Family Name)': item.product?.familyName || item.product?.classification || 'عام',
      'شدة الكرتونة (Factor)': factor,
      'عدد الكراتين': cartons,
      'عدد القطع الفردية': pieces,
      'إجمالي القطع': item.totalPieces || cartons * factor + pieces,
      'جهة الصرف والتجهيز': isOctober ? '🔴 مخزن 6 أكتوبر المركزي (تحويل نواقص)' : '🟢 مخزن الفرع المحلي',
      'حالة التوفر': isOctober ? 'نواقص بالفرع - سحب مركزي' : 'متوفر بالمخزن',
      'سعر الكرتونة': item.unitPrice || item.product?.cartonPrice || 0,
      'الإجمالي': item.totalPrice || 0,
      'ملاحظات': item.notes || '',
    };
  });

  const wsAll = XLSX.utils.json_to_sheet(allRows);
  wsAll['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 36 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 32 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAll, 'كشف_الصرف_الشامل');

  // Tab 2: Branch warehouse dispatch
  if (branchItems.length > 0) {
    const branchRows = branchItems.map((item, idx) => {
      const factor = item.cartonQuantity || item.product?.cartonQuantity || 1;
      return {
        'م': idx + 1,
        'كود الصنف': item.product?.code || '---',
        'اسم الصنف': item.product?.name || 'صنف',
        'شدة الكرتونة (Factor)': factor,
        'عدد الكراتين المطلوب': item.cartonCount || 0,
        'عدد القطع الفردية': item.pieceCount || 0,
        'إجمالي القطع': item.totalPieces || (item.cartonCount || 0) * factor + (item.pieceCount || 0),
        'رصيد الفرع الحالي': item.product?.branchStockActual || 0,
        'ملاحظات': item.notes || '',
      };
    });
    const wsBranch = XLSX.utils.json_to_sheet(branchRows);
    wsBranch['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 36 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsBranch, 'صرف_مخزن_الفرع_🟢');
  }

  // Tab 3: October warehouse transfer/dispatch
  if (octoberItems.length > 0) {
    const octoberRows = octoberItems.map((item, idx) => {
      const factor = item.cartonQuantity || item.product?.cartonQuantity || 1;
      return {
        'م': idx + 1,
        'كود الصنف': item.product?.code || '---',
        'اسم الصنف': item.product?.name || 'صنف',
        'شدة الكرتونة (Factor)': factor,
        'عدد الكراتين المطلوب تحويله': item.cartonCount || 0,
        'عدد القطع الفردية': item.pieceCount || 0,
        'إجمالي القطع': item.totalPieces || (item.cartonCount || 0) * factor + (item.pieceCount || 0),
        'رصيد مخزن 6 أكتوبر': item.product?.mainWarehouseActual || 0,
        'الفرع الطالب': invoice.branchName,
        'ملاحظات': item.notes || '',
      };
    });
    const wsOctober = XLSX.utils.json_to_sheet(octoberRows);
    wsOctober['!cols'] = [
      { wch: 6 },
      { wch: 14 },
      { wch: 36 },
      { wch: 14 },
      { wch: 20 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(wb, wsOctober, 'طلب_تحويل_مخزن_أكتوبر_🔴');
  }

  // Tab 4: Invoice summary header
  const headerSummary = [
    ['شركة دريم للتجارة والتوزيع - إذن صرف وتحويل مخزني', ''],
    ['رقم الفاتورة / الطلبية', invoice.invoiceNumber],
    ['تاريخ الطلبية', `${invoice.date} ${invoice.time || ''}`],
    ['الفرع الطالب', invoice.branchName],
    ['المندوب المسئول', invoice.repName],
    ['اسم العميل', invoice.customerName],
    ['حالة الطلبية', invoice.status],
    ['إجمالي أصناف الفرع (🟢)', branchItems.length],
    ['إجمالي أصناف مخزن أكتوبر (🔴)', octoberItems.length],
    ['إجمالي الكراتين بالطلبية', invoice.totalCartons],
    ['إجمالي القطع بالطلبية', invoice.totalPieces],
    ['إجمالي القيمة الصافية', invoice.estimatedGrandTotal],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(headerSummary);
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'بيانات_الإذن');

  XLSX.writeFile(wb, `إذن_صرف_مخزني_${invoice.invoiceNumber}_${invoice.branchName.replace(/[^\w\u0621-\u064A]/g, '_')}.xlsx`);
}

/**
 * Fetch and parse Customers from Google Sheets CSV URL
 */
export async function fetchCustomersFromGoogleSheetUrl(urlOrId: string): Promise<{
  customers: Customer[];
  errors: string[];
  totalRows: number;
}> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(urlOrId);
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`فشل فتح رابط جوجل شيت (${response.statusText}). تأكد من أن الرابط متاح للعامة (Anyone with the link can view).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const csvText = decodeBufferSmart(arrayBuffer).replace(/^\uFEFF/, '');
  const wb = XLSX.read(csvText, { type: 'string', codepage: 65001 });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

  return parseRawRowsToCustomers(rawRows);
}

/**
 * Parse Excel file to Customer list
 */
export async function parseExcelCustomers(file: File): Promise<{
  customers: Customer[];
  errors: string[];
  totalRows: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = parseExcelOrCsvBuffer(buffer, file.name);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        resolve(parseRawRowsToCustomers(rawRows));
      } catch (err: any) {
        resolve({
          customers: [],
          errors: [`فشل في قراءة ملف العملاء: ${err?.message || 'خطأ غير معروف'}`],
          totalRows: 0,
        });
      }
    };

    reader.onerror = () => {
      resolve({
        customers: [],
        errors: ['حدث خطأ أثناء قراءة ملف العملاء من الجهاز'],
        totalRows: 0,
      });
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generate sample Customers Excel template
 */
export function generateSampleCustomersTemplate(): void {
  const sampleCustomers: Customer[] = [
    {
      id: 'sample-cust-1',
      code: 'CUST-101',
      name: 'سوبر ماركت النور والبركة',
      storeName: 'سوبر ماركت النور والبركة',
      phone: '01011122233',
      branchName: 'فرع المنيا',
      repName: 'حسن محمد',
      salesRepName: 'حسن محمد',
      creditLimit: 50000,
      currentBalance: 8500,
      balance: 8500,
      address: 'شارع الجمهورية - المنيا',
      tier: 'مميز',
    },
    {
      id: 'sample-cust-2',
      code: 'CUST-102',
      name: 'معرض الأمل للأدوات والتجارة',
      storeName: 'معرض الأمل للأدوات والتجارة',
      phone: '01122233344',
      branchName: 'فرع المنيا',
      repName: 'علاء عمر',
      salesRepName: 'علاء عمر',
      creditLimit: 30000,
      currentBalance: 0,
      balance: 0,
      address: 'بندر المنيا - بجوار المحطة',
      tier: 'راقي',
    },
    {
      id: 'sample-cust-3',
      code: 'CUST-103',
      name: 'محلات الهلال والنجمة للتوزيع',
      storeName: 'محلات الهلال والنجمة للتوزيع',
      phone: '01233344455',
      branchName: 'فرع الفيوم',
      repName: 'محمود عبد الرحيم',
      salesRepName: 'محمود عبد الرحيم',
      creditLimit: 75000,
      currentBalance: 12300,
      balance: 12300,
      address: 'شارع البحر - الفيوم',
      tier: 'مميز',
    },
    {
      id: 'sample-cust-4',
      code: 'CUST-104',
      name: 'سنتر الفيروز ماركت',
      storeName: 'سنتر الفيروز ماركت',
      phone: '01099887766',
      branchName: 'فرع القاهرة',
      repName: 'أحمد محمود',
      salesRepName: 'أحمد محمود',
      creditLimit: 40000,
      currentBalance: 4200,
      balance: 4200,
      address: 'مدينة نصر - القاهرة',
      tier: 'متوسط',
    },
  ];

  exportCustomersToExcel(sampleCustomers);
}

/**
 * Export Customers List to Excel
 */
export function exportCustomersToExcel(customers: Customer[]): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    'كود العميل',
    'اسم العميل / المحل',
    'الفرع التابع له',
    'اسم المندوب المسؤول',
    'المديونية الحالية (ج.م)',
    'الحد الائتماني (ج.م)',
    'المتبقي من الائتمان (ج.م)',
    'رقم الهاتف',
    'العنوان والمحافظة',
    'الرقم الضريبي',
  ];

  const rows = customers.map((c) => {
    const limit = Number(c.creditLimit) || 0;
    const balance = Number(c.currentBalance ?? c.balance ?? 0);
    const available = Math.max(0, limit - balance);
    return [
      c.code || '---',
      c.name,
      c.branchName || 'الفرع الرئيسي',
      c.salesRepName || c.repName || 'غير محدد',
      balance,
      limit,
      available,
      c.phone || '',
      c.address || c.governorate || '',
      c.taxNumber || '',
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 35 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'سجل_العملاء');
  XLSX.writeFile(wb, `سجل_عملاء_دريم_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Standard 19 Columns for Dream Group Product & Multi-branch Inventory
 */
export const DREAM_INVENTORY_EXCEL_COLUMNS = [
  'الكود الموحد',
  'كود المنتج',
  'اسم المنتج',
  'الحجم',
  'عدد القطع',
  'سعر الكرتونه',
  'Item group',
  'Family Name',
  'اللون',
  'البحيرة',
  'الفيوم',
  'القاهرة',
  'المنيا',
  'ديمشلت',
  'مخزون اكتوبر',
  'منوف',
  'منيا القمح',
  'سعر العرض',
  'لينك الصوره',
];

/**
 * Export Products Catalog & Inventory to Excel matching the exact Dream 19-column spreadsheet format
 */
export function exportProductsToExcel(products: Product[], branchName = 'الكل'): void {
  const wb = XLSX.utils.book_new();

  const headers = [...DREAM_INVENTORY_EXCEL_COLUMNS];

  const rows = products.map((p) => {
    const stockBeheira = getBranchStockForProduct(p, 'البحيرة');
    const stockFayoum = getBranchStockForProduct(p, 'الفيوم');
    const stockCairo = getBranchStockForProduct(p, 'القاهرة');
    const stockMinya = getBranchStockForProduct(p, 'المنيا');
    const stockDimeshalt = getBranchStockForProduct(p, 'ديمشلت');
    const stockOctober =
      typeof p.mainWarehouseActual === 'number' && p.mainWarehouseActual > 0
        ? p.mainWarehouseActual
        : getBranchStockForProduct(p, 'أكتوبر');
    const stockMenouf = getBranchStockForProduct(p, 'منوف');
    const stockMeq = getBranchStockForProduct(p, 'منيا القمح');

    return [
      p.unifiedCode || '',
      cleanProductCode(p.code),
      p.name,
      p.size || '',
      p.cartonQuantity || p.factor || 1,
      p.cartonPrice || 0,
      p.itemGroup || p.department || p.category || '',
      p.familyName || p.classification || '',
      p.color || '',
      stockBeheira,
      stockFayoum,
      stockCairo,
      stockMinya,
      stockDimeshalt,
      stockOctober,
      stockMenouf,
      stockMeq,
      p.promoPrice || p.offerPrice || '',
      p.imageUrl || '',
    ];
  });

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 16 }, // الكود الموحد
    { wch: 16 }, // كود المنتج
    { wch: 40 }, // اسم المنتج
    { wch: 12 }, // الحجم
    { wch: 12 }, // عدد القطع
    { wch: 14 }, // سعر الكرتونه
    { wch: 18 }, // Item group
    { wch: 18 }, // Family Name
    { wch: 14 }, // اللون
    { wch: 12 }, // البحيرة
    { wch: 12 }, // الفيوم
    { wch: 12 }, // القاهرة
    { wch: 12 }, // المنيا
    { wch: 12 }, // ديمشلت
    { wch: 16 }, // مخزون اكتوبر
    { wch: 12 }, // منوف
    { wch: 14 }, // منيا القمح
    { wch: 14 }, // سعر العرض
    { wch: 48 }, // لينك الصوره
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'مخزون_دريم');
  XLSX.writeFile(wb, `مخزون_شركة_دريم_${branchName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Generate a blank template Excel file ready for import matching the exact 19 columns
 */
export function generateSampleExcelTemplate(): void {
  const sampleProducts: Product[] = [
    {
      id: 'sample-1',
      code: '1000061',
      unifiedCode: '#1000061',
      name: 'بمبونيرة 15010 جليز الوان',
      salesPriority: 'مرتفع',
      category: 'لوتس',
      itemGroup: 'لوتس',
      familyName: 'بمبونيرة',
      status: 'متاح',
      cartonQuantity: 6,
      size: 'وسط',
      color: 'ألوان مشكلة',
      branchStockActual: 150,
      branchStockReserved: 130,
      mainWarehouseActual: 2000,
      mainWarehouseReserved: 1800,
      branchStocks: {
        'البحيرة': 45,
        'الفيوم': 30,
        'القاهرة': 150,
        'المنيا': 60,
        'ديمشلت': 25,
        'مخزون اكتوبر': 2000,
        'أكتوبر': 2000,
        'منوف': 40,
        'منيا القمح': 55,
      },
      department: 'لوتس',
      classification: 'بمبونيرة',
      promoPrice: 320,
      piecePrice: 58.33,
      cartonPrice: 350,
      branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      imageUrl: 'https://lh3.googleusercontent.com/d/1sample_drive_id=w800',
    },
    {
      id: 'sample-2',
      code: '1000062',
      unifiedCode: '#1000062',
      name: 'طقم كاسات لوتس كلاسيك 6 ق كريستال',
      salesPriority: 'مرتفع',
      category: 'لوتس',
      itemGroup: 'لوتس',
      familyName: 'كاسات زجاج',
      status: 'متاح',
      cartonQuantity: 12,
      size: '300 مل',
      color: 'شفاف كرستال',
      branchStockActual: 80,
      branchStockReserved: 70,
      mainWarehouseActual: 1500,
      mainWarehouseReserved: 1400,
      branchStocks: {
        'البحيرة': 20,
        'الفيوم': 15,
        'القاهرة': 80,
        'المنيا': 35,
        'ديمشلت': 10,
        'مخزون اكتوبر': 1500,
        'أكتوبر': 1500,
        'منوف': 25,
        'منيا القمح': 30,
      },
      department: 'لوتس',
      classification: 'كاسات زجاج',
      promoPrice: 480,
      piecePrice: 43.33,
      cartonPrice: 520,
      branchName: 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)',
      imageUrl: 'https://lh3.googleusercontent.com/d/2sample_drive_id=w800',
    },
  ];

  exportProductsToExcel(sampleProducts, 'نموذج_إدخال_الأصناف_دريم');
}

export const exportElectronicInvoiceToExcel = exportInvoiceToExcel;
