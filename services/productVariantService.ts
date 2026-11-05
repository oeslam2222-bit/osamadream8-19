import { ItemStatus, ParentProduct, Product, ProductVariant, SalesPriority } from '../types';
import { cleanProductCode, extractCodeFromProductName } from './excelService';

/**
 * Optimizes image URLs for crystal-clear, high-definition viewing
 * Prevents eye strain by providing generous sizes (800px - 1200px) and proper aspect ratios.
 */
export function getHighResVariantImageUrl(url?: string, targetWidth = 800): string {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (!clean) return '';

  // Google Drive / lh3 CDN links: replace size parameters with high-res target
  if (clean.includes('googleusercontent.com') || clean.includes('drive.google.com')) {
    if (/=[swhd]\d+/i.test(clean)) {
      return clean.replace(/=[swhd]\d+[^&]*/i, `=w${targetWidth}-nu`);
    }
    return `${clean}=w${targetWidth}-nu`;
  }

  // Cloudinary links: ensure high quality transformation (q_auto:best, f_auto, w_800)
  if (clean.includes('res.cloudinary.com')) {
    if (clean.includes('/upload/')) {
      return clean.replace('/upload/', `/upload/c_limit,w_${targetWidth},q_auto,f_auto/`);
    }
  }

  return clean;
}

/**
 * Extracts the base unifying product code from any raw variant code.
 * Strips variant suffixes like:
 * - "1005741 #" -> "1005741"
 * - "1005741 #1", "1005741 #2" -> "1005741"
 * - "1005741 green", "1005741 red", "1005741 أحمر" -> "1005741"
 * - "1005741-1", "1005741_02", "6008-01", "8009/1", "8009.1" -> "1005741", "6008", "8009"
 * - "#1005741", "#1005741-1" -> "1005741"
 * - "DRM-101-1" -> "DRM-101"
 */
export function extractBaseProductCode(raw?: string | null): string {
  if (!raw) return '';
  let s = String(raw).trim();
  if (
    !s ||
    s === '---' ||
    s === '--' ||
    s === '-' ||
    s === '#---' ||
    s === '#--' ||
    s === '#-' ||
    s === '#0' ||
    s === '0' ||
    s === 'بدون' ||
    s === 'null' ||
    s === 'undefined'
  ) {
    return '';
  }

  // Normalize Arabic digits ٠-٩ to 0-9
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));

  // Strip leading hash #
  s = s.replace(/^#\s*/, '').trim();

  // Pattern 1: Code followed by # or #number or #word (e.g. "1005741 #", "1005741 #1", "1005741 #2", "8009 # شباك 1")
  const hashMatch = s.match(/^(.+?)\s*#\s*([0-9]*|[a-zA-Z\u0621-\u064A]*.*)$/);
  if (hashMatch && hashMatch[1].trim()) {
    return hashMatch[1].trim();
  }

  // Pattern 2: Numeric base code (3+ digits) followed by separator and 1-3 digits or letters (e.g. "1005741-1", "6008-01", "8009/3", "8009.1")
  const numSuffixMatch = s.match(/^([0-9]{3,})[-_/.]([0-9]{1,3})$/);
  if (numSuffixMatch && numSuffixMatch[1].trim()) {
    return numSuffixMatch[1].trim();
  }

  // Pattern 2b: Multi-part code with trailing variant number or single letter (e.g. "DRM-101-1" => "DRM-101", "8009-A" => "8009")
  const multiPartMatch = s.match(/^([A-Za-z0-9]+[-_][0-9]+)[-_/.]([0-9]{1,3}|[A-Za-z])$/);
  if (multiPartMatch && multiPartMatch[1].trim()) {
    return multiPartMatch[1].trim();
  }

  // Pattern 2c: Number code followed by letter variant (e.g. "8009-A", "8009 A", "8009-B")
  const letterMatch = s.match(/^([0-9]{3,})[-_\s]([A-Za-z])$/);
  if (letterMatch && letterMatch[1].trim()) {
    return letterMatch[1].trim();
  }

  // Pattern 3: Number code followed by space and color or word (e.g. "1005741 green", "1005741 red", "1005741 أحمر", "8009 شباك 1", "8009 60 ق")
  const colorMatch = s.match(/^([0-9]{3,})\s+(?:شباك|ش|لون|ق)?\s*([a-zA-Z\u0621-\u064A0-9]+.*)$/);
  if (colorMatch && colorMatch[1].trim()) {
    return colorMatch[1].trim();
  }

  return s;
}

/**
 * Detects or extracts window number / variant designation from product attributes
 */
export function extractWindowInfo(
  product: Product,
  indexInGroup: number
): { name: string; windowNumber: number; color: string } {
  const pName = (product.name || '').trim();
  const pColor = (product.color || '').trim();
  const pCode = (product.code || '').trim();
  const pUnified = (product.unifiedCode || '').trim();

  // 0. Clean and sanitize color value
  let cleanColor = pColor.replace(/\(blank\)/gi, '').replace(/blank/gi, '').trim();
  if (cleanColor === '-' || cleanColor === 'عام' || cleanColor === 'بدون' || cleanColor.includes('غير محدد') || cleanColor === '0') {
    cleanColor = '';
  }

  // If no explicit color on product.color, check if code or unifiedCode has a color suffix
  // e.g. "1005741 green" or "1005741 أحمر"
  if (!cleanColor) {
    const combined = `${pCode} ${pUnified}`;
    const colorSuffixMatch = combined.match(/\s+([a-zA-Z\u0621-\u064A]{2,})$/);
    if (colorSuffixMatch && !/^[0-9]+$/.test(colorSuffixMatch[1])) {
      const candidate = colorSuffixMatch[1].trim();
      const lowerCandidate = candidate.toLowerCase();
      const knownColors = ['green', 'red', 'blue', 'yellow', 'black', 'white', 'gold', 'silver', 'brown', 'pink', 'purple', 'orange', 'grey', 'gray', 'أخضر', 'أحمر', 'أزرق', 'أصفر', 'أسود', 'أبيض', 'ذهبي', 'فضي', 'بني', 'وردي', 'رمادي', 'كحلي', 'بيج', 'عسلي'];
      if (knownColors.includes(lowerCandidate) || knownColors.some((c) => candidate.includes(c))) {
        cleanColor = candidate;
      }
    }
  }

  // 1. Look for explicit Arabic "شباك X" in name, color, unifiedCode or notes
  const windowRegex = /شباك\s*([0-9\u0660-\u0669]+|[أ-ي]+)/i;
  const matchName = pName.match(windowRegex);
  const matchColor = pColor.match(windowRegex);
  const matchUnified = pUnified.match(windowRegex);

  const arabicNumMap: Record<string, number> = {
    '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'واحد': 1, 'اثنين': 2, 'تلاتة': 3, 'ثلاثة': 3, 'اربعة': 4, 'أربعة': 4, 'خمسة': 5
  };

  const explicitMatch = matchColor || matchName || matchUnified;
  if (explicitMatch) {
    const rawVal = explicitMatch[1];
    const num = arabicNumMap[rawVal] || parseInt(rawVal, 10) || (indexInGroup + 1);
    return {
      name: cleanColor ? `شباك ${num} (${cleanColor})` : `شباك ${num}`,
      windowNumber: num,
      color: cleanColor || `شباك ${num}`,
    };
  }

  // 2. Check hash with number in code or unified code (e.g. "1005741 #1", "#2", "#1005741 #1")
  const hashNumMatch = `${pCode} ${pUnified}`.match(/#\s*([0-9\u0660-\u0669]+)/);
  if (hashNumMatch) {
    const rawVal = hashNumMatch[1];
    const num = arabicNumMap[rawVal] || parseInt(rawVal, 10) || (indexInGroup + 1);
    return {
      name: cleanColor ? `شباك ${num} (${cleanColor})` : `شباك ${num} (#${num})`,
      windowNumber: num,
      color: cleanColor || `شباك ${num}`,
    };
  }

  // 3. Check suffix in product code (e.g. 100061-1, 100061_02, 100061/3)
  const codeSuffixMatch = pCode.match(/[-_/]([0-9]{1,2})$/);
  if (codeSuffixMatch) {
    const num = parseInt(codeSuffixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        name: cleanColor ? `شباك ${num} (${cleanColor})` : `شباك ${num}`,
        windowNumber: num,
        color: cleanColor || `شباك ${num}`,
      };
    }
  }

  // 4. If color is distinct and not generic
  if (cleanColor) {
    return {
      name: `لون ${cleanColor}`,
      windowNumber: indexInGroup + 1,
      color: cleanColor,
    };
  }

  // Fallback: standard 1-based window numbering
  return {
    name: `شباك ${indexInGroup + 1}`,
    windowNumber: indexInGroup + 1,
    color: `شباك ${indexInGroup + 1}`,
  };
}

/**
 * Extracts base unifying code for grouping products into Parent items
 */
export function getUnifiedBaseKey(product: Product): { key: string; displayCode: string; unifiedCode?: string } {
  let rawCode = cleanProductCode(product.code);
  let rawUnified = cleanProductCode(product.unifiedCode?.replace(/^#/, ''));

  // 1. If code is missing, fallback to unifiedCode
  if (!rawCode && rawUnified) {
    rawCode = rawUnified;
  }

  // 2. If code is still missing, extract model from product name (e.g. "سفرة 8009 60 ق KAZAN" -> "8009")
  if (!rawCode && product.name) {
    const extracted = extractCodeFromProductName(product.name);
    if (extracted) {
      rawCode = extracted;
    }
  }

  // 3. Group primarily by the Base Product Code (e.g. 1005741 from 1005741, 1005741 #, 1005741 green, 1005741 #1).
  const baseFromCode = extractBaseProductCode(rawCode);
  if (baseFromCode) {
    const cleanUnified = rawUnified
      ? (rawUnified.startsWith('#') ? rawUnified : `#${rawUnified}`)
      : (rawCode !== baseFromCode ? (rawCode.startsWith('#') ? rawCode : `#${rawCode}`) : `#${baseFromCode}`);
    return {
      key: baseFromCode.toLowerCase(),
      displayCode: baseFromCode,
      unifiedCode: cleanUnified,
    };
  }

  // 4. Fallback to unifiedCode if baseFromCode failed
  const baseFromUnified = extractBaseProductCode(rawUnified);
  if (baseFromUnified) {
    return {
      key: baseFromUnified.toLowerCase(),
      displayCode: baseFromUnified,
      unifiedCode: rawUnified.startsWith('#') ? rawUnified : `#${rawUnified}`,
    };
  }

  // 5. Fallback to product name or ID
  const cleanName = (product.name || '').trim();
  const fallbackKey = (cleanName || product.id || 'unknown').trim().toLowerCase();
  const candidateCode = rawCode || rawUnified || extractCodeFromProductName(cleanName);
  const displayCode = candidateCode || (cleanName ? cleanName.slice(0, 20) : 'صنف موحد');

  return {
    key: fallbackKey,
    displayCode,
    unifiedCode: rawUnified ? (rawUnified.startsWith('#') ? rawUnified : `#${rawUnified}`) : `#${displayCode}`,
  };
}

/**
 * Strips variant specific mentions from product name to yield the general parent product name
 */
export function cleanParentProductName(name: string): string {
  if (!name) return '';
  return name
    .replace(/[-–]\s*شباك\s*[0-9\u0660-\u0669]+/gi, '')
    .replace(/\s*شباك\s*[0-9\u0660-\u0669]+/gi, '')
    .replace(/[-–]\s*(لون\s*)?[أ-ي]+(\s*(فاتح|غامق|مط|لامع))?$/gi, (match) => {
      // Keep general names if too short
      if (match.length > 25) return match;
      return '';
    })
    .trim();
}

/**
 * Groups a flat array of 5,444 products into ~3,444 consolidated Parent Products with Variants/Windows
 */
// ذاكرة تخزين مؤقت فائقة السرعة لمنع تكرار معالجة 5,000+ صنف عند التنقل بين الصفحات
const parentGroupCache = new WeakMap<Product[], ParentProduct[]>();

export function groupProductsIntoParents(products: Product[]): ParentProduct[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  const cached = parentGroupCache.get(products);
  if (cached) return cached;

  const groupMap = new Map<string, {
    key: string;
    displayCode: string;
    unifiedCode?: string;
    items: Product[];
  }>();

  // 1. Group items by unified base key
  products.forEach((prod) => {
    const { key, displayCode, unifiedCode } = getUnifiedBaseKey(prod);
    const existing = groupMap.get(key);
    if (!existing) {
      groupMap.set(key, {
        key,
        displayCode,
        unifiedCode,
        items: [prod],
      });
    } else {
      existing.items.push(prod);
      // Prefer explicit unifiedCode if available on any variant
      if (!existing.unifiedCode && unifiedCode) {
        existing.unifiedCode = unifiedCode;
      }
    }
  });

  // 2. Build ParentProduct models
  const parentProducts: ParentProduct[] = [];

  groupMap.forEach(({ key, displayCode, unifiedCode, items }) => {
    // Sort variants by window number or code
    const variants: ProductVariant[] = items.map((prod, idx) => {
      const windowInfo = extractWindowInfo(prod, idx);
      const highResImg = getHighResVariantImageUrl(prod.imageUrl, 900);

      const vCartonQty = Math.max(1, Number(prod.cartonQuantity || prod.factor) || 1);
      let vPiecePrice = Number(
        prod.piecePrice ??
        prod.salesPrice ??
        prod.price ??
        (prod as any).piece_price ??
        (prod as any).sales_price ??
        (prod as any)['سعر القطعة'] ??
        (prod as any)['سعر القطعه'] ??
        (prod as any)['سعر البيع'] ??
        0
      );
      let vCartonPrice = Number(
        prod.cartonPrice ??
        (prod as any).carton_price ??
        (prod as any)['سعر الكرتونة'] ??
        (prod as any)['سعر الكرتونه'] ??
        0
      );

      // حساب إجمالي الكرتونة = سعر القطعة × شدة الكرتونة دائماً
      if (vPiecePrice > 0) {
        vCartonPrice = Math.round(vPiecePrice * vCartonQty * 100) / 100;
      } else if (vCartonPrice > 0) {
        vPiecePrice = Math.round((vCartonPrice / vCartonQty) * 100) / 100;
      }

      const rawPromo = Number(prod.promoPrice || prod.offerPrice || 0);
      const cleanPromo = rawPromo > vPiecePrice && rawPromo < vCartonPrice ? rawPromo : undefined;

      const cleanVCode = cleanProductCode(prod.code) || (items.length > 1 ? `${displayCode}-${idx + 1}` : displayCode);
      const rawU = cleanProductCode(prod.unifiedCode?.replace(/^#/, ''));
      const cleanVUnified = rawU
        ? (rawU.startsWith('#') ? rawU : `#${rawU}`)
        : `#${displayCode}${items.length > 1 || windowInfo.windowNumber > 1 ? ` #${windowInfo.windowNumber}` : ''}`;

      return {
        id: prod.id || `var_${cleanVCode}_${idx}`,
        productId: key,
        code: cleanVCode,
        unifiedCode: cleanVUnified,
        name: windowInfo.name,
        windowNumber: windowInfo.windowNumber,
        color: windowInfo.color,
        imageUrl: highResImg || prod.imageUrl,
        branchStockActual: prod.branchStockActual || 0,
        branchStockReserved: prod.branchStockReserved || 0,
        mainWarehouseActual: prod.mainWarehouseActual || 0,
        mainWarehouseReserved: prod.mainWarehouseReserved || 0,
        cartonQuantity: vCartonQty,
        piecePrice: vPiecePrice,
        cartonPrice: vCartonPrice,
        promoPrice: cleanPromo,
        promoPiecePrice: cleanPromo ? Math.round((cleanPromo / vCartonQty) * 100) / 100 : undefined,
        status: prod.status || 'متاح',
        barcode: prod.barcode,
        rawProduct: {
          ...prod,
          code: cleanVCode,
          unifiedCode: cleanVUnified,
          cartonQuantity: vCartonQty,
          piecePrice: vPiecePrice,
          cartonPrice: vCartonPrice,
          promoPrice: cleanPromo,
          offerPrice: cleanPromo,
        },
      };
    });

    // Sort variants by window number ascending
    variants.sort((a, b) => (a.windowNumber || 0) - (b.windowNumber || 0));

    // Determine primary/default variant (preferably one in stock or with an image)
    const inStockVariant = variants.find((v) => (v.branchStockActual + v.mainWarehouseActual) > 0);
    const withImageVariant = variants.find((v) => Boolean(v.imageUrl));
    const defaultVariant = inStockVariant || withImageVariant || variants[0];

    // Representative attributes from first or default variant
    const firstItem = defaultVariant.rawProduct || items[0];
    const generalName = cleanParentProductName(firstItem.name) || firstItem.name;

    // Price range across variants
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let totalBranchStock = 0;
    let totalOctoberStock = 0;

    variants.forEach((v) => {
      const p = v.cartonPrice || 0;
      if (p > 0) {
        if (p < minPrice) minPrice = p;
        if (p > maxPrice) maxPrice = p;
      }
      totalBranchStock += v.branchStockActual || 0;
      totalOctoberStock += v.mainWarehouseActual || 0;
    });

    if (minPrice === Infinity) minPrice = firstItem.cartonPrice || 0;
    if (maxPrice === -Infinity) maxPrice = firstItem.cartonPrice || 0;

    // Priority and Status
    const priorities: SalesPriority[] = ['مرتفع', 'متوسط', 'عادي', 'منخفض'];
    const highestPriority = priorities.find((pr) => items.some((i) => i.salesPriority === pr)) || firstItem.salesPriority || 'عادي';

    const parent: ParentProduct = {
      id: `parent_${key}`,
      primaryCode: displayCode,
      unifiedCode: (unifiedCode && !unifiedCode.includes('---'))
        ? unifiedCode
        : (displayCode.startsWith('#') ? displayCode : `#${displayCode}`),
      name: generalName,
      department: firstItem.department || firstItem.itemGroup || firstItem.category || 'عام',
      category: firstItem.category || firstItem.itemGroup || 'عام',
      classification: firstItem.classification || firstItem.familyName || '',
      familyName: firstItem.familyName || firstItem.classification,
      salesPriority: highestPriority,
      status: totalBranchStock + totalOctoberStock > 0 ? 'متاح' : (firstItem.status || 'راكد'),
      cartonQuantity: firstItem.cartonQuantity || firstItem.factor || 1,
      imageUrl: defaultVariant.imageUrl || firstItem.imageUrl,
      minPrice,
      maxPrice,
      totalBranchStock,
      totalOctoberStock,
      variants,
      variantsCount: variants.length,
      hasMultipleVariants: variants.length > 1,
      defaultVariant,
    };

    parentProducts.push(parent);
  });

  parentGroupCache.set(products, parentProducts);
  return parentProducts;
}
