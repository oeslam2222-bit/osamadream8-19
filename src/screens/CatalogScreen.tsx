import React, { useState } from 'react';
import { Search, SlidersHorizontal, Plus, GlassWater, Utensils, Coffee, Droplets, ScrollText, Sparkles } from 'lucide-react';

type ProductIcon = React.ComponentType<{ className?: string }>;

interface Product {
  id: string;
  name: string;
  price: string;
  Icon: ProductIcon;
  color: string;
  bgColor: string;
}

const products: Product[] = [
  { id: '1', name: 'كاسات زجاج 330 مل', price: '25.00', Icon: GlassWater, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: '2', name: 'أطباق بلاستيك', price: '15.00', Icon: Utensils, color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
  { id: '3', name: 'أكواب ورقية', price: '12.00', Icon: Coffee, color: 'text-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: '4', name: 'منظفات الغسيل', price: '45.00', Icon: Droplets, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20' },
  { id: '5', name: 'ورق التواليت', price: '35.00', Icon: ScrollText, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: '6', name: 'صابون سائل', price: '28.00', Icon: Sparkles, color: 'text-pink-500', bgColor: 'bg-pink-50 dark:bg-pink-900/20' },
];

export const CatalogScreen: React.FC = () => {
  const [search, setSearch] = useState('');

  const filteredProducts = products.filter((p) => p.name.includes(search));

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
            return (
              <div key={product.id} className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-700">
                <div className={`h-28 ${product.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-12 h-12 ${product.color}`} />
                </div>
                <div className="p-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white mb-1 leading-tight min-h-[2rem]">{product.name}</h3>
                  <p className="text-sm font-black text-slate-900 dark:text-white mb-2">
                    {product.price} <span className="text-[10px] font-bold text-slate-500">ج.م</span>
                  </p>
                  <button className="w-full h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95 transition">
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة</span>
                  </button>
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
