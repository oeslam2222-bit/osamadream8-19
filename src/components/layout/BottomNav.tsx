import React from 'react';
import { Home, Package, Receipt, Users, MoreHorizontal } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { key: 'dashboard', label: 'الرئيسية', icon: Home },
  { key: 'catalog', label: 'الكتالوج', icon: Package },
  { key: 'invoices', label: 'الفواتير', icon: Receipt },
  { key: 'customers', label: 'العملاء', icon: Users },
  { key: 'more', label: 'المزيد', icon: MoreHorizontal },
] as const;

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="fixed bottom-0 right-0 left-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 shadow-soft safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-3 md:py-2 h-20">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`flex flex-col items-center justify-center gap-1 w-full touch-target transition-colors duration-200 ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-500'}`}
            >
              <Icon className={`w-6 h-6 ${isActive ? '' : 'opacity-70'}`} />
              <span className="text-[10px] font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};