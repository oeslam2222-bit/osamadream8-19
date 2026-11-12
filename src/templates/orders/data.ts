/**
 * templates/orders/data.ts
 * Mock catalog for the order flow template.
 * Mirrors the real `Product` shape (types.ts) — only fields we display.
 */

export interface MockProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  cartonQuantity: number;       // شدة الكرتونة (قطعة/كرتونة)
  size: string;
  color: string;
  cartonPrice: number;
  piecePrice: number;
  promoPrice?: number;          // سعر العرض (إن وجد)
  branchStockReserved: number;  // المتاح للطلب بالكراتين
}

export const mockProducts: MockProduct[] = [
  {
    id: "p1", code: "ITM-1001", name: "كاسة ١٨ لتر", category: "كاسات",
    cartonQuantity: 6, size: "١٨ لتر", color: "شفاف",
    cartonPrice: 150, piecePrice: 25, promoPrice: 141,
    branchStockReserved: 320,
  },
  {
    id: "p2", code: "ITM-1002", name: "قنينة ١ لتر", category: "قنينات",
    cartonQuantity: 20, size: "١ لتر", color: "شفاف",
    cartonPrice: 100, piecePrice: 5,
    branchStockReserved: 540,
  },
  {
    id: "p3", code: "ITM-1003", name: "غطاء يد ١٨", category: "أغطية",
    cartonQuantity: 30, size: "١٨ لتر", color: "أزرق",
    cartonPrice: 90, piecePrice: 3,
    branchStockReserved: 210,
  },
  {
    id: "p4", code: "ITM-1004", name: "كيس تغليف ٥٠×٦٠", category: "أكياس",
    cartonQuantity: 50, size: "٥٠×٦٠ سم", color: "شفاف",
    cartonPrice: 60, piecePrice: 1.2,
    branchStockReserved: 480,
  },
  {
    id: "p5", code: "ITM-1005", name: "شباك ٢ لتر", category: "قنينات",
    cartonQuantity: 12, size: "٢ لتر", color: "أزرق",
    cartonPrice: 132, piecePrice: 11, promoPrice: 126,
    branchStockReserved: 95,
  },
  {
    id: "p6", code: "ITM-1006", name: "جرة ١٦ لتر", category: "جرات",
    cartonQuantity: 4, size: "١٦ لتر", color: "أبيض",
    cartonPrice: 220, piecePrice: 55,
    branchStockReserved: 60,
  },
];

export const productCategories = ["الكل", "كاسات", "قنينات", "أغطية", "أكياس", "جرات"];

export const paymentTermsOptions = ["نقدي", "آجل ١٥ يوم", "أسبوعي", "شهري"] as const;

export interface CartLine {
  productId: string;
  cartons: number;
  pieces: number;
}

/** Line total = cartons × price + pieces × piecePrice (with promo on carton price when present). */
export function lineTotal(product: MockProduct, cartons: number, pieces: number): number {
  const carton = product.promoPrice ?? product.cartonPrice;
  return Math.round((cartons * carton + pieces * product.piecePrice) * 100) / 100;
}

export function cartTotals(products: MockProduct[], lines: CartLine[]) {
  let subtotal = 0;
  let savings = 0;
  let totalCartons = 0;
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId);
    if (!product) continue;
    subtotal += lineTotal(product, line.cartons, line.pieces);
    if (product.promoPrice) savings += (product.cartonPrice - product.promoPrice) * line.cartons;
    totalCartons += line.cartons;
  }
  return { subtotal, savings, totalCartons, count: lines.length };
}

export const formatEGP = (v: number) =>
  `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م`;
