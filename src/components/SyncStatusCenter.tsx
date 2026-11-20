import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Database, Info, Loader2, RefreshCw, UploadCloud, Wifi, WifiOff, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getQueuedMutations, MAX_ATTEMPTS, type QueuedMutation } from '../services/offlineQueueService';

interface SyncStatusCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncStatusCenter: React.FC<SyncStatusCenterProps> = ({ isOpen, onClose }) => {
  const {
    isOffline,
    pendingInvoicesCount,
    offlineQueueCount,
    deadLetterCount,
    storageQuotaExceeded,
    flushPendingInvoices,
    flushOfflineQueue,
    syncWithSupabase,
    checkDatabaseConnection,
    supabaseStatus,
    isSupabaseSyncing,
  } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const loadQueue = async () => {
    setLoadingQueue(true);
    try {
      const items = await getQueuedMutations();
      setQueue(Array.isArray(items) ? [...items].sort((a,b)=>b.queuedAt-a.queuedAt) : []);
    } catch {
      setQueue([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (isOpen) void loadQueue();
  }, [isOpen, pendingInvoicesCount, offlineQueueCount]);

  const health = useMemo(() => {
    if (isOffline) return { label: 'غير متصل', cls: 'bg-rose-50 text-rose-800 border-rose-200', icon: WifiOff };
    if ((pendingInvoicesCount || 0) + (offlineQueueCount || 0) > 0) return { label: 'متصل مع عناصر معلّقة', cls: 'bg-amber-50 text-amber-800 border-amber-200', icon: UploadCloud };
    if (supabaseStatus?.connected) return { label: 'متصل ومتزامن', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CheckCircle2 };
    return { label: 'متصل (حالة الخادم غير مؤكدة)', cls: 'bg-blue-50 text-blue-800 border-blue-200', icon: Wifi };
  }, [isOffline, pendingInvoicesCount, offlineQueueCount, supabaseStatus]);

  if (!isOpen) return null;

  const run = async (key: string, fn: () => Promise<any>, okText: string) => {
    setBusy(key); setMsg(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'success' in r && r.success === false) {
        setMsg({ tone: 'err', text: r.message || 'تعذر إتمام العملية' });
      } else {
        const extra = r && typeof r === 'object' && 'syncedCount' in r ? ` (تمت مزامنة ${r.syncedCount || 0})` : '';
        setMsg({ tone: 'ok', text: okText + extra });
      }
    } catch (e: any) {
      setMsg({ tone: 'err', text: e?.message || 'حدث خطأ غير متوقع' });
    } finally {
      setBusy(null);
      void loadQueue();
    }
  };

  const entityLabel: Record<string,string> = { invoices:'فواتير/طلبات', visits:'زيارات/تحصيل/مرتجعات', customers:'عملاء', users:'مستخدمون', products:'أصناف', targets:'أهداف', forecasts:'توقعات تحصيل', forecast_plans:'خطط شهرية', customer_comments:'تعليقات عملاء' };
  const opLabel: Record<string,string> = { upsert:'حفظ/تحديث', delete:'حذف', replace:'استبدال كامل' };

  const HIcon = health.icon;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-l from-[#0f233d] via-[#162f52] to-[#1a3861] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center"><Cloud size={18} /></div>
            <div>
              <h3 className="font-black text-lg">مركز حالة المزامنة</h3>
              <p className="text-[11px] text-blue-100/90">متابعة الطابور المعلّق، الاتصال، والمزامنة اليدوية</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${health.cls}`}>
            <div className="flex items-center gap-2.5"><HIcon size={18} /><div><div className="text-xs font-bold opacity-80">الحالة الحالية</div><div className="font-black text-sm">{health.label}</div></div></div>
            <div className="text-[11px] font-extrabold">تحديث يدوي متاح أدناه</div>
          </div>

          {deadLetterCount > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="text-[12px] text-rose-800 leading-relaxed">
                <div className="font-black">⚠️ {deadLetterCount} عملية فشلت permanently (≥{MAX_ATTEMPTS} محاولات)</div>
                <div className="mt-1">هذه العمليات تجاوزت الحد الأقصى للمحاولات ولن تُعاد تلقائياً (لمنع spam على السيرفر). راجعها في الطابور أدناه أو أعد ضبطها يدوياً.</div>
              </div>
            </div>
          )}

          {storageQuotaExceeded && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 flex items-start gap-2.5">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[12px] text-amber-800 leading-relaxed">
                <div className="font-black">⚠️ مساحة التخزين المحلي ممتلئة (IndexedDB quota)</div>
                <div className="mt-1">بعض البيانات قد لا تُحفظ offline. امسح cache المتصفح أو أغلق تبويبات أخرى لتحرير مساحة.</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-bold text-slate-500">فواتير معلّقة (طابور محلي)</div><div className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{pendingInvoicesCount || 0}</div><div className="text-[11px] font-bold text-slate-500 mt-1">بانتظار الرفع للسحابة</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-bold text-slate-500">عمليات معلّقة (Outbox)</div><div className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{offlineQueueCount || 0}</div><div className="text-[11px] font-bold text-slate-500 mt-1">زيارات/تحديثات/بيانات</div></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3"><div className="text-[11px] font-bold text-slate-500">حالة الخادم</div><div className={`mt-1 text-sm font-black ${supabaseStatus?.connected ? 'text-emerald-700' : 'text-amber-700'}`}>{supabaseStatus?.connected ? 'متصل' : (supabaseStatus?.tableFound || 'غير متأكد')}</div><div className="text-[11px] font-bold text-slate-500 mt-1">{supabaseStatus?.error ? `تنبيه: ${supabaseStatus.error}` : 'اتصال قاعدة البيانات'}</div></div>
          </div>

          {msg && (
            <div className={`rounded-xl border px-3 py-2.5 text-xs font-extrabold flex items-center gap-2 ${msg.tone === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : msg.tone === 'err' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
              {msg.tone === 'ok' ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {msg.text}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button disabled={!!busy || isOffline} onClick={() => run('flush', () => flushOfflineQueue(), 'تم تفريغ طابور العمليات المعلّقة')} className="h-11 rounded-xl bg-[#102b4e] hover:bg-[#16365f] disabled:opacity-50 text-white font-black text-sm inline-flex items-center justify-center gap-2">
              {busy === 'flush' ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>} مزامنة العمليات المعلّقة
            </button>
            <button disabled={!!busy || isOffline} onClick={() => run('invoices', () => flushPendingInvoices(), 'تمت محاولة مزامنة الفواتير المعلّقة')} className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-sm inline-flex items-center justify-center gap-2">
              {busy === 'invoices' ? <Loader2 size={16} className="animate-spin"/> : <Database size={16}/>} مزامنة الفواتير المعلّقة
            </button>
            <button disabled={!!busy || isOffline || isSupabaseSyncing} onClick={() => run('sync', () => syncWithSupabase(), 'تم تنفيذ مزامنة السحابة')} className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm inline-flex items-center justify-center gap-2">
              {busy === 'sync' || isSupabaseSyncing ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>} مزامنة شاملة مع السحابة
            </button>
            <button disabled={!!busy} onClick={() => run('check', () => checkDatabaseConnection(), 'تم فحص الاتصال بالخادم')} className="h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 font-black text-sm inline-flex items-center justify-center gap-2">
              {busy === 'check' ? <Loader2 size={16} className="animate-spin"/> : <Cloud size={16}/>} فحص الاتصال
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="px-3.5 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-black text-slate-800"><Info size={15} className="text-[var(--app-text)]"/> تفاصيل طابور العمليات (Outbox)</div>
              <button onClick={() => void loadQueue()} className="text-[11px] font-extrabold px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 inline-flex items-center gap-1"><RefreshCw size={12} className={loadingQueue?'animate-spin':''}/> تحديث</button>
            </div>
            <div className="max-h-56 overflow-auto p-2 space-y-2">
              {loadingQueue ? (
                <div className="p-4 text-center text-xs font-bold text-slate-500">جارٍ تحميل تفاصيل الطابور...</div>
              ) : queue.length === 0 ? (
                <div className="p-4 text-center text-xs font-bold text-emerald-700 bg-emerald-50/60 rounded-xl border border-emerald-100">لا توجد عمليات معلّقة في الطابور ✅</div>
              ) : queue.slice(0, 30).map((it) => {
                const conflictLike = (it.attempts || 0) > 0 || !!it.lastError;
                return (
                  <div key={it.id} className={`rounded-xl border p-2.5 ${conflictLike ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900">{entityLabel[it.entity] || it.entity} · {opLabel[it.op] || it.op}</div>
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5 truncate" dir="ltr">ID: {it.entityId}</div>
                        <div className="text-[10px] font-bold text-slate-500 mt-0.5">وقت الإضافة: {new Date(it.queuedAt).toLocaleString('ar-EG')} · محاولات: {it.attempts || 0}</div>
                        {it.lastError && <div className="text-[10px] font-extrabold text-rose-700 mt-1">سبب/تنبيه: {it.lastError}</div>}
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-lg shrink-0 ${conflictLike ? 'bg-amber-200 text-amber-900' : 'bg-blue-100 text-blue-800'}`}>{conflictLike ? 'فشل/تعارض محتمل' : 'بانتظار المزامنة'}</span>
                    </div>
                  </div>
                );
              })}
              {queue.length > 30 && <div className="text-[10px] font-bold text-slate-500 text-center">يُعرض أول 30 عنصر — استخدم المزامنة لتفريغ الطابور</div>}
            </div>
            <div className="px-3.5 py-2.5 border-t border-slate-100 text-[11px] font-bold text-slate-500 bg-slate-50">عند تكرار الفشل قد يلزم مراجعة الاتصال/الصلاحيات أو إعادة المحاولة. التعارضات تُحل حسب منطق المزامنة (آخر كتابة/دمج حسب الكيان)؛ العناصر الناجحة تُزال تلقائيًا من الطابور.</div>
          </div>

          <div className="text-[11px] font-bold text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
            تعمل المزامنة تلقائيًا عند عودة الاتصال/التركيز ودوريًا أثناء العمل. استخدم الأزرار عند الحاجة لتسريع رفع العناصر المعلّقة أو التحقق من حالة الخادم.
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncStatusCenter;
