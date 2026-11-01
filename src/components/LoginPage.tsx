import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/themeContext';

interface LoginPageProps {
  onSuccess?: () => void;
  trialMode?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess, trialMode = false }) => {
  const { login, authTerminationNotice, clearAuthTerminationNotice } = useApp();
  const { isDark, toggleTheme } = useTheme();

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);

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
        setIsSuccess(true);
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setIsLoggingIn(false);
      setLoginError(err?.message || 'حدث خطأ أثناء التحقق من بيانات الدخول');
    }
  };

  const FeatureChip = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center text-[#00A99D] border border-[#00A99D]/20 bg-white/5 backdrop-blur-sm shadow-sm">
        {icon}
      </div>
      <span className={`text-[11px] lg:text-sm font-bold ${isDark ? 'text-white' : 'text-[#061B35]'}`}>{label}</span>
    </div>
  );

  const Notice = ({ children }: { children: string }) => (
    <div className="rounded-xl p-3 text-start border border-rose-200/60 bg-rose-50/60">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
        <div className="text-xs font-bold text-rose-800 leading-relaxed">{children}</div>
      </div>
    </div>
  );

  const LoginCard = ({ mobile }: { mobile?: boolean }) => (
    <section
      className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border bg-white ${
        isDark
          ? 'border-[#061B35]/20 shadow-[0_20px_40px_-10px_rgba(6,27,53,0.35)]'
          : 'border-slate-200 shadow-[0_10px_30px_-10px_rgba(15,40,70,0.15)]'
      }`}
    >
      {/* Header: logo (text + icon, no image) */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#082B50] flex items-center justify-center text-[#00A99D] shadow-lg border border-[#00A99D]/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-right">
            <h1 className={`text-xl lg:text-2xl font-black leading-tight ${isDark ? 'text-white' : 'text-[#061B35]'}`}>
              مجموعة الطنطاوي
            </h1>
            <p className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#00A99D]">
              TANTAWY GROUP
            </p>
          </div>
        </div>
        <p className={`text-[11px] lg:text-sm font-medium mt-3 ${isDark ? 'text-[#64748b]' : 'text-[#475569]'}`}>
          {mobile ? 'تسجيل الدخول' : 'تسجيل الدخول إلى النظام'}
        </p>
      </div>

      {/* Success state */}
      {isSuccess ? (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-[#00A99D]/10 flex items-center justify-center text-[#00A99D] mx-auto mb-4 shadow-lg">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h3 className={`text-lg font-black mb-2 ${isDark ? 'text-white' : 'text-[#061B35]'}`}>
            تم تسجيل الدخول بنجاح
          </h3>
          <p className={`text-sm mb-6 ${isDark ? 'text-[#64748b]' : 'text-[#475569]'}`}>
            يتم توجيهك إلى النظام...
          </p>
          {onSuccess ? (
            <button
              onClick={onSuccess}
              className="w-full h-11 rounded-xl font-black text-sm text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #00A99D 0%, #008f85 100%)', border: 'none' }}
            >
              المتابعة إلى النظام
            </button>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          {/* Trial mode banner (optional, toggleable) */}
          {trialMode && (
            <div className="rounded-xl p-3 text-center border border-[#D6A84B]/25 bg-[#D6A84B]/10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a6d2b]">
                نظام مندوب دريم يخضع حالياً للتجربة والتطوير
              </span>
            </div>
          )}

          {authTerminationNotice && <Notice children={authTerminationNotice} />}
          {loginError && <Notice children={loginError} />}

          {/* Identifier field */}
          <div className="space-y-1.5">
            <label className={`block text-xs font-bold text-right ${isDark ? 'text-[#061B35]/90' : 'text-[#475569]'}`}>
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
                className={`w-full pr-11 h-11 rounded-xl border bg-white text-[#061B35] font-medium placeholder-[#94a3b8] focus:border-[#00A99D] focus:ring-1 focus:ring-[#00A99D] transition-all ${
                  isDark ? 'border-[#061B35]/30' : 'border-slate-200'
                }`}
              />
              <UserIcon
                className={`w-4 h-4 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#00A99D] transition-colors`}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={`block text-xs font-bold text-right ${isDark ? 'text-[#061B35]/90' : 'text-[#475569]'}`}>
                كلمة المرور
              </label>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-[10px] font-bold text-[#00A99D] hover:underline transition-colors"
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
                className={`w-full pr-11 pl-12 h-11 rounded-xl border bg-white text-[#061B35] font-medium placeholder-[#94a3b8] focus:border-[#00A99D] focus:ring-1 focus:ring-[#00A99D] transition-all ${
                  isDark ? 'border-[#061B35]/30' : 'border-slate-200'
                }`}
              />
              <Lock
                className={`w-4 h-4 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#00A99D] transition-colors`}
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-[#64748b] hover:text-[#00A99D] transition-colors rounded hover:bg-[#f8fafc] absolute left-3 top-1/2 -translate-y-1/2"
                aria-label="إظهار/إخفاء كلمة المرور"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember me */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-[#475569] hover:text-[#061B35] transition-colors">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={() => setRememberMe(!rememberMe)}
              className="w-4 h-4 rounded border-slate-300 bg-white focus:ring-[#00A99D]"
              style={{ accentColor: '#00A99D' }}
            />
            <span>تذكرني على هذا الجهاز</span>
          </label>

          {/* Login button */}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full h-11 rounded-xl font-black text-sm text-white cursor-pointer active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #00A99D 0%, #008f85 100%)',
              border: 'none',
              boxShadow: '0 4px 14px rgba(0,169,157,0.35)',
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

          <div className="pt-4 border-t border-slate-200/60 text-center">
            <p className="text-[11px] text-[#64748b] leading-relaxed">
              تُنشأ وتُفعّل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
            </p>
            <p className="text-[10px] text-[#061B35] mt-2 font-bold uppercase tracking-wider">
              2026 © مجموعة الطنطاوي
            </p>
          </div>
        </form>
      )}
    </section>
  );

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] w-full overflow-x-hidden flex flex-col font-cairo antialiased selection:bg-[#D6A84B]/30"
    >
      {/* Gradient background (no images) */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background: isDark
            ? 'linear-gradient(160deg, #061B35 0%, #082B50 55%, #05162a 100%)'
            : 'linear-gradient(160deg, #f4f8fc 0%, #e3eef7 55%, #d6e3f0 100%)',
        }}
      />

      {/* Decorative geometric lights */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-8%] left-[-8%] w-[40%] h-[40%] rounded-full blur-[120px]"
          style={{
            background: isDark ? 'rgba(0,169,157,0.06)' : 'rgba(0,169,157,0.10)',
          }}
        />
        <div
          className="absolute bottom-[-8%] right-[-8%] w-[35%] h-[35%] rounded-full blur-[100px]"
          style={{
            background: isDark ? 'rgba(214,168,75,0.06)' : 'rgba(214,168,75,0.10)',
          }}
        />
      </div>

      {/* ===== Desktop: split screen ===== */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        {/* Left panel: company identity */}
        <div
          className="hidden lg:flex lg:w-1/2 lg:max-w-[56%] flex-col items-end justify-center p-6 lg:p-16 text-right"
        >
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-[#082B50] flex items-center justify-center text-[#00A99D] shadow-xl border border-[#00A99D]/30">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-2xl lg:text-3xl font-black leading-tight ${isDark ? 'text-white' : 'text-[#061B35]'}`}>
                مجموعة الطنطاوي
              </h2>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#00A99D]">
                TANTAWY GROUP
              </p>
            </div>
          </div>
          <h3 className={`text-lg lg:text-xl font-bold mb-4 max-w-xs leading-tight ${isDark ? 'text-white' : 'text-[#061B35]'}`}>
            نظام إدارة المبيعات والتحصيلات
          </h3>
          <p
            className={`text-sm lg:text-base mb-8 max-w-xs leading-relaxed font-medium ${isDark ? 'text-[#e2e8f0]' : 'text-[#061B35]'}`}
            style={{ opacity: isDark ? 0.9 : 0.9 }}
          >
            منصة متكاملة لإدارة المبيعات، المخزون، الفواتير والعملاء بأعلى معايير الثقة والاحترافية.
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            <FeatureChip icon={<ShieldCheck className="w-5 h-5" />} label="تقارير فورية" />
            <FeatureChip icon={<Lock className="w-5 h-5" />} label="إدارة الفواتير" />
            <FeatureChip icon={<UserIcon className="w-5 h-5" />} label="إدارة العملاء" />
            <FeatureChip icon={<Sparkles className="w-5 h-5" />} label="إدارة المخزون" />
          </div>
        </div>

        {/* Right panel: login card */}
        <div className="flex-1 flex items-center justify-center p-4 lg:p-0">
          <LoginCard mobile={false} />
        </div>
      </div>

      {/* ===== Mobile: independent responsive layout ===== */}
      <div className="lg:hidden flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#082B50] flex items-center justify-center text-[#00A99D] shadow-lg border border-[#00A99D]/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-xl font-black leading-tight ${isDark ? 'text-white' : 'text-[#061B35]'}`}>
                مجموعة الطنطاوي
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#00A99D]">
                TANTAWY GROUP
              </p>
            </div>
          </div>
          <LoginCard mobile />
        </div>
      </div>
    </div>
  );
};
