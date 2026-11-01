import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Headphones,
  Lock,
  LogIn,
  Moon,
  Sun,
  User as UserIcon,
  Building2,
  BarChart3,
  ShoppingCart,
  Users as Users2,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { login, authTerminationNotice, clearAuthTerminationNotice } = useApp();

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    clearAuthTerminationNotice();
    setIsLoggingIn(true);

    if (!loginIdentifier.trim()) {
      setLoginError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف');
      setIsLoggingIn(false);
      return;
    }

    if (!loginPassword.trim()) {
      setLoginError('يرجى إدخال كلمة المرور');
      setIsLoggingIn(false);
      return;
    }

    try {
      const result = await login(loginIdentifier, loginPassword);
      setIsLoggingIn(false);

      if (!result.success) {
        setLoginError(result.message);
      } else {
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setIsLoggingIn(false);
      setLoginError(err?.message || 'حدث خطأ أثناء التحقق من بيانات الدخول');
    }
  };

  return (
    <div
      dir="rtl"
      className={`login-canvas-v2 min-h-[100dvh] antialiased selection:bg-[rgba(201,154,67,.28)] ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Top right theme toggle */}
      <div className="fixed top-6 left-6 z-50 rtl:left-auto rtl:right-6">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-lg backdrop-blur-sm transition-all hover:scale-105"
          aria-label="تغيير النمط"
        >
          {darkMode ? (
            <Sun className="w-5 h-5 text-amber-500" />
          ) : (
            <Moon className="w-5 h-5 text-slate-600" />
          )}
        </button>
      </div>

      {/* Background decoration */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[color:var(--app-navy)]/30 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto my-4 h-[calc(100dvh-2rem)] flex flex-col lg:flex-row items-center justify-center gap-0 p-3 sm:p-6">
        {/* Left Branding Panel */}
        <div className="lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12 text-center lg:text-right bg-[color:var(--app-navy)] text-white rounded-3xl dark:bg-slate-900/40 shadow-2xl border border-white/10 dark:border-slate-800/50 backdrop-blur-md">
          <div className="mb-8">
            <img
              src="/tantawy-brand-logo.svg?v=3.1"
              alt="Tantawy Group - مجموعة الطنطاوي"
              className="w-20 h-20 lg:w-24 lg:h-24 mx-auto mb-4 object-contain drop-shadow-lg"
            />
            <h1 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight mb-2">
              مندرج<span className="text-[color:var(--app-accent)]"> دريم</span>
            </h1>
            <p className="text-lg lg:text-xl font-bold text-[color:var(--app-accent)] mb-6 uppercase tracking-widest">
              مجموعة المجموعاتية
            </p>
            <p className="text-lg lg:text-xl font-semibold text-slate-200 mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
              معا.. نحو مستقبل أفضل
            </p>
            <p className="text-sm lg:text-base text-slate-300 max-w-lg mx-auto lg:mx-0 leading-relaxed font-medium">
              منظومة متكاملة لإدارة المبيعات والمخازن والفروع
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:gap-6 w-full max-w-lg lg:max-w-none">
            <FeatureBox icon={<ShoppingCart className="w-5 h-5" />} label="المبيعات" />
            <FeatureBox icon={<Users2 className="w-5 h-5" />} label="إدارية العملاء" />
            <FeatureBox icon={<Building2 className="w-5 h-5" />} label="إدارية المخازن" />
            <FeatureBox icon={<BarChart3 className="w-5 h-5" />} label="تقارير دورة" />
          </div>
        </div>

        {/* Right Login Card */}
        <div className="lg:w-1/2 w-full max-w-md p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="text-center mb-8">
            <img
              src="/tantawy-brand-logo.svg?v=3.1"
              alt="Tantawy Group"
              className="w-16 h-16 mx-auto mb-4 object-contain drop-shadow-lg"
            />
            <h2 className="text-2xl lg:text-3xl font-black text-[color:var(--app-ink)] dark:text-white mb-2 leading-tight">
              مندرج<span className="text-[color:var(--app-accent)]"> دريم</span>
            </h2>
            <p className="text-sm font-bold text-[color:var(--app-accent)] uppercase tracking-widest mb-4">
              مجموعة المجموعاتية
            </p>
            <p className="text-sm text-[color:var(--app-muted)] dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
              مرحباً بك في نظام مندرج دريم، يرجى تسجيل الدخول للمنظومة
            </p>
          </div>

          {loginError && (
            <div className="mb-6 p-3 rounded-xl bg-rose-50/60 border border-rose-200/50 text-rose-800 text-sm font-bold text-right">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              {loginError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[color:var(--app-muted)] dark:text-slate-400 text-right">
                البريد الإلكتروني أو اسم المستخدم
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="مثال: osama@dream.com أو osama"
                  required
                  autoComplete="username"
                  className="w-full h-12 pl-4 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-2xl text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent outline-none transition-all font-medium text-sm"
                />
                <UserIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[color:var(--app-muted)] dark:text-slate-400 text-right">
                كلمة المرور
              </label>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور المسجلة بقاعدة البيانات"
                  required
                  autoComplete="current-password"
                  className="w-full h-12 pl-4 pr-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-2xl text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-[color:var(--app-accent)] focus:border-transparent outline-none transition-all font-medium text-sm"
                />
                <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 dark:text-slate-500 hover:text-[color:var(--app-accent)] absolute left-3 top-1/2 -translate-y-1/2 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2 text-xs">
              <button
                type="button"
                className="text-[color:var(--app-accent)] dark:text-[color:var(--app-accent)] font-bold hover:underline"
              >
                نسيت كلمة المرور؟
              </button>
              <label className="flex items-center gap-2 cursor-pointer select-none text-[color:var(--app-muted)] dark:text-slate-400 text-sm">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-[color:var(--app-accent)] focus:ring-[color:var(--app-accent)] bg-white dark:bg-slate-800"
                  defaultChecked
                />
                تذكرني على هذا الجهاز
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full h-12 bg-gradient-to-r from-[color:var(--app-accent)] to-[#0e7a6e] text-white font-black text-sm rounded-2xl shadow-lg shadow-[color:var(--app-accent)]/30 hover:shadow-[color:var(--app-accent)]/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري تسجيل الدخول...</span>
                </>
              ) : (
                <>
                  <span>تسجيل الدخول</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-[color:var(--app-muted)] dark:text-slate-500 text-center font-medium">
              يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6 pb-4 w-full">
        <div className="flex items-center justify-center gap-2 text-xs text-white/60 dark:text-white/40 font-bold uppercase tracking-wider">
          <span className="w-1 h-1 rounded-full bg-[color:var(--app-accent)]" />
          <span>TANTAWY GROUP</span>
          <span className="w-1 h-1 rounded-full bg-[color:var(--app-accent)]" />
        </div>
        <p className="text-[10px] text-white/40 dark:text-slate-500 mt-1 text-center">
          © 2026 مجموعة الطنطاوي. جميع الحقوق محفوظة.
        </p>
      </div>
    </div>
  );
};

const FeatureBox: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-white/10 dark:bg-white/5 rounded-2xl border border-white/20 dark:border-white/10 backdrop-blur-sm transition-all hover:bg-white/20 dark:hover:bg-white/10">
    <div className="w-10 h-10 rounded-xl bg-[color:var(--app-accent)]/20 text-[color:var(--app-accent)] flex items-center justify-center mb-2 shadow-lg shadow-[color:var(--app-accent)]/30">
      {icon}
    </div>
    <span className="text-sm font-bold text-white leading-tight">{label}</span>
  </div>
);
