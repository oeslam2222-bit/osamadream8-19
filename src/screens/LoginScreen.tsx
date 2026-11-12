import React, { useState } from 'react';
import { useTheme } from '../context/themeContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Truck, ShieldCheck, Receipt } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1500);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 safe-area-bottom">
      <Card padding="lg" hover={false} variant="glow" accent="teal" className="w-full max-w-[380px] shadow-soft-lg">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <div className="w-16 h-16 bg-amber-600 dark:bg-amber-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl mb-4 shadow-soft">
            <Truck className="w-8 h-8" />
          </div>
          <h1 className="font-arabic-display font-bold text-3xl text-slate-900 dark:text-white mb-1">
            مجموعة الطنطاوي
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Tantawy Group - نظام المبيعات والمخزون
          </p>
        </div>

        {/* Welcome Message */}
        <div className="text-center mb-8">
          <h2 className="font-bold text-xl text-slate-900 dark:text-white mb-2">مرحباً بعودتك</h2>
          <p className="text-slate-600 dark:text-slate-400 text-sm">
            تسجيل الدخول إلى حسابك لإدارة المبيعات والمخزون
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="اسم المستخدم"
            placeholder="أدخل اسم المستخدم"
            icon={<ShieldCheck className="w-4 h-4" />}
            required
          />
          <Input
            label="كلمة المرور"
            type="password"
            placeholder="أدخل كلمة المرور"
            icon={<Receipt className="w-4 h-4" />}
            required
          />

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" className="rounded text-amber-600 focus:ring-amber-500" />
              تذكرني
            </label>
            <a href="#" className="text-sm text-amber-600 dark:text-amber-400 font-medium hover:underline">
              نسيت كلمة المرور؟
            </a>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            className="mt-2"
          >
            تسجيل الدخول
          </Button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200 dark:border-slate-700"></span>
            <span className="px-2 text-xs font-bold text-slate-400 bg-white dark:bg-slate-800">أو استمر مع</span>
          </div>
        </div>

        {/* Social / Quick Login */}
        <Button variant="outline" size="lg" fullWidth className="text-sm">
          <div className="flex items-center justify-center gap-2">
            <span>تسجيل سريع</span>
          </div>
        </Button>
      </Card>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-500">
          © {new Date().getFullYear()} مجموعة الطنطاوي للتجارة والتوزيع - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
};