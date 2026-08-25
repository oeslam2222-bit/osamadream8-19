import * as XLSX from 'xlsx';
import { COMPANY_INFO } from '../data/mockData';
import { Customer, CustomerTier, Invoice, ItemStatus, Product, SalesPriority } from '../types';

/**
 * Smart Branch Name normalizer for Excel input
 * Supports all 7 company branches + central warehouse, and handles any flexible naming or custom branches
 */
export function normalizeExcelBranchName(rawBranch?: string): string {
  if (!rawBranch || !rawBranch.trim()) {
    return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  }
  const clean = rawBranch.trim();
  const lower = clean.toLowerCase();

  if (
    lower.includes('أكتوبر') ||
    lower.includes('اكتوبر') ||
    lower.includes('مركزي') ||
    lower.includes('مركزي') ||
    lower.includes('رئيسي') ||
    lower.includes('october') ||
    lower.includes('main')
  ) {
    return 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
  }
  if (
    lower.includes('بحيرة') ||
    lower.includes('بحيره') ||
    lower.includes('دمنهور') ||
    lower.includes('beheira') ||
    lower.includes('damanhour')
  ) {
    return 'فرع البحيرة';
  }
  if (lower.includes('قاهرة') || lower.includes('قاهره') || lower.includes('cairo')) {
    return 'فرع القاهرة';
  }
  if (lower.includes('فيوم') || lower.includes('fayoum')) {
    return 'فرع الفيوم';
  }
  if (lower.includes('منيا القمح') || lower.includes('القمح') || lower.includes('meq')) {
    return 'فرع منيا القمح';
  }
  if (lower.includes('منيا') || lower.includes('minya')) {
    return 'فرع المنيا';
  }
  if (lower.includes('ديمشلت') || lower.includes('dimeshalt')) {
    return 'فرع ديمشلت';
  }
  if (lower.includes('منوف') || lower.includes('menouf')) {
    return 'فرع منوف';
  }

  // If user provided a specific branch name, format nicely
  if (!clean.startsWith('فرع') && !clean.includes('المخزن')) {
    return `فرع ${clean}`;
  }
  return clean;
}

/**
 * Clean and extract raw Image URL from Google Sheets cells
 * Handles =IMAGE("..."), =HYPERLINK("...", "..."), quotes, and drive links
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

  // 4. If someone has multiple space-separated or comma-separated URLs, take the first valid one
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

    // 1. Exact Branch Stock Columns from Dream Sheet
    if (norm === 'البحيرة' || norm === 'البحيره' || norm.includes('مخزونالبحير') || norm.includes('فرعالبحير')) {
      colMap.stockBeheira = idx;
      if (colMap.branchStockActual === -1) colMap.branchStockActual = idx;
    } else if (norm === 'الفيوم' || norm.includes('مخزونالفيوم') || norm.includes('فرعالفيوم')) {
      colMap.stockFayoum = idx;
    } else if (norm === 'القاهرة' || norm === 'القاهره' || norm.includes('مخزونالقاهر') || norm.includes('فرعالقاهر')) {
      colMap.stockCairo = idx;
    } else if (norm === 'المنيا' || (norm.includes('المنيا') && !norm.includes('القمح')) || norm.includes('مخزونالمنيا')) {
      colMap.stockMinya = idx;
    } else if (norm === 'ديمشلت' || norm.includes('مخزونديمشلت') || norm.includes('فرعديمشلت')) {
      colMap.stockDimeshalt = idx;
    } else if (
      norm === 'مخزوناكتوبر' ||
      norm === 'مخزونأكتوبر' ||
      norm === 'اكتوبر' ||
      norm === 'أكتوبر' ||
      norm.includes('مخزوناكتوبر') ||
      norm.includes('مخزنالمركزي') ||
      norm.includes('مخزنمركزي')
    ) {
      colMap.stockOctober = idx;
      colMap.mainWarehouseActual = idx;
    } else if (norm === 'منوف' || norm.includes('مخزونمنوف') || norm.includes('فرعمنوف')) {
      colMap.stockMenouf = idx;
    } else if (norm === 'منياالقمح' || norm.includes('منياالقمح') || norm.includes('القمح')) {
      colMap.stockMeq = idx;
    }
    // 2. Factor (شدة الكرتونة)
    else if (
      norm === 'factor' ||
      norm.includes('factor') ||
      norm.includes('الفاكتور') ||
      norm.includes('فاكتور') ||
      norm.includes('شدةالكرتون') ||
      norm.includes('شدةالكرتونه') ||
      norm.includes('شدة') ||
      norm.includes('شده') ||
      norm.includes('عددالقطع') ||
      norm.includes('القطعبالكرتون') ||
      norm.includes('قطعبالكرتون')
    ) {
      colMap.factor = idx;
      colMap.cartonQuantity = idx;
    }
    // 3. Sales Price (سعر القطعة)
    else if (
      norm === 'salesprice' ||
      norm.includes('salesprice') ||
      norm.includes('سعرالقطعة') ||
      norm.includes('سعرالقطعه') ||
      norm.includes('سعرالبيع') ||
      norm.includes('sales_price')
    ) {
      colMap.salesPrice = idx;
      colMap.piecePrice = idx;
    }
    // 4. Item group (المجموعة الرئيسية)
    else if (
      norm === 'itemgroup' ||
      norm === 'item_group' ||
      norm.includes('itemgroup') ||
      norm.includes('مجموعةالاصناف') ||
      norm.includes('المجموعةالرئيسية') ||
      norm.includes('المجموعهالرئيسيه')
    ) {
      colMap.itemGroup = idx;
      colMap.department = idx;
    }
    // 5. Family Name (العائلة / المجموعة الفرعية)
    else if (
      norm === 'familyname' ||
      norm === 'family_name' ||
      norm.includes('familyname') ||
      norm.includes('اسمالعائلة') ||
      norm.includes('العائلة') ||
      norm.includes('العائله') ||
      norm.includes('الفئة') ||
      norm.includes('فئة')
    ) {
      colMap.familyName = idx;
      colMap.classification = idx;
    }
    // General matchers
    else if (norm.includes('كود') || norm.includes('code')) {
      colMap.code = idx;
    } else if (norm.includes('اسمالصنف') || norm.includes('اسم') || norm.includes('البيان') || norm.includes('productname')) {
      colMap.name = idx;
    } else if (norm.includes('اولويه') || norm.includes('priority')) {
      colMap.salesPriority = idx;
    } else if (norm.includes('تصنيف') || norm.includes('category')) {
      colMap.category = idx;
    } else if (norm.includes('حاله') || norm.includes('status')) {
      colMap.status = idx;
    } else if (
      norm.includes('سعرالعرض') ||
      norm.includes('سعرخاص') ||
      norm.includes('عرض') ||
      norm.includes('promo')
    ) {
      colMap.promoPrice = idx;
    } else if (
      norm.includes('سعرالكرتون') ||
      norm.includes('سعرالكرتونه') ||
      norm.includes('cartonprice') ||
      norm.includes('wholesaleprice')
    ) {
      colMap.cartonPrice = idx;
    } else if (norm.includes('حجم') || norm.includes('وزن') || norm.includes('size')) {
      colMap.size = idx;
    } else if (norm.includes('لون') || norm.includes('color')) {
      colMap.color = idx;
    } else if (norm.includes('قسم') || norm.includes('department')) {
      if (colMap.department === -1) colMap.department = idx;
    } else if (
      norm.includes('صوره') ||
      norm.includes('صور') ||
      norm.includes('لينك') ||
      norm.includes('image') ||
      norm.includes('url') ||
      norm.includes('لينكالصوره')
    ) {
      colMap.imageUrl = idx;
    } else if (norm.includes('باركود') || norm.includes('barcode')) {
      colMap.barcode = idx;
    } else if (norm.includes('فرع') || norm.includes('branch')) {
      colMap.branchName = idx;
    }
  });

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

    const code = getVal(colMap.code) || `DRM-${100 + r}`;
    const name = getVal(colMap.name);

    if (!name && !code) continue; // skip empty line

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
    const promoPriceRaw = getNum(colMap.promoPrice, 0);

    let piecePrice = 0;
    let cartonPrice = 0;

    if (rawSalesPrice > 0) {
      piecePrice = rawSalesPrice;
      cartonPrice = Math.round(piecePrice * cartonQuantity * 100) / 100;
    } else if (rawCartonPrice > 0) {
      cartonPrice = rawCartonPrice;
      piecePrice = cartonQuantity > 0 ? Math.round((cartonPrice / cartonQuantity) * 100) / 100 : cartonPrice;
    }

    // Item group and Family Name
    const itemGroup = getVal(colMap.itemGroup) || getVal(colMap.department) || getVal(colMap.category) || 'LHLotus';
    const familyName = getVal(colMap.familyName) || getVal(colMap.classification) || 'أصناف عامة';

    // Multi-branch stocks
    const stockBeheira = colMap.stockBeheira > -1 ? getNum(colMap.stockBeheira, 0) : 0;
    const stockFayoum = colMap.stockFayoum > -1 ? getNum(colMap.stockFayoum, 0) : 0;
    const stockCairo = colMap.stockCairo > -1 ? getNum(colMap.stockCairo, 0) : 0;
    const stockMinya = colMap.stockMinya > -1 ? getNum(colMap.stockMinya, 0) : 0;
    const stockDimeshalt = colMap.stockDimeshalt > -1 ? getNum(colMap.stockDimeshalt, 0) : 0;
    const stockOctober = colMap.stockOctober > -1 ? getNum(colMap.stockOctober, 500) : getNum(colMap.mainWarehouseActual, 500);
    const stockMenouf = colMap.stockMenouf > -1 ? getNum(colMap.stockMenouf, 0) : 0;
    const stockMeq = colMap.stockMeq > -1 ? getNum(colMap.stockMeq, 0) : 0;

    const branchStocks: Record<string, number> = {
      'فرع البحيرة': stockBeheira,
      'فرع الفيوم': stockFayoum,
      'فرع القاهرة': stockCairo,
      'فرع المنيا': stockMinya,
      'فرع ديمشلت': stockDimeshalt,
      'مخزون اكتوبر': stockOctober,
      'فرع منوف': stockMenouf,
      'فرع منيا القمح': stockMeq,
    };

    // Calculate default branch stock if specific branch column was present
    const rawBranchStock = colMap.branchStockActual > -1 ? getNum(colMap.branchStockActual, 50) : (stockCairo || stockBeheira || 50);

    const rawImg = cleanGoogleSheetImageUrl(getVal(colMap.imageUrl));

    const product: Product = {
      id: `p-${Date.now()}-${r}-${Math.random().toString(36).substring(2, 7)}`,
      code: code,
      name: name || `صنف دريم ${code}`,
      salesPriority: salesPriority,
      category: itemGroup,
      status: status,
      cartonQuantity: cartonQuantity,
      factor: cartonQuantity,
      size: getVal(colMap.size) || '',
      color: getVal(colMap.color) || '',
      branchStockActual: rawBranchStock,
      branchStockReserved: Math.max(0, rawBranchStock - 5),
      mainWarehouseActual: stockOctober,
      mainWarehouseReserved: Math.max(0, stockOctober - 20),
      branchStocks: branchStocks,
      department: itemGroup,
      itemGroup: itemGroup,
      classification: familyName,
      familyName: familyName,
      promoPrice: promoPriceRaw > 0 ? promoPriceRaw : undefined,
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
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

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

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0) {
      throw new Error('تم جلب الشيت لكنه لا يحتوي على أي بيانات.');
    }

    const workbook = XLSX.read(csvText, { type: 'string' });
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
 * Export Invoice to Excel (Electronic Tax Layout with Smart Carton/Piece Breakdown)
 */
export function exportInvoiceToExcel(invoice: Invoice): void {
  const wb = XLSX.utils.book_new();

  const titleRows = [
    [COMPANY_INFO.nameArabic],
    ['فاتورة مبيعات إلكترونية معتمدة - شركة دريم للتجارة والتوزيع'],
    [`رقم الفاتورة: ${invoice.invoiceNumber}`, `التاريخ: ${invoice.date}`, `الوقت: ${invoice.time || ''}`],
    [`كود العميل: ${invoice.customerCode || '---'}`, `اسم العميل: ${invoice.customerName}`, `هاتف العميل: ${invoice.customerPhone || '---'}`],
    [`عنوان العميل: ${invoice.customerAddress || '---'}`, `الرقم الضريبي: ${invoice.customerTaxNumber || '---'}`, `الفرع: ${invoice.branchName}`],
    [`مندوب المبيعات: ${invoice.repName}`, `المشرف المسؤول: ${invoice.supervisorName || '---'}`, `طريقة السداد: ${invoice.paymentMethod}`],
    [`حالة الفاتورة: ${invoice.status}`, `إجمالي الكراتين: ${invoice.totalCartons} كرتونة`, `إجمالي القطع: ${invoice.totalPieces} قطعة`],
    []
  ];

  const tableHeaders = [
    'م',
    'كود الصنف',
    'اسم الصنف والبيان',
    'شدة الكرتونة (ق/ك)',
    'بيان الكمية الذكي',
    'عدد الكراتين',
    'قطع فردية',
    'إجمالي القطع',
    'سعر القطعة (ج.م)',
    'سعر الكرتونة (ج.م)',
    'الإجمالي قبل الخصم',
    'قيمة الخصم',
    'صافي الصنف'
  ];

  const itemRows = invoice.items.map((item, index) => {
    const cartonQty = item.cartonQuantity || 1;
    const cCount = item.cartonCount || 0;
    const pCount = item.pieceCount || 0;
    const totalPcs = item.totalUnits || (cCount * cartonQty + pCount);
    
    let smartDesc = '';
    if (cCount > 0 && pCount > 0) {
      smartDesc = `${cCount} كرتونة و ${pCount} قطعة`;
    } else if (cCount > 0) {
      smartDesc = `${cCount} كرتونة`;
    } else if (pCount > 0) {
      smartDesc = `${pCount} قطعة`;
    } else {
      smartDesc = '0';
    }

    const pieceP = item.pricePerPiece || Math.round((item.pricePerCarton || item.appliedPrice) / cartonQty);

    return [
      index + 1,
      item.productCode,
      item.productName,
      cartonQty,
      item.quantityDescription || smartDesc,
      cCount,
      pCount,
      totalPcs,
      pieceP,
      item.pricePerCarton || item.appliedPrice,
      item.totalBeforeTax,
      item.discountAmount,
      item.netTotal
    ];
  });

  const summaryRows = [
    [],
    ['', '', '', '', '', '', '', '', '', 'إجمالي البضاعة قبل الخصم:', '', '', invoice.subtotal],
    ['', '', '', '', '', '', '', '', '', `إجمالي الخصم التجاري (${invoice.discountPercentage}%):`, '', '', -invoice.discountAmount],
    ['', '', '', '', '', '', '', '', '', 'الإجمالي النهائي المطلوب سداده:', '', '', invoice.estimatedGrandTotal],
    [],
    ['رسالة شكر:', '✨ شكراً لتعاملكم مع شركة دريم للتجارة والتوزيع ❤️'],
    ['ملاحظات الفاتورة:', invoice.notes || 'لا توجد'],
    [`خدمة العملاء: ${COMPANY_INFO.customerService}`, 'نظام فواتير دريم للتجارة والتوزيع']
  ];

  const fullSheetData = [...titleRows, tableHeaders, ...itemRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 38 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `فاتورة_${invoice.invoiceNumber}`);
  XLSX.writeFile(wb, `فاتورة_دريم_${invoice.invoiceNumber}_${invoice.customerName.replace(/[^\w\u0621-\u064A]/g, '_')}.xlsx`);
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

  const colMap: Record<string, number> = {
    code: -1,
    name: -1,
    tier: -1,
    phone: -1,
    address: -1,
    branchName: -1,
    repName: -1,
    taxNumber: -1,
    notes: -1,
  };

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (norm.includes('كود') || norm.includes('code') || norm.includes('رقم العميل')) {
      if (colMap.code === -1) colMap.code = idx;
    } else if (norm.includes('اسم') || norm.includes('عميل') || norm.includes('محل') || norm.includes('customer') || norm.includes('name')) {
      if (colMap.name === -1) colMap.name = idx;
    } else if (
      norm.includes('تصنيف') ||
      norm.includes('فئة') ||
      norm.includes('فئه') ||
      norm.includes('tier') ||
      norm.includes('درجة') ||
      norm.includes('درجه')
    ) {
      if (colMap.tier === -1) colMap.tier = idx;
    } else if (norm.includes('تليفون') || norm.includes('هاتف') || norm.includes('موبايل') || norm.includes('phone') || norm.includes('mobile')) {
      if (colMap.phone === -1) colMap.phone = idx;
    } else if (norm.includes('عنوان') || norm.includes('منطقة') || norm.includes('محافظة') || norm.includes('address') || norm.includes('city')) {
      if (colMap.address === -1) colMap.address = idx;
    } else if (norm.includes('فرع') || norm.includes('branch')) {
      if (colMap.branchName === -1) colMap.branchName = idx;
    } else if (norm.includes('مندوب') || norm.includes('المندوبالحالي') || norm.includes('rep') || norm.includes('مسؤول')) {
      if (colMap.repName === -1) colMap.repName = idx;
    } else if (norm.includes('ضريب') || norm.includes('tax')) {
      if (colMap.taxNumber === -1) colMap.taxNumber = idx;
    } else if (norm.includes('ملاحظ') || norm.includes('note')) {
      if (colMap.notes === -1) colMap.notes = idx;
    }
  });

  const getVal = (row: any[], colIdx: number, def = ''): string => {
    if (colIdx === -1 || colIdx >= row.length) return def;
    const val = row[colIdx];
    if (val === undefined || val === null) return def;
    return String(val).trim();
  };

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.every((c: any) => c === undefined || c === null || String(c).trim() === '')) {
      continue;
    }

    const name = getVal(row, colMap.name);
    const code = getVal(row, colMap.code, `CUST-${1000 + r}`);
    if (!name && !code) continue;

    const rawTier = getVal(row, colMap.tier);
    let tier: CustomerTier = 'متوسط';
    if (rawTier.includes('مميز') || rawTier.toLowerCase().includes('vip') || rawTier.toLowerCase().includes('a')) {
      tier = 'مميز';
    } else if (rawTier.includes('راقي') || rawTier.includes('راقى') || rawTier.toLowerCase().includes('b')) {
      tier = 'راقي';
    }

    const customer: Customer = {
      id: `cust-${Date.now()}-${r}-${Math.random().toString(36).substring(2, 6)}`,
      code: code || `CUST-${1000 + r}`,
      name: name || `عميل رقم ${code}`,
      tier: tier,
      phone: getVal(row, colMap.phone),
      address: getVal(row, colMap.address),
      branchName: normalizeExcelBranchName(getVal(row, colMap.branchName, 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)')),
      repName: getVal(row, colMap.repName, 'مندوب المبيعات'),
      taxNumber: getVal(row, colMap.taxNumber),
      notes: getVal(row, colMap.notes),
      createdAt: new Date().toISOString(),
    };

    customers.push(customer);
  }

  return { customers, errors, totalRows: customers.length };
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

  const csvText = await response.text();
  const wb = XLSX.read(csvText, { type: 'string' });
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
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
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
      code: 'CUST-001',
      name: 'هايبر ماركت التوحيد والنور',
      storeName: 'هايبر ماركت التوحيد والنور',
      phone: '01011122233',
      branchName: 'فرع القاهرة (المعادي ومدينة نصر والتجمع)',
      governorate: 'القاهرة',
      address: 'شارع مكرم عبيد، مدينة نصر',
      taxNumber: '341-987-123',
      notes: 'عميل مميز - خصم خاص'
    },
    {
      id: 'sample-cust-2',
      code: 'CUST-002',
      name: 'سلسلة محلات سنتر شاهين',
      storeName: 'سلسلة محلات سنتر شاهين',
      phone: '01244455566',
      branchName: 'فرع الجيزة (الهرم وفيصل والدقي)',
      governorate: 'الجيزة',
      address: 'شارع فيصل الرئيسي، الجيزة',
      taxNumber: '552-881-440',
      notes: 'دفع آجل 30 يوم'
    }
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
    'رقم الهاتف',
    'العنوان / المنطقة',
    'الفرع التابع له',
    'المندوب المسئول',
    'الرقم الضريبي',
    'ملاحظات'
  ];

  const rows = customers.map(c => [
    c.code,
    c.name,
    c.phone,
    c.address,
    c.branchName,
    c.repName,
    c.taxNumber || '',
    c.notes || ''
  ]);

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 14 },
    { wch: 32 },
    { wch: 16 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 25 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'قاعدة_بيانات_العملاء');
  XLSX.writeFile(wb, `عملاء_شركة_دريم_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Export Products Catalog & Inventory to Excel matching Dream spreadsheet format
 */
export function exportProductsToExcel(products: Product[], branchName = 'الكل'): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    'الكود',
    'اسم الصنف',
    'اولوية البيع',
    'التصنيف',
    'حالة الصنف',
    'شدة الكرتونة',
    'الحجم',
    'اللون',
    'الفرع - فعلى',
    'الفرع - بعد الحجز',
    'المخزن الرئيسي - فعلى',
    'المخزن الرئيسي - بعد الحجز',
    'القسم',
    'الفئة',
    'سعر العرض',
    'سعر الكرتونة',
    'اسم الفرع',
    'رابط الصورة'
  ];

  const rows = products.map(p => [
    p.code,
    p.name,
    p.salesPriority,
    p.category,
    p.status,
    p.cartonQuantity,
    p.size,
    p.color,
    p.branchStockActual,
    p.branchStockReserved,
    p.mainWarehouseActual,
    p.mainWarehouseReserved,
    p.department,
    p.classification,
    p.promoPrice || '',
    p.cartonPrice,
    p.branchName,
    p.imageUrl || ''
  ]);

  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);

  ws['!cols'] = [
    { wch: 12 },
    { wch: 35 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 24 },
    { wch: 45 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'مخزون_دريم');
  XLSX.writeFile(wb, `مخزون_شركة_دريم_${branchName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Generate a blank template Excel file ready for import
 */
export function generateSampleExcelTemplate(): void {
  const sampleProducts: Product[] = [
    {
      id: 'sample-1',
      code: 'LHL-101',
      name: 'طقم لوتس كلاسيك زجاجي 6 قطع - LHLotus',
      salesPriority: 'مرتفع',
      category: 'LHLotus',
      status: 'متاح',
      cartonQuantity: 12,
      size: '300 مل',
      color: 'شفاف كرستال',
      branchStockActual: 150,
      branchStockReserved: 130,
      mainWarehouseActual: 2000,
      mainWarehouseReserved: 1800,
      department: 'LHLotus',
      classification: 'سوبر A',
      promoPrice: 85,
      piecePrice: 95,
      cartonPrice: 1020,
      branchName: 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
      imageUrl: 'https://res.cloudinary.com/dream-dist/image/upload/products/LHL-101.jpg'
    },
    {
      id: 'sample-2',
      code: 'FHL-111',
      name: 'طقم لومينارك فرنسي أصلي 6 قطع - FHLuminarc',
      salesPriority: 'مرتفع',
      category: 'FHLuminarc',
      status: 'متاح',
      cartonQuantity: 6,
      size: '330 مل',
      color: 'شفاف مقاوم للصدمات',
      branchStockActual: 200,
      branchStockReserved: 180,
      mainWarehouseActual: 3000,
      mainWarehouseReserved: 2800,
      department: 'FHLuminarc',
      classification: 'أصلي Import',
      promoPrice: undefined,
      piecePrice: 175,
      cartonPrice: 990,
      branchName: 'فرع أكتوبر (الفرع الرئيسي والمخزن المركزي)',
      imageUrl: 'https://res.cloudinary.com/dream-dist/image/upload/products/FHL-111.jpg'
    }
  ];

  exportProductsToExcel(sampleProducts, 'نموذج_إدخال_الأصناف_دريم');
}

export const exportElectronicInvoiceToExcel = exportInvoiceToExcel;
