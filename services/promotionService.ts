import * as XLSX from 'xlsx-js-style';
import { Product, PromotionOffer } from '../types';
import { cleanProductCode, buildGoogleSheetsPublicCsvUrl } from './excelService';
import { extractBaseProductCode } from './productVariantService';
import { decodeBufferSmart, parseExcelOrCsvBuffer } from './encodingService';

const PROMOTIONS_STORAGE_KEY = 'tantawy_promotions_offers_v1';

export const INITIAL_PROMOTIONS: PromotionOffer[] = [];

// Known dummy / mock promotional items to purge from storage
const DUMMY_PROMO_IDS = new Set(['promo-1', 'promo-2', 'promo-3']);

/**
 * Load saved promotion offers from localStorage
 */
export function getSavedPromotions(): PromotionOffer[] {
  try {
    const raw = localStorage.getItem(PROMOTIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Auto-clean any legacy dummy promotions (mock items 1001, 1005, 1012)
    const cleaned = parsed.filter((p: PromotionOffer) => {
      if (p.id && DUMMY_PROMO_IDS.has(p.id)) return false;
      if (p.sourceSheet === 'شيت_عروض_الشركة_المركزي') return false;
      const pName = (p.productName || '').trim();
      if (
        pName.includes('كرانشي بالجبنة المتبلة') ||
        pName.includes('ويفر شوكولاتة كريمة البندق') ||
        pName.includes('بسكويت شاي سادة عائلي شدة 24')
      ) {
        return false;
      }
      return true;
    });

    // If cleaned list differs, overwrite localStorage to purge dummy data permanently
    if (cleaned.length !== parsed.length) {
      localStorage.setItem(PROMOTIONS_STORAGE_KEY, JSON.stringify(cleaned));
    }

    return cleaned;
  } catch {
    return [];
  }
}

/**
 * Clear all promotions from localStorage
 */
export function clearAllPromotions(): void {
  try {
    localStorage.removeItem(PROMOTIONS_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear promotions from localStorage', err);
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
 * Normalizes header string to match flexibly
 */
function normalizePromoKey(header: string): string {
  if (!header) return '';
  let str = header.toString().trim();
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    str = str.split(arabicNumerals[i]).join(String(i));
  }
  return str
    .toLowerCase()
    .replace(/[ـ\s_%\-]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
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
    // Build normalized row lookup map
    const rowNorm: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      rowNorm[normalizePromoKey(k)] = row[k];
    });

    const getVal = (...keys: string[]): string => {
      for (const k of keys) {
        const val = row[k] ?? rowNorm[normalizePromoKey(k)];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return String(val).trim();
        }
      }
      return '';
    };

    const getNum = (...keys: string[]): number => {
      for (const k of keys) {
        const val = row[k] ?? rowNorm[normalizePromoKey(k)];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const clean = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '');
          const parsed = parseFloat(clean);
          if (!isNaN(parsed)) return parsed;
        }
      }
      return 0;
    };

    // Detect product code, unified code, name, discount % and promo price flexibly
    const rawCode = cleanProductCode(
      getVal('كود الصنف', 'كود المنتج', 'الكود', 'كود', 'رقم الصنف', 'الموديل', 'Code', 'code', 'SKU', 'Item Code', 'ItemNo')
    );

    const rawUnified = cleanProductCode(
      getVal('الكود الموحد', 'كود موحد', 'الموحد', 'كود موضح', 'UnifiedCode', 'unified_code').replace(/^#/, '')
    );

    const rawName = getVal('اسم المنتج', 'اسم الصنف', 'المنتج', 'الصنف', 'الاسم', 'البيان', 'Name', 'name');

    if (!rawCode && !rawUnified && !rawName) return;

    const rawDiscount = getNum('نسبة الخصم', 'نسبة الخصم %', 'الخصم %', 'الخصم', 'نسبه الخصم', 'Discount', 'discount');
    const rawPromoPrice = getNum('سعر العرض', 'سعر العرض للكرتونة', 'سعر الخصم', 'سعر ترويجي', 'السعر الجديد', 'سعر العرض كرتونة', 'PromoPrice', 'offer_price');
    const rawOriginalPrice = getNum('السعر الأصلي', 'سعر الكرتونة', 'السعر', 'السعر قبل الخصم', 'Price', 'original_price');
    const rawPromoPiecePrice = getNum('سعر القطعة بالعرض', 'سعر العرض للقطعة', 'سعر القطعة ترويجي', 'سعر القطعة جديد');

    const rawTitle = getVal('عنوان العرض', 'اسم العرض', 'العرض', 'Title') || `عرض خاص: ${rawName || rawCode}`;
    const rawStart = getVal('تاريخ البداية', 'من تاريخ', 'StartDate') || todayIso;
    const rawEnd = getVal('تاريخ النهاية', 'إلى تاريخ', 'EndDate') || nextMonthIso;
    const rawBranch = getVal('الفرع', 'الفروع المشمولة', 'Branch') || 'كل الفروع';
    const rawNotes = getVal('ملاحظات', 'شروط العرض', 'Notes');
    const rawCategory = getVal('التصنيف', 'المجموعة', 'Category');

    parsedPromos.push({
      id: `promo-imported-${Date.now()}-${idx}`,
      title: rawTitle,
      productCode: rawCode,
      unifiedCode: rawUnified || undefined,
      productName: rawName || (rawCode ? `صنف كود ${rawCode}` : 'صنف ترويجي'),
      category: rawCategory || undefined,
      discountPercentage: rawDiscount,
      promoPrice: rawPromoPrice > 0 ? rawPromoPrice : undefined,
      promoPiecePrice: rawPromoPiecePrice > 0 ? rawPromoPiecePrice : undefined,
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
    message: `تمت قراءة ${parsedPromos.length} عرض بنجاح من شيت العروض (${chosenSheetName}).`,
    matchedCount: parsedPromos.length,
  };
}

/**
 * Fetch and parse promotions directly from a Google Sheets URL
 */
export async function parsePromotionsFromGoogleSheet(
  sheetUrl: string
): Promise<{ promotions: PromotionOffer[]; message: string; matchedCount: number }> {
  const csvUrl = buildGoogleSheetsPublicCsvUrl(sheetUrl);
  if (!csvUrl) {
    throw new Error('رابط Google Sheets غير صالح. يرجى التأكد من نسخ الرابط بشكل صحيح.');
  }

  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`تعذر تحميل شيت Google Sheets (${response.statusText}). تأكد أن الشيت متاح للقراءة.`);
  }

  const buffer = await response.arrayBuffer();
  return parsePromotionsFromExcelBuffer(buffer, 'GoogleSheets');
}

/**
 * Applies active promotions to the master product list.
 * Matches by productCode, baseCode, unifiedCode, or name.
 */
export function applyPromotionsToProducts(
  products: Product[],
  promotions: PromotionOffer[]
): { updatedProducts: Product[]; updatedCount: number; revertedCount: number } {
  const activePromos = promotions.filter((p) => p.status === 'نشط');

  let updatedCount = 0;
  let revertedCount = 0;

  const updatedProducts = products.map((prod) => {
    const prodCode = cleanProductCode(prod.code).toLowerCase();
    const prodUnified = cleanProductCode(prod.unifiedCode?.replace(/^#/, '')).toLowerCase();
    const prodBase = extractBaseProductCode(prod.code).toLowerCase();
    const prodName = prod.name.trim().toLowerCase();

    // Find matching active promo
    const matchedPromo = activePromos.find((promo) => {
      const pCode = cleanProductCode(promo.productCode).toLowerCase();
      const pUnified = cleanProductCode(promo.unifiedCode?.replace(/^#/, '')).toLowerCase();
      const pBase = extractBaseProductCode(promo.productCode).toLowerCase();
      const pName = promo.productName.trim().toLowerCase();

      // 1. Direct code match
      if (pCode && (pCode === prodCode || pCode === prodBase)) return true;
      // 2. Base code match (e.g. promo on 8009 applies to all variants of 8009!)
      if (pBase && (pBase === prodBase || pBase === prodCode)) return true;
      // 3. Unified code match
      if (pUnified && (pUnified === prodUnified || pUnified === prodCode)) return true;
      // 4. Exact or clean name match
      if (pName && (pName === prodName || (prodName.length > 5 && pName.includes(prodName)) || (pName.length > 5 && prodName.includes(pName)))) {
        return true;
      }
      return false;
    });

    if (!matchedPromo) {
      // Revert any leftover promotional fields if product has no matching active promotion
      if (
        prod.promoPrice !== undefined ||
        prod.offerPrice !== undefined ||
        prod.discountPercent !== undefined ||
        prod.discountPercentage !== undefined ||
        prod.status === 'عرض ترويجي'
      ) {
        revertedCount++;
        const nextProd = { ...prod };
        delete (nextProd as any).promoPrice;
        delete (nextProd as any).promoPiecePrice;
        delete (nextProd as any).offerPrice;
        delete (nextProd as any).discountPercent;
        delete (nextProd as any).discountPercentage;
        if (nextProd.status === 'عرض ترويجي') {
          nextProd.status = 'متاح';
        }
        return nextProd;
      }
      return prod;
    }

    updatedCount++;
    const factor = prod.cartonQuantity || prod.factor || 1;
    const originalCartonPrice = prod.cartonPrice || (prod.piecePrice ? prod.piecePrice * factor : 200);

    let promoCartonPrice = matchedPromo.promoPrice;
    let discountPct = matchedPromo.discountPercentage;

    if (!promoCartonPrice && discountPct > 0) {
      promoCartonPrice = Number((originalCartonPrice * (1 - discountPct / 100)).toFixed(2));
    } else if (promoCartonPrice && discountPct <= 0 && originalCartonPrice > 0) {
      discountPct = Number((((originalCartonPrice - promoCartonPrice) / originalCartonPrice) * 100).toFixed(1));
    }

    const promoPiecePrice = matchedPromo.promoPiecePrice || (promoCartonPrice ? Number((promoCartonPrice / factor).toFixed(2)) : undefined);

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

  return { updatedProducts, updatedCount, revertedCount };
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
