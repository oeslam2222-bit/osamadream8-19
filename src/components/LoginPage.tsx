import React, { useState } from 'react';
import {
  AlertCircle, ArrowLeft, Eye, EyeOff, Lock, User as UserIcon,
  Building2, BarChart3, ShoppingCart, Users, Sparkles,
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

  const features = [
    { icon: Users, label: 'إدارة العملاء', color: '#3b82f6' },
    { icon: ShoppingCart, label: 'المبيعات والطلبات', color: '#10b981' },
    { icon: Building2, label: 'المخازن والأصناف', color: '#f59e0b' },
    { icon: BarChart3, label: 'تحليلات وتقارير', color: '#8b5cf6' },
  ];

  return (
    <div dir="rtl" className="tg-login">
      {/* ===== الخلفية الكحلية ===== */}
      <div className="tg-login__bg" aria-hidden="true">
        <div className="tg-login__blob tg-login__blob--1" />
        <div className="tg-login__blob tg-login__blob--2" />
        <div className="tg-login__blob tg-login__blob--3" />
        <div className="tg-login__grid" />
      </div>

      <div className="tg-login__inner">
        {/* ===== اللوحة اليسرى — العلامة والهوية ===== */}
        <aside className="tg-login__brand">
          <div className="tg-login__brand-head">
            <img src="/icon.svg" alt="طنطاوي جروب" className="tg-login__logo" />
            <div>
              <div className="tg-login__brand-name">طنطاوي جروب</div>
              <div className="tg-login__brand-sub">TANTAWY GROUP</div>
            </div>
          </div>

          <div className="tg-login__brand-body">
            <h1 className="tg-login__headline">
              مندوب<br /><span>دريم</span>
            </h1>
            <p className="tg-login__tagline">منظومة متكاملة لإدارة المبيعات، المخازن والفروع — كل شيء في مكان واحد.</p>
          </div>

          <div className="tg-login__features">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="tg-login__feature">
                  <span className="tg-login__feature-icon" style={{ background: `${f.color}22`, color: f.color }}>
                    <Icon size={18} />
                  </span>
                  <span className="tg-login__feature-label">{f.label}</span>
                </div>
              );
            })}
          </div>

          <p className="tg-login__foot">© 2026 مجموعة الطنطاوي. جميع الحقوق محفوظة.</p>
        </aside>

        {/* ===== لوحة تسجيل الدخول ===== */}
        <main className="tg-login__panel">
          <div className="tg-login__card">
            <div className="tg-login__card-top">
              <div className="tg-login__pill"><Sparkles size={14} /> أهلاً بيك</div>
              <h2 className="tg-login__title">تسجيل الدخول</h2>
              <p className="tg-login__hint">ادخل بياناتك الخاصة بالمنظومة للمتابعة</p>
            </div>

            {loginError && (
              <div className="tg-login__error" role="alert">
                <AlertCircle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="tg-login__form">
              <label className="tg-login__label" htmlFor="login-id">اسم المستخدم أو البريد الإلكتروني</label>
              <div className="tg-login__input-wrap">
                <UserIcon size={17} className="tg-login__input-icon" />
                <input
                  id="login-id"
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="مثال: osama أو مثال@tantawygroup.com"
                  autoComplete="username"
                  required
                  className="tg-login__input"
                />
              </div>

              <label className="tg-login__label" htmlFor="login-pass">كلمة المرور</label>
              <div className="tg-login__input-wrap">
                <Lock size={17} className="tg-login__input-icon" />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="tg-login__input tg-login__input--password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="tg-login__eye"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>

              <label className="tg-login__remember">
                <input type="checkbox" defaultChecked className="tg-login__checkbox" />
                تذكرني على هذا الجهاز
              </label>

              <button type="submit" disabled={isLoggingIn} className="tg-login__submit">
                {isLoggingIn ? (
                  <>
                    <span className="tg-login__spinner" />
                    جاري تسجيل الدخول...
                  </>
                ) : (
                  <>
                    تسجيل الدخول
                    <ArrowLeft size={16} />
                  </>
                )}
              </button>
            </form>

            <p className="tg-login__note">
              يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LoginPage;
