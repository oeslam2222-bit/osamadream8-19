import * as XLSX from 'xlsx-js-style';
import { Product, PromotionOffer, User } from '../types';
import { cleanProductCode, buildGoogleSheetsPublicCsvUrl } from './excelService';
import { extractBaseProductCode } from './productVariantService';
import { parseExcelOrCsvBuffer } from './encodingService';
import { isBranchMatch, normalizeArabicText } from './arabicMatchingService';

const PROMOTIONS_STORAGE_KEY = 'tantawy_promotions_offers_v1';

export const OFFER_BRANCH_STOCK_COLUMNS = [
  'متاح اكتوبر',
  'الفيوم',
  'ديمشلت',
  'منوف',
  'منيا القمح',
  'القاهرة',
  'البحيرة',
  'المنيا',
] as const;

export const INITIAL_PROMOTIONS: PromotionOffer[] = [];

/** توحيد قيمة القطاع للعروض: 'home' (منزلي) | 'electrical' (كهربائي) */
export function normalizeOfferSector(value?: string | null): 'home' | 'electrical' | undefined {
  if (!value) return undefined;
  const v = String(value).trim().toLowerCase();
  if (!v) return undefined;
  if (v.includes('كهرب') || v === 'electrical' || v === 'electric') return 'electrical';
  if (v.includes('منزل') || v === 'home') return 'home';
  return undefined;
}

/**
 * استنتاج قطاع العرض بدون تعديل قاعدة البيانات:
 * الحقل الصريح ← اسم الفرع ← قطاع الصنف المرتبط بالعرض.
 */
export function inferOfferSector(
  offer: PromotionOffer,
  products: Product[] = []
): 'home' | 'electrical' | undefined {
  const explicit = normalizeOfferSector(offer.sector as unknown as string);
  if (explicit) return explicit;
  const fromBranch = normalizeOfferSector(offer.branchName);
  if (fromBranch) return fromBranch;
  if (products.length && (offer.productCode || offer.unifiedCode)) {
    const prod = products.find(
      (p) => p.code === offer.productCode || (offer.unifiedCode && p.unifiedCode === offer.unifiedCode)
    );
    if (prod?.sector === 'home' || prod?.sector === 'electrical') return prod.sector;
  }
  return undefined;
}

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

    // Detect all 21 requested offer sheet columns + rep/branch/dates flexibly
    const rawCode = cleanProductCode(
      getVal(
        'Item number', 'Item Number', 'item_number', 'ItemCode', 'Item Code', 'ItemNo',
        'كود الصنف', 'كود المنتج', 'الكود', 'كود', 'رقم الصنف', 'الموديل', 'Code', 'code', 'SKU'
      )
    );

    const rawUnified = cleanProductCode(
      getVal('الكود الموحد', 'كود موحد', 'الموحد', 'كود موضح', 'UnifiedCode', 'unified_code').replace(/^#/, '')
    );

    const rawName = getVal(
      'Product name', 'Product Name', 'product_name',
      'اسم المنتج', 'اسم الصنف', 'المنتج', 'الصنف', 'الاسم', 'البيان', 'Name', 'name'
    );

    if (!rawCode && !rawUnified && !rawName) return;

    const rawPriority = getVal('اولوية البيع', 'أولوية البيع', 'الاولوية', 'SalesPriority');
    const rawSupplyPlan = getVal('خطة التوريد', 'خطه التوريد', 'SupplyPlan');
    const rawItemStatus = getVal('حالة الصنف', 'حاله الصنف', 'ItemStatus');
    const rawFactor = getNum('Factor', 'factor', 'شدة الكرتونة', 'الشدة');
    const rawSize = getVal('Size', 'size', 'المقاس', 'الحجم');
    const rawColor = getVal('Color', 'color', 'اللون');
    const rawItemGroup = getVal('Item group', 'Item Group', 'item_group', 'التصنيف', 'المجموعة', 'Category');
    const rawFamilyName = getVal('Family Name', 'Family name', 'family_name', 'العائلة', 'الفئة');

    const rawDiscount = getNum('نسبة الخصم', 'نسبة الخصم %', 'الخصم %', 'الخصم', 'نسبه الخصم', 'Discount', 'discount');
    const rawPromoPrice = getNum(
      'سعر العرض', 'سعر العرض للكرتونة', 'سعر الخصم', 'سعر ترويجي', 'السعر الجديد', 'سعر العرض كرتونة', 'PromoPrice', 'offer_price'
    );
    const rawOriginalPrice = getNum(
      'سعر اللستة', 'سعر اللسته', 'السعر الأصلي', 'سعر الكرتونة', 'السعر', 'السعر قبل الخصم', 'ListPrice', 'Price', 'original_price'
    );
    const rawPromoPiecePrice = getNum('سعر القطعة بالعرض', 'سعر العرض للقطعة', 'سعر القطعة ترويجي', 'سعر القطعة جديد');

    // Auto-calculate discount % if سعر اللستة & سعر العرض are provided without explicit %
    const computedDiscount =
      rawDiscount > 0
        ? rawDiscount
        : rawOriginalPrice > 0 && rawPromoPrice > 0 && rawPromoPrice < rawOriginalPrice
          ? Number((((rawOriginalPrice - rawPromoPrice) / rawOriginalPrice) * 100).toFixed(1))
          : 0;

    // Parse 8 branch stock availability columns
    const branchStocks: Record<string, number> = {};
    const availableBranches: string[] = [];
    const branchColumnAliases: Record<(typeof OFFER_BRANCH_STOCK_COLUMNS)[number], string[]> = {
      'متاح اكتوبر': ['متاح اكتوبر', 'متاح أكتوبر', 'اكتوبر', 'أكتوبر', 'مخزن اكتوبر', 'مخزن أكتوبر'],
      'الفيوم': ['الفيوم', 'فرع الفيوم'],
      'ديمشلت': ['ديمشلت', 'فرع ديمشلت', 'دمشلت'],
      'منوف': ['منوف', 'فرع منوف'],
      'منيا القمح': ['منيا القمح', 'فرع منيا القمح'],
      'القاهرة': ['القاهرة', 'فرع القاهرة', 'القاهره'],
      'البحيرة': ['البحيرة', 'فرع البحيرة', 'البحيره'],
      'المنيا': ['المنيا', 'فرع المنيا'],
    };

    OFFER_BRANCH_STOCK_COLUMNS.forEach((bKey) => {
      const valStr = getVal(...branchColumnAliases[bKey]);
      if (valStr !== '') {
        const num = getNum(...branchColumnAliases[bKey]);
        branchStocks[bKey] = num;
        if (num > 0) {
          availableBranches.push(bKey);
        } else if (/^(نعم|متاح|yes|true|available|✓)$/i.test(valStr)) {
          branchStocks[bKey] = 1;
          availableBranches.push(bKey);
        }
      }
    });

    const explicitBranch = getVal('الفرع', 'الفروع المشمولة', 'Branch');
    const explicitRep = getVal('المندوب', 'اسم المندوب', 'مندوب المبيعات', 'Rep', 'SalesRep');
    const rawTitle = getVal('عنوان العرض', 'اسم العرض', 'العرض', 'Title') || `${rawName || rawCode}`;
    const rawStart = getVal('تاريخ البداية', 'من تاريخ', 'StartDate') || todayIso;
    const rawEnd = getVal('تاريخ النهاية', 'إلى تاريخ', 'EndDate') || nextMonthIso;
    const rawNotes = getVal('ملاحظات', 'شروط العرض', 'Notes');
    const rawSector = getVal('القطاع', 'Sector', 'sector', 'نوع القطاع');
    const parsedSector = normalizeOfferSector(rawSector);

    const resolvedBranchName = explicitBranch
      ? explicitBranch
      : availableBranches.length === 1
        ? availableBranches[0]
        : availableBranches.length > 1
          ? availableBranches.slice(0, 3).join('، ') + (availableBranches.length > 3 ? ` (+${availableBranches.length - 3})` : '')
          : 'كل الفروع';

    parsedPromos.push({
      id: `promo-imported-${Date.now()}-${idx}`,
      title: rawTitle,
      productCode: rawCode,
      unifiedCode: rawUnified || undefined,
      productName: rawName || (rawCode ? `صنف كود ${rawCode}` : 'صنف ترويجي'),
      salesPriority: rawPriority || undefined,
      supplyPlan: rawSupplyPlan || undefined,
      itemStatus: rawItemStatus || undefined,
      factor: rawFactor > 0 ? rawFactor : undefined,
      size: rawSize || undefined,
      color: rawColor || undefined,
      itemGroup: rawItemGroup || undefined,
      familyName: rawFamilyName || undefined,
      category: rawItemGroup || rawFamilyName || undefined,
      sector: parsedSector,
      discountPercentage: computedDiscount,
      promoPrice: rawPromoPrice > 0 ? rawPromoPrice : undefined,
      promoPiecePrice:
        rawPromoPiecePrice > 0
          ? rawPromoPiecePrice
          : rawPromoPrice > 0 && rawFactor > 0
            ? Number((rawPromoPrice / rawFactor).toFixed(2))
            : undefined,
      originalPrice: rawOriginalPrice > 0 ? rawOriginalPrice : undefined,
      startDate: rawStart,
      endDate: rawEnd,
      branchName: resolvedBranchName,
      branchStocks: Object.keys(branchStocks).length > 0 ? branchStocks : undefined,
      eligibleBranches: explicitBranch && explicitBranch !== 'كل الفروع'
        ? explicitBranch.split(/[،,/]/).map((s) => s.trim()).filter(Boolean)
        : availableBranches.length > 0
          ? availableBranches
          : undefined,
      repName: explicitRep || undefined,
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

/** التحقق من أن العرض يشمل فرعاً محدداً (يدعم أعمدة أرصدة الفروع + الفرع الصريح) */
export function doesOfferApplyToBranch(offer: PromotionOffer, targetBranch?: string | null): boolean {
  if (!targetBranch || targetBranch === 'الكل' || targetBranch === 'كل الفروع') return true;

  if (offer.eligibleBranches && offer.eligibleBranches.length > 0) {
    return offer.eligibleBranches.some((b) => isBranchMatch(b, targetBranch, { allowUnassigned: false }));
  }

  if (offer.branchStocks && Object.keys(offer.branchStocks).length > 0) {
    const entries = Object.entries(offer.branchStocks);
    const hasAnyStockInfo = entries.some(([, val]) => Number(val) > 0);
    if (hasAnyStockInfo) {
      const matched = entries.find(([bKey]) => {
        const cleanKey = bKey === 'متاح اكتوبر' ? 'أكتوبر' : bKey;
        return isBranchMatch(cleanKey, targetBranch, { allowUnassigned: false });
      });
      if (matched) return Number(matched[1]) > 0;
      return false;
    }
  }

  const branchStr = (offer.branchName || '').trim();
  if (!branchStr || branchStr === 'كل الفروع' || branchStr === 'الكل') return true;
  const parts = branchStr.split(/[،,/]/).map((s) => s.trim()).filter(Boolean);
  return parts.some((b) => isBranchMatch(b, targetBranch, { allowUnassigned: false }));
}

/** التحقق من أن العرض مخصص للمندوب (أو متاح لكل المناديب) */
export function doesOfferApplyToRep(
  offer: PromotionOffer,
  rep?: { id?: string; name?: string; username?: string; role?: string } | null
): boolean {
  const offerRep = (offer.repName || '').trim();
  if (!offerRep || offerRep === 'كل المناديب' || offerRep === 'الكل') return true;
  if (!rep) return true;
  if (offer.repId && rep.id && offer.repId === rep.id) return true;
  const normOfferRep = normalizeArabicText(offerRep);
  const normName = normalizeArabicText(rep.name || '');
  const normUser = normalizeArabicText(rep.username || '');
  return Boolean(
    (normName && (normOfferRep === normName || normName.includes(normOfferRep) || normOfferRep.includes(normName))) ||
    (normUser && normOfferRep === normUser)
  );
}

/** التحقق الموحد من أن العرض ينطبق على قطاع وفرع ومندوب المستخدم */
export function doesOfferApplyToUser(
  offer: PromotionOffer,
  user?: Pick<User, 'id' | 'name' | 'username' | 'role' | 'branchName' | 'sector'> | null,
  products: Product[] = []
): boolean {
  if (!user) return true;
  const role = user.role;
  const isAdminOrDev = role === 'admin' || role === 'developer';

  // 1. عزل القطاع
  const meSector = (user.sector || '').toLowerCase();
  if (meSector && meSector !== 'all' && meSector !== 'both') {
    const offerSector = inferOfferSector(offer, products);
    if (offerSector && offerSector !== meSector) return false;
  }

  if (isAdminOrDev) return true;

  // 2. عزل الفرع للأدوار الميدانية ومديري الفروع
  if (user.branchName && !doesOfferApplyToBranch(offer, user.branchName)) {
    return false;
  }

  // 3. عزل المندوب (للمندوب يرى عروضه الشخصية أو العامة؛ للمشرف يرى عروض فرعه)
  if (role === 'sales_rep' && !doesOfferApplyToRep(offer, user)) {
    return false;
  }

  return true;
}

export function filterPromotionsForUser(
  promotions: PromotionOffer[],
  user?: Pick<User, 'id' | 'name' | 'username' | 'role' | 'branchName' | 'sector'> | null,
  products: Product[] = []
): PromotionOffer[] {
  if (!promotions || promotions.length === 0) return [];
  if (!user || user.role === 'admin' || user.role === 'developer') return promotions;
  return promotions.filter((offer) => doesOfferApplyToUser(offer, user, products));
}

/**
 * Find the matching active promotion for a product by code, baseCode, unifiedCode, or clean name
 */
export function findPromotionForProduct(
  prod: Pick<Product, 'code' | 'unifiedCode' | 'name'>,
  promotions: PromotionOffer[]
): PromotionOffer | undefined {
  if (!prod || !promotions || promotions.length === 0) return undefined;
  const prodCode = cleanProductCode(prod.code).toLowerCase();
  const prodUnified = cleanProductCode(prod.unifiedCode?.replace(/^#/, '')).toLowerCase();
  const prodBase = extractBaseProductCode(prod.code).toLowerCase();
  const prodName = (prod.name || '').trim().toLowerCase();

  return promotions.find((promo) => {
    if (promo.status && promo.status !== 'نشط') return false;
    const pCode = cleanProductCode(promo.productCode).toLowerCase();
    const pUnified = cleanProductCode(promo.unifiedCode?.replace(/^#/, '')).toLowerCase();
    const pBase = extractBaseProductCode(promo.productCode).toLowerCase();
    const pName = (promo.productName || '').trim().toLowerCase();

    // 1. Direct code match
    if (pCode && (pCode === prodCode || pCode === prodBase)) return true;
    // 2. Base code match (e.g. promo on 8009 applies to all variants of 8009!)
    if (pBase && (pBase === prodBase || pBase === prodCode)) return true;
    // 3. Unified code match
    if (pUnified && (pUnified === prodUnified || pUnified === prodCode)) return true;
    // 4. Exact or clean name match
    if (
      pName &&
      prodName &&
      (pName === prodName ||
        (prodName.length > 5 && pName.includes(prodName)) ||
        (pName.length > 5 && prodName.includes(pName)))
    ) {
      return true;
    }
    return false;
  });
}

export interface ResolvedProductPromoInfo {
  hasPromo: boolean;
  promo?: PromotionOffer;
  discountPercentage: number;
  originalCartonPrice: number;
  promoCartonPrice: number;
  originalPiecePrice: number;
  promoPiecePrice: number;
}

/**
 * Resolve effective promotional discount & before/after prices for a product
 */
export function resolveProductPromotion(
  prod: Product,
  promotions: PromotionOffer[] = []
): ResolvedProductPromoInfo {
  const factor = prod.cartonQuantity && prod.cartonQuantity > 0 ? prod.cartonQuantity : prod.factor || 1;
  const rawPiece = Number(prod.piecePrice || prod.salesPrice || 0);
  const originalCartonPrice =
    rawPiece > 0
      ? Math.round(rawPiece * factor * 100) / 100
      : Number(prod.cartonPrice || 0);
  const originalPiecePrice =
    rawPiece > 0
      ? rawPiece
      : factor > 0
        ? Math.round((originalCartonPrice / factor) * 100) / 100
        : originalCartonPrice;

  const matchedPromo = findPromotionForProduct(prod, promotions);
  const inlinePromoPrice = Number(prod.promoPrice || prod.offerPrice || 0);
  const inlineDiscount = Number(prod.discountPercent || prod.discountPercentage || 0);

  if (!matchedPromo && !(inlinePromoPrice > 0 && inlinePromoPrice < originalCartonPrice)) {
    return {
      hasPromo: false,
      discountPercentage: 0,
      originalCartonPrice,
      promoCartonPrice: originalCartonPrice,
      originalPiecePrice,
      promoPiecePrice: originalPiecePrice,
    };
  }

  let promoCartonPrice = matchedPromo?.promoPrice && matchedPromo.promoPrice > 0
    ? Number(matchedPromo.promoPrice)
    : inlinePromoPrice;
  let discountPct = matchedPromo?.discountPercentage && matchedPromo.discountPercentage > 0
    ? Number(matchedPromo.discountPercentage)
    : inlineDiscount;

  if ((!promoCartonPrice || promoCartonPrice <= 0) && discountPct > 0 && originalCartonPrice > 0) {
    promoCartonPrice = Number((originalCartonPrice * (1 - discountPct / 100)).toFixed(2));
  } else if (promoCartonPrice > 0 && discountPct <= 0 && originalCartonPrice > 0 && promoCartonPrice < originalCartonPrice) {
    discountPct = Number((((originalCartonPrice - promoCartonPrice) / originalCartonPrice) * 100).toFixed(1));
  }

  if (!promoCartonPrice || promoCartonPrice <= 0 || (originalCartonPrice > 0 && promoCartonPrice >= originalCartonPrice)) {
    return {
      hasPromo: false,
      discountPercentage: 0,
      originalCartonPrice,
      promoCartonPrice: originalCartonPrice,
      originalPiecePrice,
      promoPiecePrice: originalPiecePrice,
    };
  }

  const promoPiecePrice =
    matchedPromo?.promoPiecePrice && matchedPromo.promoPiecePrice > 0
      ? Number(matchedPromo.promoPiecePrice)
      : prod.promoPiecePrice && prod.promoPiecePrice > 0
        ? Number(prod.promoPiecePrice)
        : factor > 0
          ? Number((promoCartonPrice / factor).toFixed(2))
          : promoCartonPrice;

  return {
    hasPromo: true,
    promo: matchedPromo,
    discountPercentage: discountPct,
    originalCartonPrice,
    promoCartonPrice,
    originalPiecePrice,
    promoPiecePrice,
  };
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
    const matchedPromo = findPromotionForProduct(prod, activePromos);

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
    const basePiecePrice = Number(prod.piecePrice || prod.salesPrice || 0);
    const originalCartonPrice =
      basePiecePrice > 0
        ? Math.round(basePiecePrice * factor * 100) / 100
        : (prod.cartonPrice || 200);

    let promoCartonPrice = matchedPromo.promoPrice;
    let discountPct = matchedPromo.discountPercentage;

    if ((!promoCartonPrice || promoCartonPrice <= 0) && discountPct > 0) {
      promoCartonPrice = Number((originalCartonPrice * (1 - discountPct / 100)).toFixed(2));
    } else if (promoCartonPrice && discountPct <= 0 && originalCartonPrice > 0) {
      discountPct = Number((((originalCartonPrice - promoCartonPrice) / originalCartonPrice) * 100).toFixed(1));
    }

    const promoPiecePrice =
      matchedPromo.promoPiecePrice ||
      (promoCartonPrice && factor > 0 ? Number((promoCartonPrice / factor).toFixed(2)) : undefined);

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
    'Item number',
    'Product name',
    'اولوية البيع',
    'خطة التوريد',
    'حالة الصنف',
    'Factor',
    'Size',
    'Color',
    'Item group',
    'Family Name',
    'سعر اللستة',
    'سعر العرض',
    'نسبة الخصم %',
    'متاح اكتوبر',
    'الفيوم',
    'ديمشلت',
    'منوف',
    'منيا القمح',
    'القاهرة',
    'البحيرة',
    'المنيا',
    'القطاع',
    'المندوب',
    'حالة العرض',
  ];

  const rows: any[][] = [
    titleRow,
    dateRow,
    [], // Blank row
    headers,
  ];

  promotions.forEach((p) => {
    const sectorText = p.sector === 'electrical' ? 'كهربائي' : p.sector === 'home' ? 'منزلي' : 'الكل';
    rows.push([
      p.productCode,
      p.productName,
      p.salesPriority || '',
      p.supplyPlan || '',
      p.itemStatus || '',
      p.factor ?? '',
      p.size || '',
      p.color || '',
      p.itemGroup || p.category || '',
      p.familyName || '',
      p.originalPrice ?? '',
      p.promoPrice ?? '',
      `${p.discountPercentage}%`,
      p.branchStocks?.['متاح اكتوبر'] ?? '',
      p.branchStocks?.['الفيوم'] ?? '',
      p.branchStocks?.['ديمشلت'] ?? '',
      p.branchStocks?.['منوف'] ?? '',
      p.branchStocks?.['منيا القمح'] ?? '',
      p.branchStocks?.['القاهرة'] ?? '',
      p.branchStocks?.['البحيرة'] ?? '',
      p.branchStocks?.['المنيا'] ?? '',
      sectorText,
      p.repName || 'كل المناديب',
      p.status,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 15 },
    { wch: 35 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
  ];

  (ws as any)['!views'] = [{ RTL: true }];

  XLSX.utils.book_append_sheet(wb, ws, 'العروض والخصومات الترويجية');
  const fileDate = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `عروض_وخصومات_الطنطاوي_${fileDate}.xlsx`);
}
