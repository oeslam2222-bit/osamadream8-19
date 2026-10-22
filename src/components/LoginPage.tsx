import {
  AlertCircle,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Eye,
  EyeOff,
  Info,
  Lock,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User as UserIcon,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchUsersFromSupabase } from '../services/supabaseService';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const {
    login,
    users,
    supabaseStatus,
    isOffline,
    authTerminationNotice,
    clearAuthTerminationNotice,
  } = useApp();

  // --- Login State ---
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginErrorType, setLoginErrorType] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<string | null>(null);
  const [showAccountsGuide, setShowAccountsGuide] = useState(false);

  // Quick Connectivity Test
  const handleTestDatabaseConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const start = Date.now();
      const res = await fetchUsersFromSupabase(true);
      const latency = Date.now() - start;
      if (res.success) {
        setConnectionTestResult(
          `الاتصال السحابي ممتاز (${latency}ms) — متزامن مع ${res.users?.length || 0} موظف`
        );
      } else {
        setConnectionTestResult(`تنبيه السيرفر: ${res.error || 'تعذر القراءة'}`);
      }
    } catch (err: any) {
      setConnectionTestResult(`فشل الاتصال: ${err?.message || 'تعذر الوصول إلى الخادم'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Quick Fill Helper for Demo / Testing roles
  const handleQuickFill = (identifier: string, pass: string = '123456') => {
    setLoginIdentifier(identifier);
    setLoginPassword(pass);
    setLoginError(null);
  };

  // Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginErrorType(null);
    setConnectionTestResult(null);
    clearAuthTerminationNotice();
    setIsLoggingIn(true);

    const cleanId = loginIdentifier.trim();
    const cleanPass = loginPassword.trim();

    if (!cleanId) {
      setLoginError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف');
      setLoginErrorType('user_not_found');
      setIsLoggingIn(false);
      return;
    }

    if (!cleanPass) {
      setLoginError('يرجى إدخال كلمة المرور');
      setLoginErrorType('wrong_password');
      setIsLoggingIn(false);
      return;
    }

    try {
      const result = await login(cleanId, cleanPass);
      setIsLoggingIn(false);

      if (!result.success) {
        setLoginError(result.message);
        setLoginErrorType(result.errorType || 'general');
      } else {
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setIsLoggingIn(false);
      setLoginError(err?.message || 'حدث خطأ غير متوقع أثناء معالجة تسجيل الدخول');
      setLoginErrorType('general');
    }
  };

  // Sample quick roles from loaded users or defaults
  const quickAccounts = useMemo(() => {
    const adminUser = users.find((u) => u.role === 'admin' || u.role === 'developer');
    const managerUser = users.find((u) => u.role === 'branch_manager');
    const supUser = users.find((u) => u.role === 'supervisor');
    const repUser = users.find((u) => u.role === 'sales_rep');

    return [
      {
        roleLabel: 'مدير النظام',
        badge: '👑 إدارة',
        user: adminUser || { username: 'admin', name: 'مدير النظام', role: 'admin' },
      },
      {
        roleLabel: 'مدير فرع',
        badge: '🏢 فرع',
        user: managerUser || { username: 'manager', name: 'مدير الفرع', role: 'branch_manager' },
      },
      {
        roleLabel: 'مشرف مبيعات',
        badge: '💼 إشراف',
        user: supUser || { username: 'supervisor', name: 'مشرف المناديب', role: 'supervisor' },
      },
      {
        roleLabel: 'مندوب ميداني',
        badge: '🚚 مبيعات',
        user: repUser || { username: 'rep', name: 'مندوب المبيعات', role: 'sales_rep' },
      },
    ];
  }, [users]);

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-50 via-amber-50/25 to-slate-100 text-slate-800 flex flex-col justify-between p-4 sm:p-6 antialiased selection:bg-amber-400 selection:text-slate-950 font-sans"
      dir="rtl"
    >
      {/* Top Bar with Live Cloud & Offline Status */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between py-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 font-bold">
          <span
            className={`w-2 h-2 rounded-full ${
              !isOffline && supabaseStatus.connected !== false
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-amber-500'
            }`}
          />
          <span>
            {!isOffline && supabaseStatus.connected !== false ? 'متصل سحابياً 🟢' : 'وضع العمل أوفلاين 🟡'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleTestDatabaseConnection}
          disabled={isTestingConnection}
          className="text-slate-600 hover:text-amber-700 bg-white/80 hover:bg-white border border-slate-200/80 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
          title="فحص جودة الاتصال بالسحابة"
        >
          <RefreshCw className={`w-3 h-3 text-amber-600 ${isTestingConnection ? 'animate-spin' : ''}`} />
          <span>{isTestingConnection ? 'جاري الفحص...' : 'فحص الاتصال'}</span>
        </button>
      </header>

      {/* Main Content Card (Flutter Material 3 Elevated Card Style) */}
      <main className="w-full max-w-md mx-auto my-auto py-4">
        {/* Brand Avatar & Title */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-white p-2.5 shadow-xl shadow-amber-500/10 mb-3 border-2 border-amber-400/80 transform hover:scale-105 transition duration-300">
            <img
              src="/tantawy-brand-logo.svg?v=3.1"
              alt="مجموعة الطنطاوي"
              className="w-full h-full object-contain rounded-2xl"
              onError={(e) => {
                // Fallback to stylized Arabic emblem
                e.currentTarget.style.display = 'none';
                if (e.currentTarget.parentElement) {
                  e.currentTarget.parentElement.innerHTML =
                    '<div class="w-full h-full rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-slate-950 font-black text-3xl font-mono shadow-inner">ط</div>';
                }
              }}
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            مجموعة الطنطاوي للتجارة والتوزيع
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-bold">
            منظومة مبيعات المناديب وإدارة الفواتير والتحصيل الميداني
          </p>
        </div>

        {/* Flutter Material 3 Elevated Login Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 border border-slate-200/80 p-5 sm:p-7 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold">
                <LogIn className="w-4 h-4" />
              </span>
              <span>تسجيل الدخول للمنظومة</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              أدخل بيانات الحساب المصرح لك بالدخول به لمتابعة أعمالك
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-3.5">
            {/* Auth Termination Notice */}
            {authTerminationNotice && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl text-xs flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-bold leading-relaxed">{authTerminationNotice}</div>
              </div>
            )}

            {/* Diagnostic Error Banner */}
            {loginError && (
              <div className="bg-rose-50 border-2 border-rose-200 text-rose-900 p-3 rounded-2xl text-xs space-y-1.5 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-black block text-rose-800">
                      {loginErrorType === 'connection'
                        ? 'تعذر الاتصال بالسحابة'
                        : loginErrorType === 'wrong_password'
                        ? 'كلمة المرور غير صحيحة'
                        : loginErrorType === 'user_not_found'
                        ? 'الحساب غير مسجل'
                        : 'تنبيه تسجيل الدخول'}
                    </span>
                    <p className="text-[11.5px] text-rose-700 leading-normal mt-0.5">{loginError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Connection Test Result */}
            {connectionTestResult && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-2xl text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <span className="font-bold">{connectionTestResult}</span>
                <button
                  type="button"
                  onClick={() => setConnectionTestResult(null)}
                  className="text-emerald-600 hover:text-emerald-950 text-xs font-black p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Username / Email Field */}
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">
                اسم المستخدم أو البريد الوظيفي
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="مثال: osama أو ahmed@tantawy.com"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full h-12 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-2xl px-4 pr-10 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition font-medium"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label className="block text-xs font-black text-slate-700">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور الخاصة بحسابك"
                  required
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full h-12 bg-slate-50 hover:bg-slate-100/60 focus:bg-white border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 rounded-2xl px-4 pr-10 pl-11 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none transition font-medium"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-700 absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition"
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button (Flutter FilledButton Style) */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full h-12 sm:h-13 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black rounded-2xl shadow-md shadow-amber-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-60 cursor-pointer mt-2"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>جاري تسجيل الدخول...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>تسجيل الدخول إلى حسابي</span>
                </>
              )}
            </button>
          </form>

          {/* Flutter-style Quick Role Chips for One-Tap Mobile Login Testing */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-500 font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>دخول سريع للتجربة والتحقق:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAccountsGuide(!showAccountsGuide)}
                className="text-amber-700 hover:text-amber-900 font-black flex items-center gap-0.5 cursor-pointer text-[11px]"
              >
                <span>{showAccountsGuide ? 'إخفاء الدليل' : 'دليل الموظفين'}</span>
                {showAccountsGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {quickAccounts.map(({ roleLabel, badge, user }) => {
                const username = user?.username || ('email' in user ? (user as any).email?.split('@')[0] : '') || 'admin';
                return (
                  <button
                    key={roleLabel}
                    type="button"
                    onClick={() => handleQuickFill(username, '123456')}
                    className="p-2 bg-slate-50 hover:bg-amber-50 border border-slate-200/80 hover:border-amber-300 rounded-xl text-right transition cursor-pointer active:scale-95 group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs text-slate-800 group-hover:text-amber-900">
                        {roleLabel}
                      </span>
                      <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.2 rounded-md font-bold text-slate-600">
                        {badge}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-slate-500 truncate mt-0.5 font-mono">
                      {user?.name || username}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Collapsible Registered Accounts Guide */}
            {showAccountsGuide && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between font-black text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-600" />
                    <span>الموظفون المسجلون في قاعدة البيانات ({users.length}):</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">انقر للاختيار</span>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-100 pr-0.5">
                  {users.slice(0, 15).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        handleQuickFill(u.username || u.email, '123456');
                        setShowAccountsGuide(false);
                      }}
                      className="w-full text-right py-1.5 px-2 rounded-lg hover:bg-amber-100/60 transition flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="truncate">
                        <strong className="text-slate-900 font-bold block">{u.name}</strong>
                        <span className="text-slate-500 font-mono text-[10px]">
                          {u.username || u.email} • {u.branchName || 'كل الفروع'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                        {u.role === 'admin'
                          ? 'إدارة'
                          : u.role === 'branch_manager'
                          ? 'مدير فرع'
                          : u.role === 'supervisor'
                          ? 'مشرف'
                          : u.role === 'developer'
                          ? 'مطور'
                          : 'مندوب'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Clean Mobile-Friendly Footer */}
      <footer className="w-full max-w-md mx-auto text-center py-2 text-xs text-slate-400">
        <p className="font-bold text-slate-600">
          مجموعة الطنطاوي للتجارة والتوزيع • TANTAWY GROUP
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          منظومة سحابية مشفرة متوافقة مع الفاتورة الإلكترونية والموبايل
        </p>
      </footer>
    </div>
  );
};
