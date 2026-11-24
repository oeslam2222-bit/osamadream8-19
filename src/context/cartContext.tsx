import { createContext, useContext } from 'react';
import type { CartItem, Product } from '../types';

/**
 * كارت الطلب في context منفصل عن AppContext.
 *
 * السبب: `cart` كانت ضمن قيم الـAppContext الرئيسية، وكل تعديل كمية في
 * الكاشير كان بيغيّر قيمة الـcontext → كل الشاشات اللي بتنادي `useApp()`
 * (75 ملف) بتعيد الرندر مع كل ضغطة. بعد الفصل، الشاشات اللي مش بتستخدم
 * الكارت مبقتش بتترندر خالص لما الكارت يتغير.
 *
 * الحالة نفسها (`cart`) لسه عايشة في AppProvider — الفصل في التوزيع بس،
 * مش في مصدر البيانات، فمفيش نسختين من الكارت ولا احتمال تعارض.
 */
export interface CartSummary {
  totalCartons: number;
  totalPieces: number;
  subtotal: number;
  discountPercentage: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  itemCount: number;
}

export interface CartContextType {
  cart: CartItem[];
  addToCart: (
    product: Product,
    orderType?: 'carton' | 'piece' | 'mixed',
    count?: number,
    piecesCount?: number
  ) => { success: boolean; message?: string };
  updateCartItem: (productId: string, updates: Partial<CartItem>) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  getCartSummary: (customDiscountPercent?: number) => CartSummary;
}

const EMPTY_SUMMARY: CartSummary = {
  totalCartons: 0,
  totalPieces: 0,
  subtotal: 0,
  discountPercentage: 0,
  discountAmount: 0,
  taxAmount: 0,
  grandTotal: 0,
  itemCount: 0,
};

/**
 * احتياطي آمن لو مكوّن استخدم useCart برّه AppProvider (معاينة/اختبار):
 * كارت فاضي ودوال صامتة بدل ما نرمي exception يبيّض الشاشة.
 */
const FALLBACK: CartContextType = {
  cart: [],
  addToCart: () => ({ success: false, message: 'الكارت غير متاح خارج التطبيق' }),
  updateCartItem: () => {},
  removeFromCart: () => {},
  clearCart: () => {},
  getCartSummary: () => EMPTY_SUMMARY,
};

export const CartContext = createContext<CartContextType | null>(null);

export const useCart = (): CartContextType => useContext(CartContext) ?? FALLBACK;
