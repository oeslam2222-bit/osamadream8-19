import React from 'react';
import { Home, Package, Receipt, Users, ShieldCheck, Calendar, Settings, LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/themeContext';

interface SidebarDesktopProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCollapse?: () => void;
}

const navItems = [
  { key: 'dashboard', label: 'الرئيسية', icon: Home },
  { key: 'catalog', label: 'الكتالوج', icon: Package },
  { key: 'invoices', label: 'الفواتير', icon: Receipt },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'inventory', label: 'المخزون', icon: ShieldCheck },
  { key: 'notifications', label: 'الإشعارات', icon: Calendar },
  { key: 'settings', label: 'الإعدادات', icon: Settings },
] as const;

export const SidebarDesktop: React.FC<SidebarDesktopProps> = ({
  activeTab,
  onTabChange,
  onCollapse,
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 z-30">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-600 dark:bg-amber-500 rounded-lg flex items-center justify-center text-white font-black text-lg">
            T
          </div>
          <div>
            <h3 className="font-arabic-display font-bold text-lg text-slate-900 dark:text-white">طنطاوي جروب</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">منظومة المبيعات</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl touch-target transition-all duration-200 text-left ${isActive
                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-r-4 border-amber-600 dark:border-amber-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sun className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-sm text-slate-700 dark:text-slate-300">الوضع النهاري</span>
          </div>
          <Moon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
        </button>
        <button
          onClick={onCollapse}
          className="mt-3 w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-left transition-colors"
        >
          <span className="font-medium text-sm text-slate-700 dark:text-slate-300">تسجيل الخروج</span>
          <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-500" />
        </button>
      </div>
    </aside>
  );
};