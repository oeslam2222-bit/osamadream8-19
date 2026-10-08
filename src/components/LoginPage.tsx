import {
  AlertCircle,
  Database,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Server,
  ShieldCheck,
  User as UserIcon,
  UserCheck,
  Building2,
  Users,
  Briefcase
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const {
    login,
    loginAs,
    users,
    supabaseStatus,
    isOffline,
    authTerminationNotice,
    clearAuthTerminationNotice
  } = useApp();

  // --- Login State ---
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showQuickRoles, setShowQuickRoles] = useState(false);

  // Available sample users for instant role verification
  const repUser = users.find((u) => u.role === 'sales_rep' && u.name) || users.find((u) => u.role === 'sales_rep');
  const supervisorUser = users.find((u) => u.role === 'supervisor' && u.name) || users.find((u) => u.role === 'supervisor');
  const managerUser = users.find((u) => u.role === 'branch_manager' && u.name) || users.find((u) => u.role === 'branch_manager');
  const adminUser = users.find((u) => (u.role === 'admin' || u.role === 'developer') && u.name) || users[0];

  const handleQuickLogin = (userId: string) => {
    loginAs(userId);
    if (onSuccess) onSuccess();
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-center items-center p-3 sm:p-6 antialiased selection:bg-amber-500 selection:text-slate-950">
      {/* Background glow visual accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md z-10 my-4">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white p-1 shadow-2xl shadow-amber-500/20 mb-3 border-2 border-amber-400">
            <img src="/tantawy-brand-logo.svg?v=3.1" alt="Tantawy Group - مجموعة الطنطاوي" className="w-full h-full object-contain rounded-full" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>مجموعة الطنطاوي للتجارة والتوزيع</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm mx-auto font-medium">
            TANTAWY GROUP • منظومة إدارة المبيعات والفروع والمخازن المركزية
          </p>
        </div>

        {/* Card Box */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <LogIn className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-black text-sm sm:text-base text-white">تسجيل الدخول للنظام</h2>
                <p className="text-[11px] text-slate-400">للمطورين، المديرين، المشرفين، والمناديب</p>
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
              <label className="block text-xs font-bold text-slate-300 mb-1.5 text-right">
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
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition pr-10 font-mono"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 text-right">
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
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition pr-10 pl-10"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-200 absolute left-3.5 top-3.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3.5 rounded-xl shadow-lg transition transform active:scale-98 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-4 cursor-pointer"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>جاري التحقق من قاعدة البيانات...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>دخول إلى منظومة دريم</span>
                </>
              )}
            </button>

            {/* Note that accounts are managed by Admin/Developer only */}
            <div className="pt-3 border-t border-slate-800 text-center space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يتم إنشاء وتفعيل حسابات الموظفين والصلاحيات حصرياً من قِبل إدارة النظام (الآدمن والمطور).
              </p>

              {/* Toggle Quick Role Preview */}
              <button
                type="button"
                onClick={() => setShowQuickRoles(!showQuickRoles)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
              >
                {showQuickRoles ? '▲ إخفاء فحص واختبار الأدوار والصلاحيات' : '▼ فحص واختبار أدوار المنظومة (مندوب / مشرف / مدير فرع / إدارة)'}
              </button>

              {showQuickRoles && (
                <div className="space-y-2 pt-2 animate-in fade-in duration-200 text-right">
                  <div className="text-[10px] text-slate-400 font-bold mb-1">
                    انقر على أي دور للمعاينة والتحقق فوراً من عزل البيانات والصلاحيات:
                  </div>

                  {repUser && (
                    <button
                      type="button"
                      onClick={() => handleQuickLogin(repUser.id)}
                      className="w-full bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-500/40 p-2.5 rounded-xl text-xs flex items-center justify-between text-emerald-200 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">دخول كمندوب: {repUser.name}</div>
                          <div className="text-[10px] text-emerald-300/80">{repUser.branchName || 'فرعه'} • يرى أرقامه وعملاءه ومخزنه فقط</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-black">مندوب</span>
                    </button>
                  )}

                  {supervisorUser && (
                    <button
                      type="button"
                      onClick={() => handleQuickLogin(supervisorUser.id)}
                      className="w-full bg-blue-950/60 hover:bg-blue-900 border border-blue-500/40 p-2.5 rounded-xl text-xs flex items-center justify-between text-blue-200 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">دخول كمشرف: {supervisorUser.name}</div>
                          <div className="text-[10px] text-blue-300/80">{supervisorUser.branchName || 'فرعه'} • يرى مناديبه وأرقامهم بالكامل</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-black">مشرف</span>
                    </button>
                  )}

                  {managerUser && (
                    <button
                      type="button"
                      onClick={() => handleQuickLogin(managerUser.id)}
                      className="w-full bg-purple-950/60 hover:bg-purple-900 border border-purple-500/40 p-2.5 rounded-xl text-xs flex items-center justify-between text-purple-200 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">دخول كمدير فرع: {managerUser.name}</div>
                          <div className="text-[10px] text-purple-300/80">{managerUser.branchName || 'الفرع'} • يرى أرقام الفرع ومخزونه كاملاً</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-black">مدير فرع</span>
                    </button>
                  )}

                  {adminUser && (
                    <button
                      type="button"
                      onClick={() => handleQuickLogin(adminUser.id)}
                      className="w-full bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 p-2.5 rounded-xl text-xs flex items-center justify-between text-rose-200 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">دخول كإدارة عليا: {adminUser.name}</div>
                          <div className="text-[10px] text-rose-300/80">صلاحية شاملة على كافة الفروع الـ 7 والشركة</div>
                        </div>
                      </div>
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded font-black">إدارة</span>
                    </button>
                  )}
                </div>
              )}

              {/* Database Live Connectivity Badge */}
              <div className="pt-2 flex items-center justify-center gap-2 text-[11px] text-slate-300">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${
                  !isOffline && supabaseStatus.connected !== false
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                }`}>
                  <Database className="w-3 h-3 text-emerald-400" />
                  <span>
                    {!isOffline && supabaseStatus.connected !== false
                      ? `قاعدة البيانات السحابية متصلة بنجاح 🟢 (${supabaseStatus.pingMs || 30}ms)`
                      : 'وضع العمل أوفلاين (الحفظ محلي دون إنترنت) 🟡'}
                  </span>
                </span>
              </div>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};
