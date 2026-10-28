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

  // --- Login State ---
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Submit Login
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
      <div className="w-full max-w-md z-10 my-4">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="login-chip w-24 h-24 sm:w-28 sm:h-28 p-2 mx-auto mb-4">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group - مجموعة الطنطاوي" className="w-full h-full object-contain rounded-full" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>مجموعة الطنطاوي للتجارة والتوزيع</span>
          </h1>
          <p className="text-xs sm:text-sm text-blue-soft3 mt-1 max-w-sm mx-auto font-medium">
            TANTAWY GROUP • منظومة إدارة المبيعات والفروع والمخازن المركزية
          </p>
        </div>

        {/* Card Box */}
        <div className="login-card p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-edf">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-[10px] bg-navy-deep text-warn flex items-center justify-center font-bold shadow-[0_2px_8px_rgba(16,43,78,.25)]">
                <LogIn className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-black text-sm sm:text-base text-deep-slate">تسجيل الدخول للنظام</h2>
              <p className="text-[11px] text-muted-dark">للمطورين، المديرين، المشرفين، والمناديب</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {authTerminationNotice && (
              <div className="login-msg-risk p-3.5 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 font-bold leading-relaxed">{authTerminationNotice}</div>
              </div>
            )}

            {loginError && (
              <div className="login-msg-risk p-3 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{loginError}</div>
              </div>
            )}

            {/* Identifier (Email / Username) */}
            <div>
              <label className="block text-xs font-bold text-slate-dark mb-1.5 text-right">
                البريد الإلكتروني لتسجيل الدخول (أو اسم المستخدم)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="مثال: osama@dream.com أو osama"
                  required
                  autoComplete="username"
                  className="login-input pr-10"
                />
                <UserIcon className="w-4 h-4 text-muted absolute right-3.5 top-4" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-dark mb-1.5 text-right">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور المسجلة بقاعدة البيانات"
                  required
                  autoComplete="current-password"
                  className="login-input pr-10 pl-11"
                />
                <Lock className="w-4 h-4 text-muted absolute right-3.5 top-4" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-dark hover:text-deep-slate absolute left-3.5 top-2"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="login-btn mt-4 cursor-pointer active:scale-98 disabled:opacity-55"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري التحقق من قاعدة البيانات...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>دخول إلى منظومة مجموعة الطنطاوي</span>
                </>
              )}
            </button>

            {/* Note that accounts are managed by Admin/Developer only */}
            <div className="pt-3 border-t border-edf text-center">
              <p className="text-[11px] text-muted-dark leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
