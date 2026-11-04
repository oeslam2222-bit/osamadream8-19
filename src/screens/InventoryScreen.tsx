import React, { useState } from 'react';
import { Package, Search, AlertTriangle, Plus } from 'lucide-react';

interface StockItem {
  id: string;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
}

const items: StockItem[] = [
  { id: '1', name: 'كاسات زجاج 330 مل', stock: 120, minStock: 50, unit: 'قطعة' },
  { id: '2', name: 'أطباق بلاستيك', stock: 35, minStock: 50, unit: 'قطعة' },
  { id: '3', name: 'أكواب ورقية', stock: 18, minStock: 40, unit: 'قطعة' },
  { id: '4', name: 'منظفات الغسيل', stock: 240, minStock: 100, unit: 'عبوة' },
  { id: '5', name: 'ورق التواليت', stock: 90, minStock: 60, unit: 'لفة' },
];

export const InventoryScreen: React.FC = () => {
  const [search, setSearch] = useState('');
  const filtered = items.filter((i) => i.name.includes(search));

  const lowStockCount = items.filter((i) => i.stock < i.minStock).length;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">المخزون</h1>
          </div>
          <button className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center active:scale-95">
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {lowStockCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
              {lowStockCount} صنف تحت الحد الأدنى — يحتاج إعادة تعبئة
            </p>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ابحث عن صنف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 outline-none"
          />
        </div>
      </div>

      <div className="px-4 space-y-2.5">
        {filtered.map((item) => {
          const isLow = item.stock < item.minStock;
          const pct = Math.min(100, (item.stock / item.minStock) * 100);
          return (
            <div key={item.id} className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                {isLow && <AlertTriangle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-slate-500 dark:text-slate-400">المتوفر</span>
                <span className={`font-bold ${isLow ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {item.stock} {item.unit}
                </span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${isLow ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }}></div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">الحد الأدنى: {item.minStock} {item.unit}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default InventoryScreen;
