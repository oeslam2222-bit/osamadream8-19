import React from 'react';
import { Package, Calendar, BarChart3, Bell, Settings, ShoppingCart, ChevronLeft, LogOut } from 'lucide-react';

interface MoreScreenProps {
  onNavigate: (screen: string) => void;
  onLogout?: () => void;
}

const menuItems = [
  { key: 'inventory', label: 'المخزون', desc: 'الأصناف والكميات', icon: Package, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' },
  { key: 'visits', label: 'الزيارات', desc: 'سجل زيارات العملاء', icon: Calendar, color: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' },
  { key: 'reports', label: 'التقارير', desc: 'تحليلات المبيعات', icon: BarChart3, color: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400' },
  { key: 'neworder', label: 'طلبية جديدة', desc: 'إنشاء فاتورة', icon: ShoppingCart, color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' },
  { key: 'notifications', label: 'الإشعارات', desc: 'آخر التحديثات', icon: Bell, color: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
  { key: 'settings', label: 'الإعدادات', desc: 'الملف والتفضيلات', icon: Settings, color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300' },
];

export const MoreScreen: React.FC<MoreScreenProps> = ({ onNavigate, onLogout }) => {
  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-4">
        {/* Profile Header */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-xl">م</div>
            <div className="flex-1">
              <p className="font-bold text-white text-base">محمد أحمد</p>
              <p className="text-blue-200 text-xs">مندوب مبيعات — فرع القاهرة</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="grid grid-cols-2 gap-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 shadow-sm border border-slate-100 dark:border-slate-700 text-right active:scale-95 transition"
              >
                <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center mb-2`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{item.label}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
              </button>
            );
          })}
        </div>

        <button
          onClick={onLogout}
          className="mt-4 w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-2xl p-3.5 flex items-center justify-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm active:scale-95 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

export default MoreScreen;
