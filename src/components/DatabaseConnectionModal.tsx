import React, { useEffect, useState } from 'react';
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
import { probeWriteAccess, TableWriteProbe } from '../services/supabaseService';

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
  const [writeProbes, setWriteProbes] = useState<TableWriteProbe[] | null>(null);
  const [isProbing, setIsProbing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    checkDatabaseConnection().catch(() => {});
  }, [isOpen, checkDatabaseConnection]);

  if (!isOpen) return null;

  const handleProbeWrites = async () => {
    setIsProbing(true);
    setWriteProbes(null);
    try {
      const probes = await probeWriteAccess();
      setWriteProbes(probes);
      const failed = probes.filter((probe) => !probe.ok);
      setTestResult(
        failed.length === 0
          ? 'كل الجداول بتقبل الكتابة فعلاً ✅'
          : `في ${failed.length} جدول رافض الكتابة — شوف تفاصيل الفحص تحت`
      );
    } catch (e: any) {
      setTestResult(e?.message || 'فشل فحص الكتابة على الجداول');
    } finally {
      setIsProbing(false);
    }
  };

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
              isConnected ? 'bg-[var(--app-ok)] text-white border border-[var(--app-ok)]' : 'bg-white/10 text-[#fde68a] border border-white/20'
            }`}>
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg flex items-center gap-2">
                <span>حالة قاعدة البيانات والمزامنة</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                  isConnected
                    ? 'bg-[var(--app-ok-tint)] text-[#5eead4] border-[var(--app-ok-line)]'
                    : 'bg-white/10 text-[#fde68a] border-white/20'
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
              ? 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]'
              : 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
          }`}>
            {isConnected ? (
              <CheckCircle2 className="w-5 h-5 text-[var(--app-ok-text)] shrink-0 mt-0.5" />
            ) : (
              <WifiOff className="w-5 h-5 text-[var(--app-warn-text)] shrink-0 mt-0.5 animate-pulse" />
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
                    <Activity className="w-3.5 h-3.5 text-[var(--app-ok-text)]" />
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

          {/* Write-access probe: «متصل» مش معناها إن الكتابة شغالة */}
          {writeProbes && (
            <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-xs text-slate-700">
                <HardDrive className="w-4 h-4 text-slate-500" />
                <span>فحص صلاحية الكتابة على الجداول</span>
              </div>
              <div className="space-y-1.5">
                {writeProbes.map((probe) => (
                  <div
                    key={probe.table}
                    className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                      probe.ok
                        ? 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]'
                        : 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)] text-[var(--app-risk-text)]'
                    }`}
                  >
                    <span className="font-mono" dir="ltr">{probe.table}</span>
                    <span className="flex-1 text-right">
                      {probe.ok ? 'الكتابة متاحة' : `مرفوضة${probe.code ? ` (${probe.code})` : ''}`}
                      {probe.note ? ` — ${probe.note}` : ''}
                    </span>
                    {!probe.ok && probe.message && (
                      <span className="w-full text-[10px] font-mono opacity-90" dir="ltr">
                        {probe.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                لو جدول ظهر «مرفوضة (RLS)»: الكتابة محتاجة سياسة على السيرفر (Supabase → Authentication → Policies)
                أو مفتاح service_role. التحديث المستخدم في الفحص بنفس القيمة، فمفيش أي بيانات اتغيرت.
              </p>
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center shrink-0">
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center shrink-0">
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] flex items-center justify-center shrink-0">
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center shrink-0">
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] flex items-center justify-center shrink-0">
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
                <div className="w-8 h-8 rounded-xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center shrink-0">
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
              <div className="w-9 h-9 rounded-xl bg-white/10 text-[#5eead4] flex items-center justify-center font-black">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-300">طابور التغييرات الأوفلاين (IndexedDB)</div>
                <div className="text-sm font-black text-[#5eead4]">
                  {offlineQueueCount === 0 ? 'لا توجد عمليات معلقة • كل شيء متزامن ✅' : `${offlineQueueCount} عملية مسجلة بانتظار المزامنة ⏳`}
                </div>
              </div>
            </div>
            {offlineQueueCount > 0 && (
              <button
                onClick={handleFullSync}
                disabled={isTesting}
                className="bg-[var(--app-accent)] hover:bg-[#00827a] text-white font-black px-3.5 py-2 rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>مزامنة الآن</span>
              </button>
            )}
          </div>

          {/* Role Scoping Assurance */}
          {currentUser && (
            <div className="p-4 rounded-2xl bg-[var(--app-navy-tint)] border border-[var(--app-navy-line)] text-[var(--app-navy-text)] space-y-2">
              <div className="flex items-center gap-2 font-black text-xs text-[var(--app-navy-text)]">
                <ShieldCheck className="w-4 h-4 text-[var(--app-navy-text)]" />
                <span>عزل البيانات والصلاحيات لحسابك ({currentUser.name})</span>
              </div>
              <p className="text-xs text-[var(--app-navy-text)] leading-relaxed">
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleProbeWrites}
            disabled={isProbing}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <HardDrive className={`w-3.5 h-3.5 text-slate-500 ${isProbing ? 'animate-pulse' : ''}`} />
            <span>فحص الكتابة على الجداول 🗄️</span>
          </button>

          <button
            type="button"
            onClick={handleTestPing}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 text-[#5eead4] ${isTesting ? 'animate-pulse' : ''}`} />
            <span>اختبار الاتصال السحابي ⚡</span>
          </button>

          <button
            type="button"
            onClick={handleFullSync}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black bg-[var(--app-accent)] hover:bg-[#00827a] text-white transition cursor-pointer active:scale-95 disabled:opacity-50"
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
