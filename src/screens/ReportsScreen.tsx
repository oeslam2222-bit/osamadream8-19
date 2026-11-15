import React from 'react';
import { BarChart3, TrendingUp, TrendingDown, Wallet, Users, Package } from 'lucide-react';

const months = [
  { name: 'يناير', value: 65 },
  { name: 'فبراير', value: 45 },
  { name: 'مارس', value: 78 },
  { name: 'أبريل', value: 55 },
  { name: 'مايو', value: 90 },
  { name: 'يونيو', value: 72 },
];

export const ReportsScreen: React.FC = () => {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">التقارير</h1>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-3.5 text-white shadow-lg">
            <Wallet className="w-5 h-5 text-blue-200 mb-2" />
            <p className="text-[10px] text-blue-200">إجمالي المبيعات</p>
            <p className="font-arabic-display font-black text-xl">125,400</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-300" />
              <span className="text-[10px] text-green-300 font-bold">+18%</span>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 border border-slate-100 dark:border-slate-700">
            <Users className="w-5 h-5 text-green-600 dark:text-green-400 mb-2" />
            <p className="text-[10px] text-slate-500 dark:text-slate-400">عملاء جدد</p>
            <p className="font-arabic-display font-black text-xl text-slate-900 dark:text-white">42</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-500" />
              <span className="text-[10px] text-green-500 font-bold">+8%</span>
            </div>
          </div>
        </div>

        {/* Sales Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">المبيعات الشهرية</h2>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">2026</span>
          </div>
          <div className="flex items-end justify-between gap-2 h-40">
            {months.map((m) => (
              <div key={m.name} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-t-md relative" style={{ height: '120px' }}>
                  <div
                    className="absolute bottom-0 w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md"
                    style={{ height: `${m.value}%` }}
                  ></div>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400">{m.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">أداء الأصناف</h2>
          <div className="space-y-3">
            {[
              { name: 'كاسات زجاج', pct: 85 },
              { name: 'أطباق بلاستيك', pct: 62 },
              { name: 'أكواب ورقية', pct: 48 },
            ].map((p) => (
              <div key={p.name}>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">{p.name}</span>
                  <span className="text-slate-500 dark:text-slate-400">{p.pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.pct}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsScreen;
