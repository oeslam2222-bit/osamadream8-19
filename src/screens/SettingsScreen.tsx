import React from 'react';
import { Settings, User, Bell, Globe, Shield, LogOut, ChevronLeft, Moon } from 'lucide-react';
import { useTheme } from '../context/themeContext';

export const SettingsScreen: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();

  const items = [
    { icon: User, label: 'الملف الشخصي', color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
    { icon: Bell, label: 'الإشعارات', color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
    { icon: Globe, label: 'اللغة والمنطقة', color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
    { icon: Shield, label: 'الخصوصية والأمان', color: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
  ];

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-950 pb-24">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h1 className="font-arabic-display font-bold text-xl text-slate-900 dark:text-white">الإعدادات</h1>
        </div>

        {/* Profile Card */}
        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-4 mb-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-xl">م</div>
            <div>
              <p className="font-bold text-white text-base">محمد أحمد</p>
              <p className="text-blue-200 text-xs">مندوب مبيعات — فرع القاهرة</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden mb-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button key={i} className="w-full flex items-center gap-3 p-3.5 border-b border-slate-100 dark:border-slate-700 last:border-0 active:bg-slate-50 dark:active:bg-slate-700/50">
                <div className={`w-9 h-9 rounded-lg ${item.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="flex-1 text-right text-sm font-bold text-slate-900 dark:text-white">{item.label}</span>
                <ChevronLeft className="w-4 h-4 text-slate-400 rtl:rotate-0" />
              </button>
            );
          })}
        </div>

        {/* Dark Mode Toggle */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 p-3.5 mb-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
            <Moon className="w-5 h-5 text-slate-600 dark:text-amber-400" />
          </div>
          <span className="flex-1 text-right text-sm font-bold text-slate-900 dark:text-white">الوضع الليلي</span>
          <button
            onClick={toggleTheme}
            className={`w-11 h-6 rounded-full transition relative ${isDark ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${isDark ? 'right-0.5' : 'left-0.5'}`}></span>
          </button>
        </div>

        {/* Logout */}
        <button className="w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-3.5 flex items-center justify-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm active:scale-95 transition">
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

export default SettingsScreen;
