import { ItemStatus, ParentProduct, Product, ProductVariant, SalesPriority } from '../types';

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
 * Detects or extracts window number / variant designation from product attributes
 */
export function extractWindowInfo(
  product: Product,
  indexInGroup: number
): { name: string; windowNumber: number; color: string } {
  const pName = (product.name || '').trim();
  const pColor = (product.color || '').trim();
  const pCode = (product.code || '').trim();

  // 1. Look for explicit Arabic "شباك X" in name, color, or notes
  const windowRegex = /شباك\s*([0-9\u0660-\u0669]+|[أ-ي]+)/i;
  const matchName = pName.match(windowRegex);
  const matchColor = pColor.match(windowRegex);

  const arabicNumMap: Record<string, number> = {
    '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'واحد': 1, 'اثنين': 2, 'تلاتة': 3, 'ثلاثة': 3, 'اربعة': 4, 'أربعة': 4, 'خمسة': 5
  };

  if (matchColor) {
    const rawVal = matchColor[1];
    const num = arabicNumMap[rawVal] || parseInt(rawVal, 10) || (indexInGroup + 1);
    return {
      name: `شباك ${num}`,
      windowNumber: num,
      color: pColor || `شباك ${num}`,
    };
  }

  if (matchName) {
    const rawVal = matchName[1];
    const num = arabicNumMap[rawVal] || parseInt(rawVal, 10) || (indexInGroup + 1);
    return {
      name: `شباك ${num}`,
      windowNumber: num,
      color: pColor || `شباك ${num}`,
    };
  }

  // 2. Check suffix in product code (e.g. 100061-1, 100061_02, 100061/3)
  const codeSuffixMatch = pCode.match(/[-_/]([0-9]{1,2})$/);
  if (codeSuffixMatch) {
    const num = parseInt(codeSuffixMatch[1], 10);
    if (!isNaN(num) && num > 0) {
      return {
        name: pColor ? `شباك ${num} (${pColor})` : `شباك ${num}`,
        windowNumber: num,
        color: pColor || `شباك ${num}`,
      };
    }
  }

  // 3. If color is distinct and not generic
  if (pColor && pColor !== '-' && pColor !== 'عام' && pColor !== 'بدون' && !pColor.includes('غير محدد')) {
    return {
      name: `لون ${pColor}`,
      windowNumber: indexInGroup + 1,
      color: pColor,
    };
  }

  // Fallback: standard 1-based window numbering
  return {
    name: `شباك ${indexInGroup + 1}`,
    windowNumber: indexInGroup + 1,
    color: pColor || `شباك ${indexInGroup + 1}`,
  };
}

/**
 * Extracts base unifying code for grouping products into Parent items
 */
export function getUnifiedBaseKey(product: Product): { key: string; displayCode: string; unifiedCode?: string } {
  const rawCode = (product.code || '').trim();
  const rawUnified = (product.unifiedCode || '').trim();

  // 1. Group primarily by the Base Product Code (e.g. 6008).
  // A single product code may repeat 10 times in the sheet for different colors,
  // each having a distinct unifiedCode (#). Grouping by product.code consolidates
  // all 10 color variants together under code 6008 as requested by the user.
  if (rawCode) {
    const cleanWithoutSuffix = rawCode.replace(/[-_/][0-9]{1,2}$/, '').trim();
    const baseCode = cleanWithoutSuffix || rawCode;
    return {
      key: baseCode.toLowerCase(),
      displayCode: baseCode,
      unifiedCode: rawUnified || (rawCode.startsWith('#') ? rawCode : undefined),
    };
  }

  // 2. Fallback to unifiedCode if product.code is missing
  if (rawUnified) {
    const clean = rawUnified.replace(/^#/, '').trim();
    if (clean) {
      return {
        key: clean.toLowerCase(),
        displayCode: rawUnified.startsWith('#') ? rawUnified : `#${clean}`,
        unifiedCode: rawUnified.startsWith('#') ? rawUnified : `#${clean}`,
      };
    }
  }

  // 3. Fallback to product name or ID
  const fallbackKey = (product.name || product.id || 'unknown').trim().toLowerCase();
  return {
    key: fallbackKey,
    displayCode: product.code || '---',
    unifiedCode: rawUnified || undefined,
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
export function groupProductsIntoParents(products: Product[]): ParentProduct[] {
  if (!Array.isArray(products) || products.length === 0) return [];

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

      return {
        id: prod.id || `var_${prod.code}_${idx}`,
        productId: key,
        code: prod.code,
        unifiedCode: prod.unifiedCode,
        name: windowInfo.name,
        windowNumber: windowInfo.windowNumber,
        color: windowInfo.color,
        imageUrl: highResImg || prod.imageUrl,
        branchStockActual: prod.branchStockActual || 0,
        branchStockReserved: prod.branchStockReserved || 0,
        mainWarehouseActual: prod.mainWarehouseActual || 0,
        mainWarehouseReserved: prod.mainWarehouseReserved || 0,
        cartonQuantity: prod.cartonQuantity || prod.factor || 1,
        piecePrice: prod.piecePrice || prod.salesPrice || 0,
        cartonPrice: prod.cartonPrice || 0,
        promoPrice: prod.promoPrice,
        promoPiecePrice: prod.promoPiecePrice,
        status: prod.status || 'متاح',
        barcode: prod.barcode,
        rawProduct: prod,
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
      unifiedCode: unifiedCode || (displayCode.startsWith('#') ? displayCode : `#${displayCode}`),
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

  return parentProducts;
}
