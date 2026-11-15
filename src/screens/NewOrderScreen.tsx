import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, User, CheckCircle2 } from 'lucide-react';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const initialItems: CartItem[] = [
  { id: '1', name: 'كاسات زجاج 330 مل', price: 25, qty: 2 },
  { id: '2', name: 'أطباق بلاستيك', price: 15, qty: 1 },
  { id: '3', name: 'أكواب ورقية', price: 12, qty: 3 },
];

export const NewOrderScreen: React.FC = () => {
  const [items, setItems] = useState<CartItem[]>(initialItems);
  const [customer, setCustomer] = useState('');

  const updateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const tax = subtotal * 0.14;
  const total = subtotal + tax;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-40">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">طلبية جديدة</h1>
        </div>

        {/* Customer Selector */}
        <button className="w-full bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-700 flex items-center gap-3 mb-4 active:scale-[0.99] transition">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <span className={`flex-1 text-right text-sm font-bold ${customer ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
            {customer || 'اختر العميل'}
          </span>
        </button>

        {/* Cart Items */}
        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-700 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{it.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{it.price} ج.م × {it.qty}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateQty(it.id, -1)} className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center active:scale-90">
                  <Minus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                </button>
                <span className="w-6 text-center text-sm font-black text-slate-900 dark:text-white">{it.qty}</span>
                <button onClick={() => updateQty(it.id, 1)} className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center active:scale-90">
                  <Plus className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <button onClick={() => removeItem(it.id)} className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center active:scale-90">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-12">
              <ShoppingCart className="w-14 h-14 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">السلة فارغة</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Checkout Bar */}
      {items.length > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-xl border border-slate-100 dark:border-slate-700">
            <div className="space-y-1 mb-3 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>المجموع الفرعي</span><span>{subtotal.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>الضريبة (14%)</span><span>{tax.toFixed(2)} ج.م</span>
              </div>
              <div className="flex justify-between font-black text-slate-900 dark:text-white text-sm pt-1 border-t border-slate-100 dark:border-slate-700">
                <span>الإجمالي</span><span>{total.toFixed(2)} ج.م</span>
              </div>
            </div>
            <button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition">
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد الطلبية</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewOrderScreen;
