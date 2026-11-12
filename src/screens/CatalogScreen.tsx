import React, { useState } from 'react';
import { Search, SlidersHorizontal, Plus, Minus, GlassWater, Utensils, Coffee, Droplets, ScrollText, Sparkles, Copy, Edit, CheckCircle2, XCircle } from 'lucide-react';

type ProductIcon = React.ComponentType<{ className?: string }>;

interface Product {
  id: string;
  name: string;
  price: string;
  code: string;
  stockBranch: number;
  stockOct: number;
  Icon: ProductIcon;
  color: string;
  bgColor: string;
}

const stockStatus = (b: number, o: number) => {
  const min = Math.min(b, o);
  if (min <= 0) return 'risk';
  if (min < 10) return 'warn';
  return 'ok';
};

const products: Product[] = [
  { id: '1', name: 'كاسات زجاج 330 مل', price: '25.00', code: 'GLASS-330', stockBranch: 45, stockOct: 60, Icon: GlassWater, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: '2', name: 'أطباق بلاستيك', price: '15.00', code: 'PLATE-PL', stockBranch: 8, stockOct: 12, Icon: Utensils, color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
  { id: '3', name: 'أكواب ورقية', price: '12.00', code: 'CUP-PAPER', stockBranch: 0, stockOct: 5, Icon: Coffee, color: 'text-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: '4', name: 'منظفات الغسيل', price: '45.00', code: 'DET-LAU', stockBranch: 120, stockOct: 80, Icon: Droplets, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20' },
  { id: '5', name: 'ورق التواليت', price: '35.00', code: 'TP-ROLL', stockBranch: 30, stockOct: 2, Icon: ScrollText, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: '6', name: 'صابون سائل', price: '28.00', code: 'SOAP-LIQ', stockBranch: 15, stockOct: 15, Icon: Sparkles, color: 'text-pink-500', bgColor: 'bg-pink-50 dark:bg-pink-900/20' },
];

export const CatalogScreen: React.FC = () => {
  const [search, setSearch] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  const filteredProducts = products.filter((p) => p.name.includes(search));
  const isAdded = (id: string) => added.has(id);
  const toggleAdd = (id: string) => setAdded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const stockStatusColor = (status: string) => {
    if (status === 'ok') return 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800';
    if (status === 'warn') return 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800';
  };

  const stockStatusText = (status: string) => {
    if (status === 'ok') return 'متوفر';
    if (status === 'warn') return 'منخفض';
    return 'غير متوفر';
  };

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white mb-3">الكتالوج</h1>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ابحث عن منتج..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button className="w-11 h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {filteredProducts.map((product) => {
            const Icon = product.Icon;
            const status = stockStatus(product.stockBranch, product.stockOct);
            const statusText = stockStatusText(status);
            return (
              <div key={product.id} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col h-full">
                <div className={`h-20 ${product.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-10 h-10 ${product.color}`} />
                </div>
                <div className="p-3 flex flex-col h-full">
                  <div className="mb-1">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">{product.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-1.5 py-0.5">{product.code}</span>
                      <button className="w-6 h-6 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-600">
                        <Copy className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between mt-1 mb-2">
                    <span className="font-black text-xl text-slate-900 dark:text-white">{product.price}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">ج.م</span>
                  </div>
                  <div className={`flex items-center justify-between mb-3 border rounded-md px-2 py-1 ${stockStatusColor(status)}`}>
                    <span className="text-[10px] font-bold">{product.stockBranch} | {product.stockOct}</span>
                    <span className="text-[9px] font-bold">{statusText}</span>
                  </div>
                  {added ? (
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => toggleAdd(product.id)}
                        className="w-1/2 h-8 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"
                      >
                        <Minus className="w-3.5 h-3.5" />
                        <span>نقص</span>
                      </button>
                      <button
                        onClick={() => toggleAdd(product.id)}
                        className="w-1/2 h-8 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>في السلة</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => toggleAdd(product.id)}
                      className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CatalogScreen;
