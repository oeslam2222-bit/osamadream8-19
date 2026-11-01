import {
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  ShieldCheck,
  User as UserIcon,
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
    <div dir="rtl" className="login-canvas min-h-[100dvh] flex items-center justify-center p-3 sm:p-6 antialiased selection:bg-[rgba(0,148,136,.15)]">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[70%] rounded-full bg-[color:var(--app-accent)]/10 blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] rounded-full bg-[color:var(--app-navy)]/60 blur-[130px]" />
        <div className="absolute top-[10%] right-[20%] w-[40%] h-[30%] rounded-full bg-amber-500/8 blur-[110px]" />
      </div>

      <div className="relative z-10 w-full max-w-[440px] my-4">
        <div className="text-center mb-8">
          <div className="login-chip inline-block w-20 h-20 sm:w-24 sm:h-24 p-2 mx-auto mb-5 bg-white rounded-2xl shadow-xl border border-white/30">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group" className="w-full h-full object-contain rounded-lg" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[color:var(--app-navy)]">
            مرحباً بعودتك
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-sm mx-auto font-medium leading-relaxed">
            تسجيل الدخول إلى نظام مجموعة الطنطاوي
          </p>
        </div>

        <div className="login-card p-6 sm:p-8 relative z-10">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200/60">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-[12px] bg-[color:var(--app-navy)] text-white flex items-center justify-center font-bold shadow-md shadow-[color:var(--app-navy)]/20">
                <LogIn className="w-5 h-5" />
              </div>
              <h2 className="text-base font-black text-[color:var(--app-navy)]">تسجيل الدخول</h2>
            </div>
            <ShieldCheck className="w-5 h-5 text-[color:var(--app-accent)]" />
          </div>

          {authTerminationNotice && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <p className="text-rose-700 font-medium leading-relaxed">{authTerminationNotice}</p>
            </div>
          )}

          {loginError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <p className="text-red-700 font-medium leading-relaxed">{loginError}</p>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                اسم المستخدم أو البريد الإلكتروني
              </label>
              <div className="relative group">
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="osama@dream.com أو osama"
                  required
                  autoComplete="username"
                  className="login-input pr-11 w-full"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  كلمة المرور
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-xs font-bold text-[color:var(--app-accent)] hover:text-emerald-600 transition-colors"
                >
                  {showPassword ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                  autoComplete="current-password"
                  className="login-input pr-11 pl-12 w-full"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-dark hover:text-[color:var(--app-accent)] absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="login-btn mt-1 w-full py-3 rounded-xl font-black text-sm tracking-wide active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                  <span className="font-black">جاري التحقق...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-1" />
                  <span className="font-black">دخول إلى النظام</span>
                </>
              )}
            </button>

            <div className="pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>
            </div>
          </form>
        </div>
      </div>

      <div className="mt-auto pt-8 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 text-[10px] text-white/50 font-bold uppercase tracking-wider">
          <span className="w-1 h-1 rounded-full bg-[color:var(--app-accent)]" />
          <span>TANTAWY GROUP</span>
        </div>
      </div>
    </div>
  );
};
