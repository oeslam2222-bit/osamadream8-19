import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Phone,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { login, register, branches } = useApp();

  const [activeMode, setActiveMode] = useState<'login' | 'register'>('login');

  // Login State - Clean, empty by default to protect privacy
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Register State for new Sales Reps
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regBranch, setRegBranch] = useState(branches[0]?.name || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)');
  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
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
      setLoginError(err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccessMsg(null);
    setIsRegistering(true);

    if (!regName.trim() || !regPhone.trim() || !regPassword.trim()) {
      setRegError('يرجى ملء جميع الحقول المطلوبة (الاسم، الهاتف، كلمة المرور)');
      setIsRegistering(false);
      return;
    }

    if (regPassword.length < 4) {
      setRegError('كلمة المرور يجب أن تكون 4 خانات على الأقل');
      setIsRegistering(false);
      return;
    }

    const cleanUsername = (regUsername.trim() || `rep_${regPhone.slice(-6)}`).toLowerCase();
    const cleanEmail = (regEmail.trim() || `${cleanUsername}@dream-dist.com`).toLowerCase();

    try {
      const res = register({
        name: regName.trim(),
        username: cleanUsername,
        email: cleanEmail,
        password: regPassword.trim(),
        phone: regPhone.trim(),
        branchName: regBranch,
        role: 'sales_rep',
      });

      setIsRegistering(false);

      if (res.success) {
        setRegSuccessMsg('تم إرسال طلب تسجيل حسابك بنجاح إلى قاعدة البيانات السحابية! حسابك قيد مراجعة وتفعيل الإدارة المركزية.');
        setRegName('');
        setRegPhone('');
        setRegUsername('');
        setRegEmail('');
        setRegPassword('');
      } else {
        setRegError(res.message);
      }
    } catch (err: any) {
      setIsRegistering(false);
      setRegError(err?.message || 'تعذر إرسال طلب التسجيل');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-center items-center p-3 sm:p-6 antialiased selection:bg-amber-500 selection:text-slate-950">
      
      {/* Background visual accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-amber-600/15 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md z-10">
        
        {/* Header Branding */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-xl shadow-amber-500/20 mb-3 border border-amber-300/40">
            <span className="text-2xl sm:text-3xl font-black font-serif">D</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>شركة دريم للتجارة والتوزيع</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            منظومة إدارة المبيعات والمخازن والربط السحابي بالفواتير الإلكترونية
          </p>
        </div>

        {/* Card Box */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl backdrop-blur-md">
          
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-2xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => {
                setActiveMode('login');
                setLoginError(null);
              }}
              className={`py-2.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMode === 'login'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveMode('register');
                setRegError(null);
                setRegSuccessMsg(null);
              }}
              className={`py-2.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeMode === 'register'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>طلب حساب مندوب</span>
            </button>
          </div>

          {/* LOGIN FORM */}
          {activeMode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4 animate-in fade-in duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <LogIn className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="font-black text-sm sm:text-base text-white">دخول المستخدمين</h2>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  سحابي ومحمي
                </span>
              </div>

              {loginError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>{loginError}</div>
                </div>
              )}

              {/* Identifier */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  اسم المستخدم أو البريد أو الهاتف
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="أدخل اسم المستخدم أو البريد"
                    required
                    autoComplete="username"
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition pr-10"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  كلمة المرور الخاصة بك
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    required
                    autoComplete="current-password"
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none transition pr-10 pl-10"
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
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 rounded-xl shadow-lg transition transform active:scale-98 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-3 cursor-pointer"
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

              <div className="pt-3 border-t border-slate-800/80 text-center">
                <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>تسجيل دخول مشفر ومربوط بقاعدة البيانات السحابية</span>
                </p>
              </div>

            </form>
          )}

          {/* REGISTER FORM */}
          {activeMode === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 animate-in fade-in duration-200">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <UserPlus className="w-3.5 h-3.5" />
                  </div>
                  <h2 className="font-black text-sm sm:text-base text-white">تسجيل مندوب مبيعات جديد</h2>
                </div>
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  طلب جديد
                </span>
              </div>

              {regSuccessMsg && (
                <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>{regSuccessMsg}</div>
                </div>
              )}

              {regError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>{regError}</div>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الاسم ثلاثي أو ثنائي *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="مثال: أحمد محمود علي"
                    required
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition pr-9"
                  />
                  <User className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  رقم الهاتف / الواتساب *
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="مثال: 01012345678"
                    required
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition pr-9"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
                </div>
              </div>

              {/* Branch Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  الفرع التابع له *
                </label>
                <div className="relative">
                  <select
                    value={regBranch}
                    onChange={(e) => setRegBranch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none transition pr-9 appearance-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name} className="bg-slate-900 text-white">
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <Building2 className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Username (Optional / Auto) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  اسم المستخدم للدخول (اختياري)
                </label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="مثال: ahmed_rep (سيتم توليده تلقائياً إن ترك فارغاً)"
                  className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  كلمة المرور الخاصة بك *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="اختر كلمة مرور خاصة بحسابك"
                    required
                    className="w-full bg-slate-950 border border-slate-750 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition pr-9 pl-9"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3.5" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-slate-400 hover:text-slate-200 absolute left-3 top-3.5"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Submit Register */}
              <button
                type="submit"
                disabled={isRegistering}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 rounded-xl shadow-lg transition transform active:scale-98 flex items-center justify-center gap-2 text-xs sm:text-sm disabled:opacity-50 mt-2 cursor-pointer"
              >
                {isRegistering ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري تسجيل الحساب في قاعدة البيانات...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>إرسال طلب تسجيل الحساب</span>
                  </>
                )}
              </button>

            </form>
          )}

        </div>
      </div>
    </div>
  );
};
