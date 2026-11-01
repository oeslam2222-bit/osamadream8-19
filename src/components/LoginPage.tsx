import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface LoginPageProps {
  onSuccess?: () => void;
  /** صورة خلفية سطح المكتب (مثل صورة المبنى والشاحنة). لو مسلحة، تظهر فيpanel الجانب الأيسر؛ وإلا يظهر تدرج لوني أنيق. ضع الصورة في المجلد public/ ومرر المسارrelativo. */
  heroImage?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess, heroImage }) => {
  const { login, authTerminationNotice, clearAuthTerminationNotice } = useApp();

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

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

  const FeatureIcon = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-cyan-300 border border-white/20 backdrop-blur-sm">
        {icon}
      </div>
      <span className="text-[11px] lg:text-sm font-bold text-white">{label}</span>
    </div>
  );

  return (
    <div dir="rtl" className="login-canvas min-h-[100dvh] w-full flex flex-col font-cairo text-slate-900 antialiased selection:bg-amber-200">
      {/* ===== سطح المكتب: لوحة الخلفية (صورة المبنى + الشاحنة أو تدرج لوني) ===== */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-end justify-end relative">
        {heroImage ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})`, opacity: 0.82 }} />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f2b38]/92 via-[#0f2b38]/40 to-transparent" />
        <div className="absolute top-[-8%] right-[-10%] w-[55%] h-[55%] rounded-full bg-amber-500/12 blur-[140px]" />
        <div className="relative z-10 p-8 lg:p-16 w-full text-white">
          <div className="flex items-center gap-2 mb-3">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group" className="h-10 w-auto drop-shadow-lg" />
          </div>
          <h2 className="text-2xl lg:text-3xl font-black mb-1 tracking-tight leading-tight">
            مجموعة الطنطاوي
          </h2>
          <p className="text-sm lg:text-base text-cyan-300/90 mb-6 max-w-xs font-medium leading-relaxed">
            نظام متكامل للمبيعات، المخزون، الفواتير والتحصيلات • TANTAWY GROUP
          </p>
          <div className="mt-auto pt-6 lg:pt-12 grid grid-cols-2 gap-4 lg:gap-6 max-w-xs">
            <FeatureIcon icon={<ShieldCheck className="w-5 h-5" />} label="تقارير فورية" />
            <FeatureIcon icon={<Lock className="w-5 h-5" />} label="إدارة الفواتير" />
            <FeatureIcon icon={<UserIcon className="w-5 h-5" />} label="إدارة العملاء" />
            <FeatureIcon icon={<ShieldCheck className="w-5 h-5" />} label="إدارة المخزون" />
          </div>
          <p className="text-[10px] lg:text-xs text-cyan-300/60 mt-8 lg:mt-10 font-bold uppercase tracking-wider">
            2026 © مجموعة الطنطاوي
          </p>
        </div>
      </div>

      {/* ===== بطاقة تسجيل الدخول ===== */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-0 lg:w-1/2">
        <div className="w-full max-w-md login-card p-8 sm:p-10 relative z-10">
          <div className="text-center mb-8">
            <div className="login-chip w-20 h-20 p-1.5 mx-auto mb-4">
              <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group - مجموعة الطنطاوي" className="w-full h-full object-contain rounded-lg" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-1 tracking-tight">مجموعة الطنطاوي</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
              تسجيل الدخول إلى النظام
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {authTerminationNotice && (
              <div className="login-msg-risk p-3.5 text-xs flex items-start gap-2.5 rounded-xl">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                <div className="flex-1 font-bold leading-relaxed text-rose-800">{authTerminationNotice}</div>
              </div>
            )}

            {loginError && (
              <div className="login-msg-risk p-3 text-xs flex items-start gap-2 rounded-xl">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <div className="text-rose-800 font-bold">{loginError}</div>
              </div>
            )}

            {/* الحقل الأول: البريد الإلكتروني أو اسم المستخدم */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600 text-right">
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
                <UserIcon
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--brand-teal)] transition-colors"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* الحقل الثاني: كلمة المرور */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-600 text-right">كلمة المرور</label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-[10px] font-bold text-[color:var(--brand-teal)] hover:underline transition-colors"
                >
                  نسيت كلمة المرور؟
                </a>
              </div>
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
                <Lock
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[color:var(--brand-teal)] transition-colors"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-slate-400 hover:text-[color:var(--brand-teal)] transition-colors rounded hover:bg-slate-100 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-label="إظهار/إخفاء كلمة المرور"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* خيار تذكرني */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={() => setRememberMe(!rememberMe)}
                className="w-4 h-4 rounded border-slate-300 bg-white focus:ring-[color:var(--brand-teal)]"
                style={{ accentColor: 'var(--brand-teal)' }}
              />
              <span>تذكرني على هذا الجهاز</span>
            </label>

            {/* زر تسجيل الدخول (تدرج أزرق-أخضر كما في التصميم المرجعي) */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full h-12 rounded-xl font-black text-sm text-white cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              style={{
                background: 'linear-gradient(135deg, #009488 0%, #0f7b6e 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(0,148,136,.35)',
              }}
            >
              {isLoggingIn ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span className="font-black">جاري التحقق من قاعدة البيانات...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  <span className="font-black">تسجيل الدخول</span>
                </>
              )}
            </button>

            <div className="pt-4 border-t border-slate-200 text-center">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                تُنشأ وتُفعّل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>
              <p className="text-[10px] text-slate-300 mt-2 font-bold uppercase tracking-wider">
                2026 © مجموعة الطنطاوي
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
