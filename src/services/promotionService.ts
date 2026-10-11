import * as XLSX from 'xlsx-js-style';
import { Product, PromotionOffer } from '../types';
import { cleanProductCode } from './excelService';
import { decodeBufferSmart, parseExcelOrCsvBuffer } from './encodingService';

const PROMOTIONS_STORAGE_KEY = 'tantawy_promotions_offers_v1';

export const INITIAL_PROMOTIONS: PromotionOffer[] = [
  {
    id: 'promo-1',
    title: 'عرض الموسم على كرانشي سوبر A 🔥',
    productCode: '1001',
    unifiedCode: '1001',
    productName: 'كرانشي بالجبنة المتبلة سوبر A',
    category: 'سناكس ومقرمشات',
    discountPercentage: 15,
    originalPrice: 240,
    promoPrice: 204,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    branchName: 'كل الفروع',
    status: 'نشط',
    notes: 'خصم فوري 15% على كرتونة كرانشي سوبر A لكافة العملاء والمناديب.',
    createdAt: new Date().toISOString(),
    sourceSheet: 'شيت_عروض_الشركة_المركزي',
  },
  {
    id: 'promo-2',
    title: 'تخفيضات العيد على ويفر الشوكولاتة الفاخر 🍫',
    productCode: '1005',
    unifiedCode: '1005',
    productName: 'ويفر شوكولاتة كريمة البندق 24 قطعة',
    category: 'بسكويت وويفر',
    discountPercentage: 20,
    originalPrice: 280,
    promoPrice: 224,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    branchName: 'كل الفروع',
    status: 'نشط',
    notes: 'عرض خاص للكميات - خصم 20% ساري لجميع العملاء المسجلين.',
    createdAt: new Date().toISOString(),
    sourceSheet: 'شيت_عروض_الشركة_المركزي',
  },
  {
    id: 'promo-3',
    title: 'خصم الكرتونة الذهبي على بسكويت سادة عائلي 🍪',
    productCode: '1012',
    unifiedCode: '1012',
    productName: 'بسكويت شاي سادة عائلي شدة 24',
    category: 'بسكويت وويفر',
    discountPercentage: 10,
    originalPrice: 190,
    promoPrice: 171,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10),
    branchName: 'كل الفروع',
    status: 'نشط',
    notes: 'عرض ترويجي لتنشيط مبيعات بسكويت الشاي السادة.',
    createdAt: new Date().toISOString(),
    sourceSheet: 'شيت_عروض_الشركة_المركزي',
  },
];

/**
 * Load saved promotion offers from localStorage
 */
export function getSavedPromotions(): PromotionOffer[] {
  try {
    const raw = localStorage.getItem(PROMOTIONS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(INITIAL_PROMOTIONS));
      return INITIAL_PROMOTIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_PROMOTIONS;
  } catch {
    return INITIAL_PROMOTIONS;
  }
}

/**
 * Save promotion offers to localStorage
 */
export function savePromotions(promotions: PromotionOffer[]): void {
  try {
    localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(promotions));
  } catch (err) {
    console.error('Failed to save promotions to localStorage', err);
  }
}

/**
 * Parse an uploaded Excel or Google Sheets file for promotions and map by code / unifiedCode
 */
export async function parsePromotionsFromExcelBuffer(
  buffer: ArrayBuffer,
  sheetNameHint?: string
): Promise<{ promotions: PromotionOffer[]; message: string; matchedCount: number }> {
  const wb = await parseExcelOrCsvBuffer(buffer);
  const sheetNames = wb.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('الملف لا يحتوي على أي شيتات صالحة.');
  }

  const chosenSheetName = sheetNameHint && sheetNames.includes(sheetNameHint)
    ? sheetNameHint
    : sheetNames[0];

  const ws = wb.Sheets[chosenSheetName];
  if (!ws) {
    throw new Error(`تعذر العثور على الشيت: ${chosenSheetName}`);
  }

  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (rows.length === 0) {
    throw new Error('الشيت فارغ ولا يحتوي على صفوف بيانات.');
  }

  const parsedPromos: PromotionOffer[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextMonthIso = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  rows.forEach((row, idx) => {
    // Detect product code, unified code, name, discount % and promo price flexibly
    const rawCode = String(
      row['كود الصنف'] || row['كود المنتج'] || row['الكود'] || row['Code'] || row['code'] || row['SKU'] || ''
    ).trim();

    const rawUnified = String(
      row['الكود الموحد'] || row['كود موحد'] || row['الموحد'] || row['UnifiedCode'] || row['unified_code'] || ''
    ).replace(/^#/, '').trim();

    const rawName = String(
      row['اسم المنتج'] || row['اسم الصنف'] || row['المنتج'] || row['الصنف'] || row['Name'] || row['name'] || ''
    ).trim();

    if (!rawCode && !rawUnified && !rawName) return;

    const rawDiscount = Number(
      String(row['نسبة الخصم'] || row['نسبة الخصم %'] || row['الخصم %'] || row['الخصم'] || row['Discount'] || '0').replace('%', '').trim()
    ) || 0;

    const rawPromoPrice = Number(
      row['سعر العرض'] || row['سعر العرض للكرتونة'] || row['سعر الخصم'] || row['سعر ترويجي'] || row['PromoPrice'] || 0
    ) || 0;

    const rawOriginalPrice = Number(
      row['السعر الأصلي'] || row['سعر الكرتونة'] || row['السعر'] || row['Price'] || 0
    ) || 0;

    const rawTitle = String(
      row['عنوان العرض'] || row['اسم العرض'] || row['العرض'] || row['Title'] || ''
    ).trim() || `عرض خاص: ${rawName || rawCode}`;

    const rawStart = String(row['تاريخ البداية'] || row['من تاريخ'] || row['StartDate'] || todayIso).trim();
    const rawEnd = String(row['تاريخ النهاية'] || row['إلى تاريخ'] || row['EndDate'] || nextMonthIso).trim();
    const rawBranch = String(row['الفرع'] || row['الفروع المشمولة'] || row['Branch'] || 'كل الفروع').trim();
    const rawNotes = String(row['ملاحظات'] || row['شروط العرض'] || row['Notes'] || '').trim();
    const rawCategory = String(row['التصنيف'] || row['المجموعة'] || row['Category'] || '').trim();

    parsedPromos.push({
      id: `promo-imported-${Date.now()}-${idx}`,
      title: rawTitle,
      productCode: rawCode,
      unifiedCode: rawUnified || undefined,
      productName: rawName || `صنف كود ${rawCode}`,
      category: rawCategory || undefined,
      discountPercentage: rawDiscount,
      promoPrice: rawPromoPrice > 0 ? rawPromoPrice : undefined,
      originalPrice: rawOriginalPrice > 0 ? rawOriginalPrice : undefined,
      startDate: rawStart,
      endDate: rawEnd,
      branchName: rawBranch || 'كل الفروع',
      status: 'نشط',
      notes: rawNotes || undefined,
      createdAt: new Date().toISOString(),
      sourceSheet: chosenSheetName,
    });
  });

  return {
    promotions: parsedPromos,
    message: `تمت قراءة ${parsedPromos.length} عرض بنجاح من الشيت (${chosenSheetName}).`,
    matchedCount: parsedPromos.length,
  };
}

/**
 * Applies active promotions to the master product list.
 * Matches by productCode or unifiedCode or name.
 */
export function applyPromotionsToProducts(
  products: Product[],
  promotions: PromotionOffer[]
): { updatedProducts: Product[]; updatedCount: number } {
  const activePromos = promotions.filter((p) => p.status === 'نشط');
  if (activePromos.length === 0) {
    return { updatedProducts: products, updatedCount: 0 };
  }

  let count = 0;
  const updatedProducts = products.map((prod) => {
    const prodCode = cleanProductCode(prod.code).toLowerCase();
    const prodUnified = (prod.unifiedCode || '').replace(/^#/, '').toLowerCase().trim();
    const prodName = prod.name.trim().toLowerCase();

    // Find matching active promo
    const matchedPromo = activePromos.find((promo) => {
      if (promo.productCode && cleanProductCode(promo.productCode).toLowerCase() === prodCode) return true;
      if (promo.unifiedCode && prodUnified && promo.unifiedCode.toLowerCase() === prodUnified) return true;
      if (promo.productName && promo.productName.trim().toLowerCase() === prodName) return true;
      return false;
    });

    if (!matchedPromo) return prod;

    count++;
    const factor = prod.cartonQuantity || 24;
    const originalCartonPrice = prod.cartonPrice || (prod.piecePrice ? prod.piecePrice * factor : 200);

    let promoCartonPrice = matchedPromo.promoPrice;
    let discountPct = matchedPromo.discountPercentage;

    if (!promoCartonPrice && discountPct > 0) {
      promoCartonPrice = Number((originalCartonPrice * (1 - discountPct / 100)).toFixed(2));
    } else if (promoCartonPrice && discountPct <= 0 && originalCartonPrice > 0) {
      discountPct = Number((((originalCartonPrice - promoCartonPrice) / originalCartonPrice) * 100).toFixed(1));
    }

    const promoPiecePrice = promoCartonPrice ? Number((promoCartonPrice / factor).toFixed(2)) : undefined;

    return {
      ...prod,
      promoPrice: promoCartonPrice,
      promoPiecePrice: promoPiecePrice,
      offerPrice: promoCartonPrice,
      discountPercent: discountPct,
      discountPercentage: discountPct,
      status: 'عرض ترويجي' as const,
      salesPriority: 'مرتفع' as const,
    };
  });

  return { updatedProducts, updatedCount: count };
}

/**
 * Export promotions list to a formatted Excel file
 */
export function exportPromotionsToExcel(promotions: PromotionOffer[]): void {
  const wb = XLSX.utils.book_new();

  const titleRow = ['مجموعة الطنطاوي للتجارة والتوزيع — كشف العروض والخصومات الترويجية الرسمية'];
  const dateRow = [`تاريخ الاستخراج: ${new Date().toLocaleDateString('ar-EG')}`, `إجمالي العروض: ${promotions.length} عرض`];

  const headers = [
    'م',
    'عنوان العرض',
    'اسم المنتج',
    'كود الصنف',
    'الكود الموحد (#)',
    'التصنيف',
    'السعر الأصلي (ج.م)',
    'نسبة الخصم %',
    'سعر العرض للكرتونة (ج.م)',
    'تاريخ البداية',
    'تاريخ النهاية',
    'الفروع المشمولة',
    'حالة العرض',
    'ملاحظات والشروط',
  ];

  const rows: any[][] = [
    titleRow,
    dateRow,
    [], // Blank row
    headers,
  ];

  promotions.forEach((p, idx) => {
    rows.push([
      idx + 1,
      p.title,
      p.productName,
      p.productCode,
      p.unifiedCode ? `#${p.unifiedCode}` : '---',
      p.category || 'عام',
      p.originalPrice || '---',
      `${p.discountPercentage}%`,
      p.promoPrice || '---',
      p.startDate || '---',
      p.endDate || '---',
      p.branchName || 'كل الفروع',
      p.status,
      p.notes || '---',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },
    { wch: 30 },
    { wch: 35 },
    { wch: 15 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 40 },
  ];

  (ws as any)['!views'] = [{ RTL: true }];

  XLSX.utils.book_append_sheet(wb, ws, 'العروض والخصومات الترويجية');
  const fileDate = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `عروض_وخصومات_الطنطاوي_${fileDate}.xlsx`);
}
