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
    <div dir="rtl" className="min-h-[100dvh] bg-[#eef3f8] text-[#17283d] flex flex-col justify-center items-center p-3 sm:p-6 antialiased selection:bg-blue-200">
      {/* Background glow visual accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-50">
        <div className="absolute top-0 right-0 w-2/3 h-2/3 bg-blue-100/60 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-[#dce8f2] rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md z-10 my-4">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-white p-2 shadow-lg mb-3 border border-slate-200">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group - مجموعة الطنطاوي" className="w-full h-full object-contain rounded-full" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#142f50] flex items-center justify-center gap-2">
            <span>مجموعة الطنطاوي للتجارة والتوزيع</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-sm mx-auto font-medium">
            TANTAWY GROUP • منظومة إدارة المبيعات والفروع والمخازن المركزية
          </p>
        </div>

        {/* Card Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <LogIn className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-black text-sm sm:text-base text-[#142f50]">تسجيل الدخول للنظام</h2>
              <p className="text-[11px] text-slate-500">للمطورين، المديرين، المشرفين، والمناديب</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {authTerminationNotice && (
              <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 p-3.5 rounded-2xl text-xs flex items-start gap-2.5 shadow-lg shadow-rose-950/50 animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 font-bold leading-relaxed">{authTerminationNotice}</div>
              </div>
            )}

            {loginError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>{loginError}</div>
              </div>
            )}

            {/* Identifier (Email / Username) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
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
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition pr-10 font-mono"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 text-right">
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
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition pr-10 pl-10"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-500 hover:text-blue-700 absolute left-3.5 top-3.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-[#173b63] hover:bg-[#214f7e] text-white font-black py-3.5 rounded-xl shadow-lg transition transform active:scale-98 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-4 cursor-pointer"
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
            <div className="pt-3 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
