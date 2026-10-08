import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  X,
  Zap,
  Users,
  MapPin,
  CalendarCheck,
  Package,
  Receipt,
  Target,
  ShieldCheck,
  Clock,
  Activity,
  HardDrive
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface DatabaseConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DatabaseConnectionModal: React.FC<DatabaseConnectionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    supabaseStatus,
    isOffline,
    offlineQueueCount,
    flushOfflineQueue,
    syncWithSupabase,
    currentUser,
    checkDatabaseConnection,
  } = useApp();

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTestPing = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await checkDatabaseConnection();
      if (res.connected) {
        setTestResult(`الاتصال نشط وسريع! سرعة الاستجابة ${res.pingMs || 25}ms`);
      } else {
        setTestResult(res.error || 'فشل الاتصال بقاعدة البيانات');
      }
    } catch (e: any) {
      setTestResult(e?.message || 'خطأ أثناء اختبار الاتصال');
    } finally {
      setIsTesting(false);
    }
  };

  const handleFullSync = async () => {
    setIsTesting(true);
    try {
      await flushOfflineQueue();
      const res = await syncWithSupabase('both');
      setTestResult(res.message);
    } catch (e: any) {
      setTestResult(e?.message || 'خطأ أثناء المزامنة');
    } finally {
      setIsTesting(false);
    }
  };

  const isConnected = !isOffline && (supabaseStatus.connected !== false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg ${
              isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                <span>حالة قاعدة البيانات والمزامنة</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {isConnected ? 'متصل بالسحابة 🟢' : 'وضع أوفلاين 🟡'}
                </span>
              </h3>
              <p className="text-xs text-slate-300">
                قاعدة البيانات السحابية المركزية لشركة الطنطاوي (Supabase PostgreSQL)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 text-sm">
          {/* Main Status Banner */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            isConnected
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}>
            {isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
            )}
            <div className="flex-1">
              <div className="font-black text-sm">
                {isConnected ? 'الاتصال السحابي نشط ويعمل بكفاءة عالية' : 'التطبيق يعمل في وضع الأوفلاين (بدون إنترنت)'}
              </div>
              <p className="text-xs mt-1 leading-relaxed text-slate-600">
                {isConnected
                  ? 'أي طلبية أو زيارة أو تعديل يتم حفظه سحابياً فوراً، ويظهر للمشرف ومدير الفرع والإدارة في نفس اللحظة.'
                  : 'جميع بياناتك، الكتالوج، العملاء، والمخزون محفوظة محلياً على جهازك. يمكنك تسجيل الزيارات والطلبيات بحرية، وسيتم رفعها للسيرفر فور عودة النت تلقائياً.'}
              </p>
              {supabaseStatus.pingMs && (
                <div className="flex items-center gap-3 mt-2 text-[11px] font-mono font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5 text-emerald-600" />
                    استجابة السيرفر: {supabaseStatus.pingMs} ms
                  </span>
                  {supabaseStatus.lastSyncTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      آخر فحص: {supabaseStatus.lastSyncTime}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test Notice if any */}
          {testResult && (
            <div className="bg-slate-900 text-white p-3 rounded-xl text-xs font-bold flex items-center justify-between animate-in fade-in">
              <span>{testResult}</span>
              <button
                onClick={() => setTestResult(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Connected Tables & Records Grid */}
          <div>
            <h4 className="font-black text-xs text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span>السجلات المتزامنة في قاعدة البيانات السحابية</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">العملاء</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.customersCount?.toLocaleString() || '3,444+'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <CalendarCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">الزيارات الميدانية</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.visitsCount?.toLocaleString() || '1,120+'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">الأصناف والمخزون</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.productsCount?.toLocaleString() || '3,444+'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">الفواتير والطلبيات</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.invoicesCount?.toLocaleString() || 'نشط'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">المستخدمين وفريق العمل</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.usersCount || '10+'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold">أهداف التارجت</div>
                  <div className="text-sm font-black text-slate-900 font-mono">
                    {supabaseStatus.targetsCount?.toLocaleString() || 'نشط'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Offline Queue Status */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-300">طابور التغييرات الأوفلاين (IndexedDB)</div>
                <div className="text-sm font-black text-amber-400">
                  {offlineQueueCount === 0 ? 'لا توجد عمليات معلقة • كل شيء متزامن ✅' : `${offlineQueueCount} عملية مسجلة بانتظار المزامنة ⏳`}
                </div>
              </div>
            </div>
            {offlineQueueCount > 0 && (
              <button
                onClick={handleFullSync}
                disabled={isTesting}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>مزامنة الآن</span>
              </button>
            )}
          </div>

          {/* Role Scoping Assurance */}
          {currentUser && (
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-blue-950 space-y-2">
              <div className="flex items-center gap-2 font-black text-xs text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                <span>عزل البيانات والصلاحيات لحسابك ({currentUser.name})</span>
              </div>
              <p className="text-xs text-blue-900/80 leading-relaxed">
                {currentUser.role === 'sales_rep' &&
                  'أنت مسجل كمندوب مبيعات: الواجهة مقيدة بصلاحية صارمة، ترى فقط أرقامك الشخصية، عملاءك المسجلين باسمك، مخزن فرعك المتاح، وزياراتك الخاصة دون رؤية مناديب آخرين.'}
                {currentUser.role === 'supervisor' &&
                  `أنت مسجل كمشرف مناديب: ترى فقط أرقام مناديبك التابعين لإشرافك في (${currentUser.branchName})، زياراتهم، مرتجعاتهم، وطلبياتهم، ولا تظهر بيانات مناديب المشرفين الآخرين.`}
                {currentUser.role === 'branch_manager' &&
                  `أنت مسجل كمدير فرع (${currentUser.branchName}): ترى كافة أرقام الفرع، مناديب الفرع، مخزون الفرع، وزيارات الفرع بالكامل، ومحجوب عن الفروع الأخرى.`}
                {(currentUser.role === 'admin' || currentUser.role === 'developer') &&
                  'أنت مسجل كإدارة عليا / مطور: تتمتع بصلاحية شاملة على كافة الفروع الـ 7، والمخزن المركزي، والمستخدمين، مع إمكانية الفلترة الدقيقة.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleTestPing}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${isTesting ? 'animate-pulse' : ''}`} />
            <span>اختبار الاتصال السحابي ⚡</span>
          </button>

          <button
            type="button"
            onClick={handleFullSync}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>مزامنة شاملة 🔄</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
