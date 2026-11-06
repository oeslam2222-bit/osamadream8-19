import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  User as UserIcon,
  Building2,
  BarChart3,
  ShoppingCart,
  Users as Users2,
} from 'lucide-react';
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
      setLoginError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني');
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
      className="login-canvas-v2 min-h-screen antialiased selection:bg-[rgba(201,154,67,.28)] bg-[#091827] text-slate-100"
    >
      {/* Background accents - تدرجات خلفية خفيفة */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#123157]/25 blur-[140px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[50%] h-[50%] rounded-full bg-amber-500/8 blur-[120px]" />
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)' }} />
      </div>

      {/* Main container - متجاوب مع جميع الشاشات */}
      <div className="relative z-10 w-full mx-auto my-1 min-h-screen flex flex-col lg:flex-row items-center justify-center gap-0 p-3 sm:p-6 overflow-hidden">
        
        {/* Right: Login Card (white) - على اليمين للموبايل وسطح المكتب */}
        <div className="lg:w-1/2 w-full flex items-center justify-center p-3 sm:p-6 max-w-[520px]">
          <div className="w-full max-w-md bg-[#0f2138] rounded-3xl shadow-[0_20px_60px_rgba(2,6,23,0.45)] border border-white/10 p-6 sm:p-8 flex flex-col">
            {/* Logo */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-[#122843] border border-white/10 flex items-center justify-center shadow-sm overflow-hidden">
                <img
                  src="/tantawy-brand-logo.svg?v=3.1"
                  alt="Tantawy Group"
                  className="w-10 h-10 object-contain"
                />
              </div>
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white mb-1 tracking-tight">
                مندوب<span className="text-[#5fe4cd]"> دريم</span>
              </h2>
              <p className="text-xs font-bold text-[#5fe4cd] uppercase tracking-widest mt-2">
                مجموعة الطنطاوي
              </p>
              <p className="text-[11px] text-slate-300 leading-relaxed max-w-xs mx-auto mt-3">
                مرحباً بك في نظام مندوب دريم، يرجى تسجيل الدخول للمنظومة
              </p>
            </div>

            {/* Error message */}
            {loginError && (
              <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-200 text-sm font-bold text-right">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              {/* Username field */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 text-right">
                  البريد الإلكتروني أو اسم المستخدم
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="مندوب دريم"
                    required
                    autoComplete="username"
                    className="w-full h-11 pl-10 pr-12 bg-[#11263f] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-[#5fe4cd]/60 focus:border-transparent outline-none transition-all font-medium text-sm placeholder:text-slate-400"
                  />
                  <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#5fe4cd] transition-colors" />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 text-right">
                  كلمة المرور
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full h-11 pl-10 pr-12 bg-[#11263f] border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-[#5fe4cd]/60 focus:border-transparent outline-none transition-all font-medium text-sm placeholder:text-slate-400"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#5fe4cd] transition-colors" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-[#5fe4cd] absolute left-3 top-1/2 -translate-y-1/2 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-300 text-sm">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded border-slate-500 text-[#5fe4cd] focus:ring-[#5fe4cd] bg-[#11263f]"
                  defaultChecked
                />
                تذكرني على هذا الجهاز
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-11 bg-gradient-to-r from-[#009488] to-[#0e7a6e] text-white font-black text-sm rounded-xl shadow-lg shadow-[#009488]/30 hover:shadow-[#009488]/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري تسجيل الدخول...</span>
                  </>
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            {/* Footer note */}
            <div className="mt-auto pt-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام.
              </p>
            </div>
          </div>
        </div>

        {/* Left: Dark branding panel - على اليسار فقط في سطح المكتب */}
        <div className="lg:w-1/2 w-full flex flex-col items-center justify-center p-3 sm:p-8 bg-[#0a1628] text-white rounded-3xl shadow-2xl border border-white/10 backdrop-blur-sm max-w-[600px]">
          <div className="text-center mb-8">
            <span className="text-[10px] font-bold text-[#009488] uppercase tracking-widest block mb-2">
              TANTAWY GROUP
            </span>
            <h1 className="text-3xl lg:text-5xl font-black tracking-tight leading-tight mb-3">
              مجموعة<span className="text-[#009488]"> الطنطاوي</span>
            </h1>
            <h2 className="text-4xl lg:text-6xl font-black tracking-tight leading-tight mb-6">
              مندوب<span className="text-[#009488]"> دريم</span>
            </h2>
            <p className="text-[12px] lg:text-base text-slate-300 mb-6 max-w-lg mx-auto leading-relaxed font-medium">
              معا.. نحو مستقبل أفضل
            </p>
            <p className="text-[11px] text-slate-500 max-w-lg mx-auto leading-relaxed">
              منظومة متكاملة لإدارة المبيعات والمخازن والفروع
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:gap-6 w-full max-w-lg lg:max-w-none">
            <FeatureBox icon={<Users2 className="w-5 h-5" />} label="إدارة العملاء" />
            <FeatureBox icon={<ShoppingCart className="w-5 h-5" />} label="المبيعات" />
            <FeatureBox icon={<Building2 className="w-5 h-5" />} label="إدارة المخازن" />
            <FeatureBox icon={<BarChart3 className="w-5 h-5" />} label="متابعة دورية" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 pb-2 w-full">
        <div className="flex items-center justify-center gap-2 text-[10px] text-white/50 font-bold uppercase tracking-wider">
          <span className="w-1 h-1 rounded-full bg-[#009488]" />
          <span>TANTAWY GROUP</span>
          <span className="w-1 h-1 rounded-full bg-[#009488]" />
        </div>
        <p className="text-[9px] text-white/30 mt-0.5 text-center">
          © 2026 مجموعة الطنطاوي. جميع الحقوق محفوظة.
        </p>
      </div>
    </div>
  );
};

const FeatureBox: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/20">
    <div className="w-10 h-10 rounded-xl bg-[#009488]/20 text-[#009488] flex items-center justify-center mb-2 shadow-lg shadow-[#009488]/30">
      {icon}
    </div>
    <span className="text-[12px] font-bold text-white leading-tight">{label}</span>
  </div>
);
