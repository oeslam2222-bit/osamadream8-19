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
    <div dir="rtl" className="login-canvas min-h-[100dvh] text-slate-soft7 flex flex-col justify-center items-center p-3 sm:p-6 antialiased selection:bg-[rgba(201,154,67,.28)]">
      {/* Background decoration */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[color:var(--app-navy)]/40 blur-[120px] mix-blend-overlay" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/20 blur-[100px] mix-blend-overlay" />
      </div>

      <div className="relative z-10 w-full max-w-md my-4">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="login-chip w-24 h-24 sm:w-28 sm:h-28 p-2 mx-auto mb-4 bg-white/90 rounded-2xl shadow-xl border border-white/20">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group - مجموعة الطنطاوي" className="w-full h-full object-contain rounded-lg" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>مجموعة الطنطاوي</span>
          </h1>
          <p className="text-xs sm:text-sm text-blue-soft3 mt-2 max-w-sm mx-auto font-medium leading-relaxed">
            نظام إدارة المبيعات والفروع والمخازن المركزية • TANTAWY GROUP
          </p>
        </div>

        {/* Card Box */}
        <div className="login-card p-6 sm:p-8 relative z-10">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-edf">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-[12px] bg-[color:var(--app-navy)] text-[color:var(--app-accent)] flex items-center justify-center font-bold shadow-[0_4px_12px_rgba(15,35,61,.35)]">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-black text-sm sm:text-base text-deep-slate leading-tight">تسجيل الدخول للنظام</h2>
                <p className="text-[11px] text-muted-dark">للمطورين، المديرين، المشرفين، والمناديب</p>
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-[color:var(--app-accent)]" />
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            {authTerminationNotice && (
              <div className="login-msg-risk p-3.5 text-xs flex items-start gap-2.5 rounded-xl bg-rose-50/60 border border-rose-200/50">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                <div className="flex-1 font-bold leading-relaxed text-rose-800">{authTerminationNotice}</div>
              </div>
            )}

            {loginError && (
              <div className="login-msg-risk p-3 text-xs flex items-start gap-2 rounded-xl bg-rose-50/60 border border-rose-200/50">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="text-rose-800 font-bold">{loginError}</div>
              </div>
            )}

            {/* Identifier (Email / Username) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-dark text-right">
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
                  className="login-input pr-11 w-full"
                />
                <UserIcon className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-dark text-right">
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
                  className="login-input pr-11 pl-12 w-full"
                />
                <Lock className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--app-accent)] transition-colors" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-dark hover:text-[color:var(--app-accent)] absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="login-btn mt-2 cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed w-full"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span className="font-black">جاري التحقق من قاعدة البيانات...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  <span className="font-black">دخول إلى منظومة مجموعة الطنطاوي</span>
                </>
              )}
            </button>

            {/* Note that accounts are managed by Admin/Developer only */}
            <div className="pt-4 border-t border-edf text-center">
              <p className="text-[11px] text-muted-dark leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Footer brand lockup */}
      <div className="mt-auto pt-8 pb-4 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-white/60 font-bold uppercase tracking-wider">
          <span className="w-1 h-1 rounded-full bg-[color:var(--app-accent)]" />
          <span>TANTAWY GROUP</span>
        </div>
      </div>
    </div>
  );
};
