import React from 'react';
import { Bell, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/themeContext';

interface MobileHeaderProps {
  title?: string;
  notificationCount?: number;
  onOpenNotifications?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  title = 'مجموعة الطنطاوي',
  notificationCount = 0,
  onOpenNotifications,
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">
            T
          </div>
          <span className="font-arabic-display font-bold text-sm text-slate-900 dark:text-white">{title}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition"
            aria-label="تبديل الوضع"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          <button
            onClick={onOpenNotifications}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center relative active:scale-95 transition"
            aria-label="الإشعارات"
          >
            <Bell className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </button>

          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
            م
          </div>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;