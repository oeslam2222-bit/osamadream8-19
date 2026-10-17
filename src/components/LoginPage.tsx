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
  Briefcase,
  RefreshCw,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchUsersFromSupabase } from '../services/supabaseService';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const {
    login,
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
  const [loginErrorType, setLoginErrorType] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<string | null>(null);

  // Quick Connectivity Test
  const handleTestDatabaseConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const start = Date.now();
      const res = await fetchUsersFromSupabase(true);
      const latency = Date.now() - start;
      if (res.success) {
        setConnectionTestResult(`الاتصال بقاعدة البيانات السحابية سليم وسريع 🟢 (${latency}ms - ${res.users?.length || 0} مستخدم متزامن).`);
      } else {
        setConnectionTestResult(`تنبيه من السيرفر: ${res.error || 'تعذر القراءة من الجداول'}`);
      }
    } catch (err: any) {
      setConnectionTestResult(`فشل الاتصال: ${err?.message || 'تعذر الوصول إلى Supabase'}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginErrorType(null);
    setConnectionTestResult(null);
    clearAuthTerminationNotice();
    setIsLoggingIn(true);

    if (!loginIdentifier.trim()) {
      setLoginError('يرجى إدخال اسم المستخدم أو البريد الإلكتروني أو رقم الهاتف');
      setLoginErrorType('user_not_found');
      setIsLoggingIn(false);
      return;
    }

    if (!loginPassword.trim()) {
      setLoginError('يرجى إدخال كلمة المرور');
      setLoginErrorType('wrong_password');
      setIsLoggingIn(false);
      return;
    }

    try {
      const result = await login(loginIdentifier, loginPassword);
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
            <span>طنطاوي دريم جروب</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm mx-auto font-medium">
            مجموعة الطنطاوي للتجارة والتوزيع • TANTAWY DREAM GROUP
          </p>
          <p className="text-[10px] text-amber-400/90 mt-1.5 font-bold">
            منظومة إدارة المبيعات والفروع والمخازن المركزية
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

            {/* Diagnostic Informative Error Banner */}
            {loginError && (
              <div className="bg-rose-950/50 border-2 border-rose-500/40 text-rose-200 p-3.5 rounded-2xl text-xs space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-white">
                        {loginErrorType === 'connection'
                          ? '🔴 خطأ في اتصال قاعدة البيانات السحابية'
                          : loginErrorType === 'user_not_found'
                          ? '🔍 اسم المستخدم غير مسجل'
                          : loginErrorType === 'wrong_password'
                          ? '🔑 خطأ في كلمة المرور'
                          : loginErrorType === 'inactive'
                          ? '🛡️ حالة الحساب معطلة أو قيد المراجعة'
                          : loginErrorType === 'no_password'
                          ? '⚠️ حساب بدون كلمة مرور'
                          : '⚠️ تنبيه تسجيل الدخول'}
                      </span>
                    </div>
                    <p className="leading-relaxed text-rose-200 font-medium">{loginError}</p>
                  </div>
                </div>

                {/* Helpful Guidance Tips */}
                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-1">
                  {loginErrorType === 'connection' && (
                    <div className="flex items-start gap-1.5 text-amber-300">
                      <span>💡</span>
                      <span>تحقق من اتصال هاتفك بالإنترنت، ثم اضغط على زر "فحص اتصال السحابة" أدناه لمعرفة حالة السيرفر.</span>
                    </div>
                  )}
                  {loginErrorType === 'user_not_found' && (
                    <div className="flex items-start gap-1.5 text-blue-300">
                      <span>💡</span>
                      <span>تأكد من أن إدارة النظام قامت بإنشاء وتفعيل حسابك في قائمة الموظفين (users / app_users). يمكنك أيضاً تجربة كتابة رقم هاتفك أو اسمك المعتمد.</span>
                    </div>
                  )}
                  {loginErrorType === 'wrong_password' && (
                    <div className="flex items-start gap-1.5 text-amber-300">
                      <span>💡</span>
                      <span>تأكد من لغة لوحة المفاتيح (عربي/إنجليزي)، والتأكد من إيقاف الـ Caps Lock، وتفادي المسافات غير المقصودة في البداية أو النهاية.</span>
                    </div>
                  )}
                  {(!loginErrorType || loginErrorType === 'general') && (
                    <div className="flex items-start gap-1.5 text-slate-300">
                      <span>💡</span>
                      <span>إذا استمرت المشكلة، يرجى التواصل مع الدعم الفني أو مسؤول منظومة دريم.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Connection Test Result Notice */}
            {connectionTestResult && (
              <div className="bg-slate-950/80 border border-slate-700 text-slate-200 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 animate-in fade-in">
                <span>{connectionTestResult}</span>
                <button
                  type="button"
                  onClick={() => setConnectionTestResult(null)}
                  className="text-slate-400 hover:text-white text-[10px]"
                >
                  ✕
                </button>
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition pr-10 font-mono"
                />
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 text-right">
                💡 يمكنك الدخول بالبريد الإلكتروني، اسم المستخدم، أو الاسم المسجل.
              </p>
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
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



              {/* Database Live Connectivity Badge & Direct Test */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2 text-[11px] text-slate-300">
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

                <button
                  type="button"
                  onClick={handleTestDatabaseConnection}
                  disabled={isTestingConnection}
                  className="text-amber-400 hover:text-amber-300 text-[10.5px] font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-amber-400/30 transition cursor-pointer disabled:opacity-50"
                  title="فحص سرعة استجابة قاعدة البيانات ومطابقة المستخدمين"
                >
                  <RefreshCw className={`w-3 h-3 ${isTestingConnection ? 'animate-spin' : ''}`} />
                  <span>{isTestingConnection ? 'جاري الفحص...' : 'فحص السحابة ⚡'}</span>
                </button>
              </div>
            </div>
           </form>

         </div>

         {/* Footer — البراندينج والمطور */}
         <div className="text-center mt-5">
           <p className="text-[11px] font-bold text-slate-400">
             طنطاوي دريم جروب • TANTAWY DREAM GROUP
           </p>
           <p className="text-[10px] text-slate-500 mt-1">
             برمجة وتطوير: <span className="text-amber-400 font-black">اسامة اسلام محمود</span>
           </p>
         </div>
       </div>
     </div>
   );
 };
