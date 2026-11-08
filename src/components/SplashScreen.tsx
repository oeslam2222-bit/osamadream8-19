import React, { useCallback, useState } from 'react';
import { Store, Truck, Receipt, Users, Zap, CheckCircle2 } from 'lucide-react';
import { useTheme } from '../context/themeContext';

const SPLASH_ITEMS = [
  { icon: Store, label: 'تحديث شعار مجموعة الطنطاوي...' },
  { icon: Truck, label: 'ربط مخازن الفروع...' },
  { icon: Receipt, label: 'تحضير نظام الفواتير الإلكترونية...' },
  { icon: Users, label: 'تحميل قاعدة العملاء...' },
  { icon: Zap, label: 'مزامنة البيانات السحابية...' },
  { icon: CheckCircle2, label: 'جاهز للانطلاق! ✓' },
];

interface SplashScreenProps {
  isOpen: boolean;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  isOpen,
  onComplete,
}) => {
  const { isDark } = useTheme();
  const [currentItem, setCurrentItem] = useState(0);
  const [progress, setProgress] = useState(0);

  const startAnimation = useCallback(() => {
    let i = 0;
    const interval = setInterval(() => {
      setCurrentItem(i);
      setProgress(((i + 1) / SPLASH_ITEMS.length) * 100);
      i++;
      if (i >= SPLASH_ITEMS.length) {
        clearInterval(interval);
        setTimeout(() => onComplete(), 400);
      }
    }, 350);
    return () => clearInterval(interval);
  }, [onComplete]);

  React.useEffect(() => {
    if (isOpen) {
      const cleanup = startAnimation();
      return cleanup;
    }
  }, [isOpen, startAnimation]);

  if (!isOpen) return null;

  const item = SPLASH_ITEMS[currentItem];

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 sm:p-8 text-center transition-colors duration-300 ${
        isDark
          ? 'bg-[#0B1220] text-[#F1F5F9]'
          : 'bg-[#F1F5F9] text-[#0F172A]'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="شاشة ترحيب"
    >
      {/* Logo container */}
      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl transition-colors duration-300 ${
        isDark
          ? 'bg-[#111C2E] border border-[#26364D]/30 text-[#F1F5F9] backdrop-blur-sm'
          : 'bg-[#FFFFFF] border border-[#E2E8F0]/30 text-[#0F172A] backdrop-blur-sm'
      }`}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#0D9488] flex items-center justify-center text-white shadow-lg shadow-[#2563EB]/30">
          <Store className="w-8 h-8" />
        </div>
      </div>

      {/* Brand name */}
      <h2 className={`text-2xl sm:text-3xl font-black tracking-tight mb-2 font-tajawal transition-colors duration-300 ${
        isDark ? 'text-[#F1F5F9]' : 'text-[#0F172A]'
      }`}>
        مجموعة الطنطاوي
      </h2>
      <p className={`text-sm sm:text-base font-semibold uppercase tracking-wider mb-8 transition-colors duration-300 ${
        isDark ? 'text-[#5eead4]' : 'text-[#0D9488]'
      }`}>
        Tantawy Group - نظام المبيعات والمخازن
      </p>

      {/* Progress card */}
      <div className={`w-full max-w-xs rounded-2xl p-4 shadow-xl transition-colors duration-300 ${
        isDark
          ? 'bg-[#111C2E] border border-[#26364D]/50'
          : 'bg-[#FFFFFF] border border-[#E2E8F0]'
      }`}>
        <div className="flex justify-between mb-2 text-xs font-bold">
          <span className={`transition-colors duration-300 ${isDark ? 'text-[#94A3B8]' : 'text-[#64748b]'}`}>
            جاري التحضير
          </span>
          <span className={`transition-colors duration-300 ${isDark ? 'text-[#F1F5F9]' : 'text-[#0F172A]'}`}>
            {Math.round(progress)}%
          </span>
        </div>
        <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden border border-slate-200/30 transition-colors duration-300">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out animate-pulse-shadow ${
              isDark ? 'bg-[#2563EB]' : 'bg-[#2563EB]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-[10px] mt-3 font-medium transition-colors duration-300 ${
          isDark ? 'text-[#94A3B8]' : 'text-[#64748b]'
        }`}>{item.label}</p>
      </div>

      {/* Decorative dots */}
      <div className="mt-8 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i <= Math.floor(currentItem / 2)
                ? 'bg-[#2563EB] animate-bounce'
                : isDark
                  ? 'bg-[#26364D]'
                  : 'bg-[#E2E8F0]'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default SplashScreen;
