import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Customer, Invoice, CartItem, Product } from '../types';

interface InvoiceContextType {
  invoices: Invoice[];
  cart: CartItem[];
  customers: Customer[];
  products: Product[];
  isLoading: boolean;
  createOrder: (orderData: any) => Promise<{ success: boolean; invoice?: Invoice; message?: string }>;
  addToCart: (item: CartItem) => void;
  removeFromCart: (productId: string) => void;
  updateCartItem: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getCartSummary: () => { itemCount: number; grandTotal: number };
  editPendingOrder: (invoice: Invoice) => { success: boolean; customer?: Customer; message?: string };
  setInvoices: (invoices: Invoice[]) => void;
  setCart: (cart: CartItem[]) => void;
  setCustomers: (customers: Customer[]) => void;
  setProducts: (products: Product[]) => void;
}

const InvoiceContext = createContext<InvoiceContextType | null>(null);

export function InvoiceProvider({ children }: { children: React.ReactNode }) {
  const [invoices, setInvoicesState] = useState<Invoice[]>([]);
  const [cart, setCartState] = useState<CartItem[]>([]);
  const [customers, setCustomersState] = useState<Customer[]>([]);
  const [products, setProductsState] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addToCart = useCallback((item: CartItem) => {
    setCartState(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        return prev.map(i => i.productId === item.productId ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCartState(prev => prev.filter(i => i.productId !== productId));
  }, []);

  const updateCartItem = useCallback((productId: string, quantity: number) => {
    setCartState(prev => prev.map(i => i.productId === productId ? { ...i, quantity } : i));
  }, []);

  const clearCart = useCallback(() => setCartState([]), []);

  const getCartSummary = useCallback(() => {
    const itemCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    const grandTotal = cart.reduce((acc, item) => acc + (item.quantity * (item.pricePerCarton || 0)), 0);
    return { itemCount, grandTotal };
  }, [cart]);

  const createOrder = useCallback(async (orderData: any) => {
    setIsLoading(true);
    try {
      const newInvoice: Invoice = {
        id: crypto.randomUUID(),
        invoiceNumber: `INV-${Date.now()}`,
        customerId: orderData.customerId || '',
        customerName: orderData.customerName || 'عميل',
        items: orderData.items || [],
        total: orderData.total || 0,
        status: 'قيد مراجعة المشرف',
        createdAt: new Date().toISOString(),
        branchName: orderData.branchName || '',
        repName: orderData.repName || '',
      };
      setInvoicesState(prev => [...prev, newInvoice]);
      clearCart();
      return { success: true, invoice: newInvoice };
    } catch (err: any) {
      return { success: false, message: err.message || 'فشل إنشاء الطلبية' };
    } finally {
      setIsLoading(false);
    }
  }, [clearCart]);

  const editPendingOrder = useCallback((invoice: Invoice) => {
    const found = invoices.find(inv => inv.id === invoice.id);
    if (!found) return { success: false, message: 'الفاتورة غير موجودة' };
    const customer = customers.find(c => c.id === found.customerId);
    return { success: true, customer: customer || undefined };
  }, [invoices, customers]);

  const setInvoices = useCallback((invoices: Invoice[]) => setInvoicesState(invoices), []);
  const setCart = useCallback((cart: CartItem[]) => setCartState(cart), []);
  const setCustomers = useCallback((customers: Customer[]) => setCustomersState(customers), []);
  const setProducts = useCallback((products: Product[]) => setProductsState(products), []);

  const value = useMemo(() => ({
    invoices, cart, customers, products, isLoading,
    createOrder, addToCart, removeFromCart, updateCartItem, clearCart,
    getCartSummary, editPendingOrder,
    setInvoices, setCart, setCustomers, setProducts
  }), [invoices, cart, customers, products, isLoading, createOrder, addToCart, removeFromCart, updateCartItem, clearCart, getCartSummary, editPendingOrder, setInvoices, setCart, setCustomers, setProducts]);

  return (
    <InvoiceContext.Provider value={value}>
      {children}
    </InvoiceContext.Provider>
  );
}

export function useInvoice() {
  const ctx = useContext(InvoiceContext);
  if (!ctx) throw new Error('useInvoice must be used within InvoiceProvider');
  return ctx;
}