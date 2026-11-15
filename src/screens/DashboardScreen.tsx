import React from 'react';
import { TrendingUp, Users, Package, Wallet, ShoppingCart, GlassWater, Coffee, Utensils } from 'lucide-react';

export const DashboardScreen: React.FC = () => {
  const topItems = [
    { name: 'كاسات زجاج 330 مل', qty: 45, icon: GlassWater, color: 'text-blue-500' },
    { name: 'أطباق بلاستيك', qty: 32, icon: Utensils, color: 'text-amber-500' },
    { name: 'أكواب ورقية', qty: 28, icon: Coffee, color: 'text-green-500' },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">اليوم</p>
        <h1 className="font-arabic-display font-bold text-lg text-slate-900 dark:text-white">الأربعاء، 5 نوفمبر 2026</h1>
      </div>

      <div className="px-4 mb-4">
        <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-blue-900 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-xs font-medium mb-1">مبيعات اليوم</p>
              <div className="flex items-baseline gap-1.5">
                <span className="font-arabic-display font-black text-white text-3xl">15,450</span>
                <span className="text-blue-200 text-sm font-bold">ج.م</span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-300" />
                <span className="text-green-300 text-[11px] font-bold">+12%</span>
                <span className="text-blue-200 text-[10px]">عن الأسبوع الماضي</span>
              </div>
            </div>
            <div className="w-16 h-16 bg-white/15 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Wallet className="w-9 h-9 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-2">
              <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">الفواتير</p>
            <p className="font-arabic-display font-black text-xl text-slate-900 dark:text-white">25</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center mb-2">
              <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">العملاء</p>
            <p className="font-arabic-display font-black text-xl text-slate-900 dark:text-white">5,200</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mb-2">
              <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">المخزون</p>
            <p className="font-arabic-display font-black text-xl text-slate-900 dark:text-white">85</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700">
            <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center mb-2">
              <Wallet className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">التحصيلات</p>
            <p className="font-arabic-display font-black text-xl text-slate-900 dark:text-white">12,750</p>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-arabic-display font-bold text-sm text-slate-900 dark:text-white">المنتجات الأكثر مبيعاً</h2>
            <button className="text-[11px] text-blue-600 dark:text-blue-400 font-bold">عرض الكل</button>
          </div>
          <div className="space-y-2.5">
            {topItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                    <Icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.qty} قطعة</p>
                  </div>
                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${(item.qty / 45) * 100}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardScreen;
