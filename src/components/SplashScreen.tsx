import React, { useCallback, useState } from 'react';
import { Store, Truck, Receipt, Users, Zap, CheckCircle2 } from 'lucide-react';

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

  // Run animation once when splash opens
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
      className="fixed inset-0 z-[100] bg-navy text-white flex flex-col items-center justify-center p-4 sm:p-8 text-center"
      role="dialog"
      aria-modal="true"
      aria-label="شاشة ترحيب"
    >
      {/* Logo container */}
      <div className="w-24 h-24 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-8 shadow-2xl backdrop-blur-sm animate-bounce-slow">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-teal-500/30">
          <Store className="w-8 h-8" />
        </div>
      </div>

      {/* Brand name */}
      <h2 className="text-2xl sm:text-3xl font-black tracking-tight mb-2 font-tajawal text-white drop-shadow-md">
        مجموعة الطنطاوي
      </h2>
      <p className="text-teal-300 text-sm sm:text-base font-semibold uppercase tracking-wider mb-8 drop-shadow-sm">
        Tantawy Group - نظام المبيعات والمخازن
      </p>

      {/* Progress card */}
      <div className="w-full max-w-xs bg-white/10 border border-white/20 rounded-2xl p-4 backdrop-blur-md shadow-xl">
        <div className="flex justify-between mb-2 text-xs font-bold text-teal-300 drop-shadow-sm">
          <span>جاري التحضير</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden border border-white/20">
          <div
            className="h-full bg-teal-400 rounded-full transition-all duration-500 ease-out animate-pulse-shadow shadow-[0_0_10px_rgba(0,148,136,0.6)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-teal-200 text-[10px] mt-3 font-medium drop-shadow-sm">{item.label}</p>
      </div>

      {/* Decorative dots */}
      <div className="mt-8 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i <= Math.floor(currentItem / 2)
                ? 'bg-teal-400 animate-bounce'
                : 'bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default SplashScreen;