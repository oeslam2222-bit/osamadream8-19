import * as XLSX from 'xlsx';
import { COMPANY_INFO } from '../data/mockData';
import { Invoice, ItemStatus, Product, SalesPriority } from '../types';

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
    size: -1,
    color: -1,
    branchStockActual: -1,
    branchStockReserved: -1,
    mainWarehouseActual: -1,
    mainWarehouseReserved: -1,
    department: -1,
    classification: -1,
    promoPrice: -1,
    piecePrice: -1,
    cartonPrice: -1,
    branchName: -1,
    imageUrl: -1,
    barcode: -1,
  };

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);

    // 1. Stock columns (Highest priority to avoid overlap with branchName)
    const isBranch = norm.includes('فرع') || norm.includes('branch');
    const isWarehouse = norm.includes('مخزن') || norm.includes('رئيسي') || norm.includes('warehouse') || norm.includes('main') || norm.includes('اكتوبر');
    const isActual = norm.includes('فعلي') || norm.includes('فعلى') || norm.includes('actual');
    const isReserved = norm.includes('حجز') || norm.includes('reserved') || norm.includes('متاح') || norm.includes('available');

    if (isBranch && isActual) {
      colMap.branchStockActual = idx;
    } else if (isBranch && isReserved) {
      colMap.branchStockReserved = idx;
    } else if (isWarehouse && isActual) {
      colMap.mainWarehouseActual = idx;
    } else if (isWarehouse && isReserved) {
      colMap.mainWarehouseReserved = idx;
    } else if (norm.includes('كود') || norm.includes('code')) {
      colMap.code = idx;
    } else if (norm.includes('اسمالصنف') || norm.includes('اسم') || norm.includes('البيان') || norm.includes('productname')) {
      colMap.name = idx;
    } else if (norm.includes('اولويه') || norm.includes('priority')) {
      colMap.salesPriority = idx;
    } else if (norm.includes('تصنيف') || norm.includes('category')) {
      colMap.category = idx;
    } else if (norm.includes('حاله') || norm.includes('status')) {
      colMap.status = idx;
    } else if (norm.includes('شده') || norm.includes('شدة') || norm.includes('كرتونه') || norm.includes('pack')) {
      colMap.cartonQuantity = idx;
    } else if (norm.includes('حجم') || norm.includes('وزن') || norm.includes('size')) {
      colMap.size = idx;
    } else if (norm.includes('لون') || norm.includes('color')) {
      colMap.color = idx;
    } else if (norm.includes('قسم') || norm.includes('department')) {
      colMap.department = idx;
    } else if (norm.includes('فئه') || norm.includes('class')) {
      colMap.classification = idx;
    } else if (norm.includes('سعرالعرض') || norm.includes('عرض') || norm.includes('promo')) {
      colMap.promoPrice = idx;
    } else if (norm.includes('سعرالقطعه') || norm.includes('قطعه') || norm.includes('piece')) {
      colMap.piecePrice = idx;
    } else if (norm.includes('سعرالكرتونه') || norm.includes('كرتونه') || norm.includes('cartonprice')) {
      colMap.cartonPrice = idx;
    } else if (norm.includes('صوره') || norm.includes('صور') || norm.includes('لينك') || norm.includes('image') || norm.includes('url')) {
      colMap.imageUrl = idx;
    } else if (norm.includes('باركود') || norm.includes('barcode')) {
      colMap.barcode = idx;
    } else if (norm.includes('فرع') || norm.includes('branch')) {
      colMap.branchName = idx;
    }
  });

  // Fallback for generic sequential headers if explicit branch/warehouse names weren't present in header text
  let actualColCount = 0;
  let reservedColCount = 0;
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    const isActual = norm.includes('فعلي') || norm.includes('فعلى') || norm.includes('actual');
    const isReserved = norm.includes('حجز') || norm.includes('reserved');

    if (isActual) {
      if (colMap.branchStockActual === -1 && actualColCount === 0) {
        colMap.branchStockActual = idx;
        actualColCount++;
      } else if (colMap.mainWarehouseActual === -1) {
        colMap.mainWarehouseActual = idx;
        actualColCount++;
      }
    } else if (isReserved) {
      if (colMap.branchStockReserved === -1 && reservedColCount === 0) {
        colMap.branchStockReserved = idx;
        reservedColCount++;
      } else if (colMap.mainWarehouseReserved === -1) {
        colMap.mainWarehouseReserved = idx;
        reservedColCount++;
      }
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
      // Convert eastern Arabic digits (٠-٩) to standard (0-9)
      const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      for (let i = 0; i < 10; i++) {
        rawStr = rawStr.split(arabicNumerals[i]).join(String(i));
      }
      // Clean up thousands commas and spaces
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

    const piecePrice = getNum(colMap.piecePrice, 10);
    const cartonQuantity = Math.max(1, getNum(colMap.cartonQuantity, 12));
    const cartonPrice = getNum(colMap.cartonPrice, piecePrice * cartonQuantity * 0.95);
    const promoPriceRaw = getNum(colMap.promoPrice, 0);
    const dept = getVal(colMap.department) || getVal(colMap.category) || 'LHLotus';

    const product: Product = {
      id: `p-${Date.now()}-${r}`,
      code: code,
      name: name || `صنف دريم ${code}`,
      salesPriority: salesPriority,
      category: getVal(colMap.category) || dept,
      status: status,
      cartonQuantity: cartonQuantity,
      size: getVal(colMap.size) || 'حجم قياسي',
      color: getVal(colMap.color) || 'افتراضي',
      branchStockActual: getNum(colMap.branchStockActual, 50),
      branchStockReserved: getNum(colMap.branchStockReserved, 45),
      mainWarehouseActual: getNum(colMap.mainWarehouseActual, 500),
      mainWarehouseReserved: getNum(colMap.mainWarehouseReserved, 450),
      department: dept,
      classification: getVal(colMap.classification) || 'فئة A',
      promoPrice: promoPriceRaw > 0 ? promoPriceRaw : undefined,
      piecePrice: piecePrice,
      cartonPrice: cartonPrice,
      branchName: normalizeExcelBranchName(getVal(colMap.branchName)),
      imageUrl: getVal(colMap.imageUrl) || undefined,
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
 * Export Invoice to Excel (Electronic Tax Layout)
 */
export function exportInvoiceToExcel(invoice: Invoice): void {
  const wb = XLSX.utils.book_new();

  const titleRows = [
    [COMPANY_INFO.nameArabic],
    ['فاتورة مبيعات إلكترونية معتمدة'],
    [`رقم الفاتورة: ${invoice.invoiceNumber}`, `التاريخ: ${invoice.date}`, `الوقت: ${invoice.time}`],
    [`اسم العميل: ${invoice.customerName}`, `هاتف العميل: ${invoice.customerPhone || '---'}`, `العنوان: ${invoice.customerAddress || '---'}`],
    [`الرقم الضريبي للعميل: ${invoice.customerTaxNumber || '---'}`, `مندوب المبيعات: ${invoice.repName}`, `الفرع: ${invoice.branchName}`],
    [`طريقة السداد: ${invoice.paymentMethod}`, `حالة الفاتورة: ${invoice.status}`, `المشرف المسؤول: ${invoice.supervisorName || '---'}`],
    []
  ];

  const tableHeaders = [
    'م',
    'كود الصنف',
    'اسم الصنف والبيان',
    'شدة الكرتونة',
    'الكمية (كرتونة)',
    'سعر الكرتونة',
    'الإجمالي قبل الخصم',
    'قيمة الخصم',
    'ضريبة القيمة المضافة (14%)',
    'صافي الصنف'
  ];

  const itemRows = invoice.items.map((item, index) => [
    index + 1,
    item.productCode,
    item.productName,
    item.cartonQuantity,
    item.cartonCount,
    item.pricePerCarton,
    item.totalBeforeTax,
    item.discountAmount,
    item.taxAmount,
    item.netTotal
  ]);

  const summaryRows = [
    [],
    ['', '', '', '', '', '', '', '', '', 'إجمالي البضاعة:', '', '', invoice.subtotal],
    ['', '', '', '', '', '', '', '', '', `إجمالي الخصم (${invoice.discountPercentage}%):`, '', '', -invoice.discountAmount],
    ['', '', '', '', '', '', '', '', '', `ضريبة القيمة المضافة (${invoice.taxPercentage}%):`, '', '', invoice.taxAmount],
    ['', '', '', '', '', '', '', '', '', 'الإجمالي النهائي المطلوب سداده:', '', '', invoice.estimatedGrandTotal],
    [],
    ['ملاحظات الفاتورة:', invoice.notes || 'لا توجد'],
    [`خدمة العملاء: ${COMPANY_INFO.customerService}`, `الرقم الضريبي للشركة: ${COMPANY_INFO.taxRegistrationNumber}`, 'نظام فواتير دريم للتجارة والتوزيع']
  ];

  const fullSheetData = [...titleRows, tableHeaders, ...itemRows, ...summaryRows];
  const ws = XLSX.utils.aoa_to_sheet(fullSheetData);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 14 },
    { wch: 38 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 14 },
    { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `فاتورة_${invoice.invoiceNumber}`);
  XLSX.writeFile(wb, `فاتورة_دريم_${invoice.invoiceNumber}_${invoice.customerName.replace(/[^\w\u0621-\u064A]/g, '_')}.xlsx`);
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
