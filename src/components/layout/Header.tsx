import React from 'react';
import { Bell, Menu, Sun, Moon, User, ShoppingCart } from 'lucide-react';
import { useTheme } from '../../context/themeContext';
import { Button } from '../ui/Button';

interface HeaderProps {
  onMenuClick?: () => void;
  title?: string;
  showCart?: boolean;
  cartCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  onMenuClick,
  title,
  showCart = false,
  cartCount = 0,
}) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="fixed top-0 right-0 left-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 shadow-soft">
      <div className="flex items-center justify-between px-4 md:px-6 h-16">
        {/* Menu Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onMenuClick}
          className="w-10 h-10 rounded-full touch-target"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Title / Logo */}
        <div className="flex-1 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 bg-amber-600 dark:bg-amber-500 rounded-lg flex items-center justify-center text-white font-black text-sm">
              T
            </div>
            {title ? (
              <span className="font-arabic-display font-bold text-lg text-slate-900 dark:text-white">{title}</span>
            ) : (
              <span className="font-arabic-display font-bold text-lg text-slate-900 dark:text-white">طنطاوي جروب</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {showCart && (
            <Button
              variant="outline"
              size="sm"
              className="w-10 h-10 rounded-full touch-target relative"
            >
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full touch-target"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-500" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-10 h-10 rounded-full touch-target"
          >
            <User className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};