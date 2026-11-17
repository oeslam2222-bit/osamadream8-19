import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Eye,
  FileSpreadsheet,
  FileText,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { buildShortageReport, downloadShortageReport } from '../services/shortageReportService';
import { fetchInvoiceRowById } from '../services/supabaseService';
import { InvoiceItemsTable } from './InvoiceItemsTable';
import type { Invoice, OrderStatus } from '../types';

type StageKey = 'supervisor' | 'admin' | 'prep' | 'delivery' | 'closed' | 'cancelled';

/**
 * لون هادئ لكل مرحلة من سير الطلب — توكنز الثيم، فالكارت بيبقى فاتح في
 * النهاري وغامق في الليلي مع نص مقروء في الحالتين (بدل الكحلي الثابت).
 */
const STAGE_TONE: Record<StageKey, string> = {
  supervisor: 'tg-stage-card--warn',
  admin: 'tg-stage-card--primary',
  prep: 'tg-stage-card--violet',
  delivery: 'tg-stage-card--secondary',
  closed: 'tg-stage-card--ok',
  cancelled: 'tg-stage-card--risk',
};

const STAGES: { key: StageKey; title: string; desc: string }[] = [
  { key: 'supervisor', title: 'اعتماد المشرف', desc: 'مراجعة أولى واعتماد/إرجاع' },
  { key: 'admin', title: 'اعتماد الإدارة', desc: 'اعتماد نهائي والبت في الاستثناء' },
  { key: 'prep', title: 'تجهيز الطلبية', desc: 'تحضير الأصناف ومعالجة النواقص/التوريد' },
  { key: 'delivery', title: 'توصيل', desc: 'الطلب في الطريق للتسليم' },
  { key: 'closed', title: 'استلام وإغلاق الطلب', desc: 'تم التسليم وإقفال الطلب' },
  { key: 'cancelled', title: 'إلغاء الطلب', desc: 'طلبات منتهية بالإلغاء' },
];

function getStage(inv: Invoice): StageKey {
  const s = inv.status as string;
  if (['مرفوضة / ملغاة', 'ملغاة'].includes(s)) return 'cancelled';
  if (['تم التسليم', 'إغلاق الطلبية'].includes(s)) return 'closed';
  if (['قيد التوصيل'].includes(s)) return 'delivery';
  if (['جاري التجهيز', 'جاري تحضير المنتجات', 'تم وصول المنتجات', 'معتمدة', 'معتمدة ومصرفة من المخزن'].includes(s)) return 'prep';
  if (['في انتظار اعتماد الإدارة'].includes(s)) return 'admin';
  if (['قيد مراجعة المشرف', 'معلقة بانتظار اعتماد الفرع', 'قيد المراجعة', 'مسودة'].includes(s)) return 'supervisor';
  // fallback
  if (['مرتجع', 'مرتجع جزئي'].includes(s)) return 'closed';
  return 'supervisor';
}

const canActApprove = (role?: string) => ['supervisor', 'branch_manager', 'admin', 'developer'].includes(role || '');
const canAdminFinal = (role?: string) => ['admin', 'developer'].includes(role || '');
const canOperate = (role?: string) => ['supervisor', 'branch_manager', 'admin', 'developer', 'warehouse_keeper'].includes(role || '');

export const OrdersPipelineView: React.FC<{
  onViewInvoice?: (inv: Invoice) => void;
  onEditInvoice?: (inv: Invoice) => void;
  onOpenNewOrder?: () => void;
}> = ({ onViewInvoice, onEditInvoice, onOpenNewOrder }) => {
  const {
    invoices,
    getVisibleInvoices,
    currentUser,
    approveOrder,
    updateOrderStatus,
    rejectOrder,
    refreshInvoicesNow,
    isOffline,
    offlineQueueCount,
    products,
  } = useApp() as any;

  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState<StageKey | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('إلغاء الطلب');
  const [deliverWarnFor, setDeliverWarnFor] = useState<string | null>(null);
  const [hydratedItemsById, setHydratedItemsById] = useState<Record<string, any[]>>({});
  const [hydratingIds, setHydratingIds] = useState<Record<string, boolean>>({});

  const base: Invoice[] = useMemo(() => {
    const list = typeof getVisibleInvoices === 'function' ? getVisibleInvoices() : (invoices || []);
    return Array.isArray(list) ? list : [];
  }, [getVisibleInvoices, invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return base
      .filter((inv) => {
        const st = getStage(inv);
        if (activeStage !== 'all' && st !== activeStage) return false;
        if (!q) return true;
        const hay = `${inv.invoiceNumber || ''} ${inv.customerName || ''} ${inv.repName || ''} ${inv.branchName || ''} ${(inv as any).customerCode || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
  }, [base, search, activeStage]);

  const counts = useMemo(() => {
    const c: Record<StageKey, number> = { supervisor: 0, admin: 0, prep: 0, delivery: 0, closed: 0, cancelled: 0 };
    base.forEach((inv) => { c[getStage(inv)]++; });
    return c;
  }, [base]);

  const openValue = useMemo(() => base.filter(i => !['closed','cancelled'].includes(getStage(i))).reduce((s,i)=>s + Number(i.estimatedGrandTotal || i.totalAmount || 0), 0), [base]);

  const ensureInvoiceItems = async (inv: Invoice): Promise<Invoice> => {
    const existing = Array.isArray((inv as any).items) && (inv as any).items.length > 0 ? (inv as any).items : hydratedItemsById[inv.id];
    if (Array.isArray(existing) && existing.length > 0) return { ...inv, items: existing } as any;
    try {
      const row: any = await fetchInvoiceRowById(inv.id);
      if (!row) return inv;
      const items = Array.isArray(row.items)
        ? row.items
        : typeof row.items === 'string'
          ? (() => { try { return JSON.parse(row.items); } catch { return []; } })()
          : [];
      const arr = Array.isArray(items) ? items : [];
      setHydratedItemsById((prev) => ({ ...prev, [inv.id]: arr }));
      return { ...inv, items: arr } as any;
    } catch {
      return inv;
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const inv = base.find((x) => x.id === expanded);
    if (!inv) return;
    const hasItems = Array.isArray((inv as any).items) && (inv as any).items.length > 0;
    const hasHydrated = Array.isArray(hydratedItemsById[inv.id]);
    if (hasItems || hasHydrated || hydratingIds[inv.id]) return;
    let cancelled = false;
    setHydratingIds((prev) => ({ ...prev, [inv.id]: true }));
    (async () => {
      try {
        await ensureInvoiceItems(inv);
      } finally {
        if (!cancelled) setHydratingIds((prev) => ({ ...prev, [inv.id]: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [expanded, base]);

  const openView = async (inv: Invoice) => {
    if (!onViewInvoice) return;
    const full = await ensureInvoiceItems(inv);
    onViewInvoice(full);
  };
  const openEdit = async (inv: Invoice) => {
    if (!onEditInvoice) return;
    const full = await ensureInvoiceItems(inv);
    onEditInvoice(full);
  };

  const say = (msg: string) => { setToast(msg); setTimeout(()=>setToast(null), 4000); };

  /**
   * تجميع نواقص أكتوبر من الأوامر المعروضة وتصديرها كملف إكسل:
   * ورقة ملخصة (المطلوب فعلياً لكل صنف مقابل رصيد المخزن الرئيسي) + تفاصيل + حسب المندوب.
   */
  const handleShortageExport = async () => {
    setBusy('shortage-report');
    try {
      const report = buildShortageReport(base, Array.isArray(products) ? products : [], {});
      if (!report.summary || report.summary.length === 0) {
        say('لا توجد نواقص مفتوحة مطلوبة من مخزن أكتوبر حالياً');
        return;
      }
      await downloadShortageReport(report, 'نواقص أكتوبر');
      say(`تم تصدير ${report.summary.length.toLocaleString('ar-EG')} صنف ناقص إلى إكسل`);
    } catch {
      say('تعذر تصدير تقرير نواقص أكتوبر');
    } finally {
      setBusy(null);
    }
  };

  const run = async (id: string, fn: () => any) => {
    setBusy(id);
    try { return await fn(); } finally { setBusy(null); }
  };

  const doApprove = (inv: Invoice) => run(inv.id, async () => {
    const res = await approveOrder?.(inv.id);
    say(res?.message || (res?.success ? 'تم الاعتماد' : 'تعذر الاعتماد'));
  });

  const doReject = (inv: Invoice, reason: string) => run(inv.id, async () => {
    if (typeof rejectOrder === 'function') {
      const res = await rejectOrder(inv.id, reason || 'مرفوض');
      say(res?.message || (res?.success ? 'تم الرفض/الإلغاء' : 'تعذر التنفيذ'));
    } else {
      const res = await updateOrderStatus?.(inv.id, 'مرفوضة / ملغاة' as OrderStatus, reason || 'مرفوض');
      say(res?.message || (res?.success ? 'تم الإلغاء' : 'تعذر التنفيذ'));
    }
  });

  const doStatus = (inv: Invoice, status: OrderStatus, okMsg: string) => run(inv.id, async () => {
    const res = await updateOrderStatus?.(inv.id, status);
    say(res?.message || (res?.success ? okMsg : 'تعذر تحديث الحالة'));
  });

  const role = currentUser?.role as string | undefined;
  const openCount = base.length - counts.closed - counts.cancelled;

  const hasPendingShortage = (inv: Invoice) => Boolean((inv.hasOctoberShortages || inv.hasShortageSplit) && !inv.octoberSupplyDispatched);
  // 1B: الإلغاء مسموح حتى ما قبل الاستلام والإغلاق (يُمنع فقط بعد إغلاق الطلبية نهائيًا)
  const canCancelInv = (inv: Invoice) => {
    const st = getStage(inv);
    if (st === 'cancelled') return false;
    if ((inv.status as string) === 'إغلاق الطلبية') return false;
    return true;
  };

  const stageBadge = (inv: Invoice) => {
    const st = getStage(inv);
    const map: Record<StageKey, string> = {
      supervisor: 'bg-amber-50 text-amber-800 border-amber-200',
      admin: 'bg-orange-50 text-orange-800 border-orange-200',
      prep: 'bg-blue-50 text-blue-800 border-blue-200',
      delivery: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200',
    };
    return <span className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border ${map[st]}`}>{STAGES.find(s=>s.key===st)?.title}</span>;
  };

  const alerts = (inv: Invoice) => {
    const tags: React.ReactNode[] = [];
    if (inv.creditLimitExceeded || inv.creditOverrideStatus === 'pending' || inv.creditOverrideRequested) {
      tags.push(<span key="cr" className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">تجاوز/استثناء ائتماني</span>);
    }
    if ((inv.hasOctoberShortages || inv.hasShortageSplit) && !(inv.octoberSupplyDispatched)) {
      tags.push(<span key="sh" className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">نواقص/توريد أكتوبر (معلّق)</span>);
    }
    if ((inv as any).syncStatus === 'pending_sync' || (inv as any).syncStatus === 'local_only') {
      tags.push(<span key="sy" className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">محفوظ محليًا</span>);
    }
    return tags;
  };

  const actionArea = (inv: Invoice) => {
    const st = getStage(inv);
    const b = (label: string, onClick: () => void, cls: string, icon?: React.ReactNode, disabled?: boolean) => (
      <button disabled={disabled || busy===inv.id} onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border transition disabled:opacity-50 ${cls}`}>{icon}{label}</button>
    );
    const cancelBtn = () => (canCancelInv(inv) && canActApprove(role))
      ? b('إلغاء الطلب', () => { setCancelFor(inv.id); setCancelReason('إلغاء الطلب'); }, 'bg-[var(--app-card)] text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-400/30 hover:bg-rose-50 dark:hover:bg-rose-500/10', <Ban size={14}/>)
      : null;

    if (st === 'cancelled') return <div className="text-xs font-bold text-slate-500">طلب منتهٍ — {inv.cancellationReason || inv.status}</div>;

    if (st === 'supervisor') {
      return <div className="flex flex-wrap gap-2">
        {canActApprove(role) && b('اعتماد المشرف', () => doApprove(inv), 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700', <BadgeCheck size={14}/>)}
        {cancelBtn()}
        {onEditInvoice && b('تعديل', () => { void openEdit(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]')}
        {onViewInvoice && b('عرض', () => { void openView(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]', <Eye size={14}/>)}
      </div>;
    }
    if (st === 'admin') {
      return <div className="flex flex-wrap gap-2">
        {canAdminFinal(role) ? b('اعتماد الإدارة', () => doApprove(inv), 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700', <ShieldCheck size={14}/>)
          : <span className="text-xs font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">بانتظار اعتماد الإدارة</span>}
        {canAdminFinal(role) && cancelBtn()}
        {onViewInvoice && b('عرض', () => { void openView(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]', <Eye size={14}/>)}
      </div>;
    }
    if (st === 'prep') {
      const toDelivery = () => {
        if (hasPendingShortage(inv)) { setDeliverWarnFor(inv.id); return; }
        doStatus(inv, 'قيد التوصيل' as OrderStatus, 'تم تحويل الطلب إلى توصيل');
      };
      return <div className="flex flex-wrap gap-2">
        {canOperate(role) && b('تجهيز الطلبية', () => doStatus(inv, 'جاري التجهيز' as OrderStatus, 'تم تحويل الطلب إلى تجهيز الطلبية'), 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700', <Package size={14}/>)}
        {canOperate(role) && b('توصيل', toDelivery, 'bg-[#102b4e] text-white border-[#102b4e] hover:bg-[#16365f]', <Truck size={14}/>)}
        {cancelBtn()}
        {onViewInvoice && b('عرض', () => { void openView(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]', <Eye size={14}/>)}
      </div>;
    }
    if (st === 'delivery') {
      return <div className="flex flex-wrap gap-2">
        {canOperate(role) && b('تم التسليم', () => doStatus(inv, 'تم التسليم' as OrderStatus, 'تم تأكيد التسليم'), 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700', <Truck size={14}/>)}
        {canOperate(role) && b('استلام وإغلاق الطلب', () => { if (window.confirm('تأكيد استلام الطلب وإغلاقه نهائيًا؟ بعد الإغلاق لا يمكن الإلغاء.')) doStatus(inv, 'إغلاق الطلبية' as OrderStatus, 'تم استلام الطلب وإغلاقه'); }, 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700', <CheckCircle2 size={14}/>)}
        {cancelBtn()}
        {onViewInvoice && b('عرض', () => { void openView(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]', <Eye size={14}/>)}
      </div>;
    }
    if (st === 'closed') {
      const finalClosed = (inv.status as string) === 'إغلاق الطلبية';
      const delivered = (inv.status as string) === 'تم التسليم';
      return <div className="flex flex-wrap gap-2 items-center">
        {!finalClosed && canOperate(role) && b('استلام وإغلاق الطلب', () => { if (window.confirm('تأكيد استلام الطلب وإغلاقه نهائيًا؟')) doStatus(inv, 'إغلاق الطلبية' as OrderStatus, 'تم إغلاق الطلب'); }, 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700', <CheckCircle2 size={14}/>)}
        {finalClosed && <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 inline-flex items-center gap-1"><CheckCircle2 size={13}/>تم الاستلام والإغلاق</span>}
        {delivered && !finalClosed && <span className="text-xs font-extrabold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">تم التسليم — بانتظار الإغلاق</span>}
        {!finalClosed && cancelBtn()}
        {onViewInvoice && b('عرض', () => { void openView(inv); }, 'bg-[var(--app-card)] text-[var(--tg-ink)] border-[var(--tg-line)] hover:bg-[var(--app-card-hover)]', <Eye size={14}/>)}
      </div>;
    }
    return null;
  };

  const flowSteps = (inv: Invoice) => {
    const st = getStage(inv);
    const order: StageKey[] = ['supervisor','admin','prep','delivery','closed'];
    const idx = st === 'cancelled' ? -1 : order.indexOf(st);
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-extrabold overflow-x-auto scrollbar-none -mx-1 px-1">
        {order.map((k, i) => {
          const active = i === idx;
          const done = idx > i || st === 'closed';
          const cls = active ? 'bg-[var(--role)] text-white border-[var(--role)]' : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/30' : 'bg-[var(--app-card-secondary)] text-[var(--tg-muted)] border-[var(--tg-line)]';
          return <React.Fragment key={k}><span className={`shrink-0 whitespace-nowrap px-2 py-1 rounded-lg border ${cls}`}>{STAGES.find(s=>s.key===k)?.title}</span>{i<order.length-1 && <span className="shrink-0 text-[var(--tg-muted)]">←</span>}</React.Fragment>;
        })}
        {st === 'cancelled' && <span className="shrink-0 whitespace-nowrap px-2 py-1 rounded-lg border bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/30">ملغى/مرفوض</span>}
      </div>
    );
  };

  return (
    <div className="w-full max-w-[1480px] mx-auto p-3 md:p-5 space-y-4" dir="rtl">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-bold">{toast}</div>}

      <section className="ds-pagehead">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="ds-crumb text-[11px] font-bold mb-1">
              الطلبات <span className="mx-1">›</span> <strong>أوامر البيع</strong>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/20">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-black text-white leading-tight">أوامر البيع والاعتمادات</h1>
                <p className="ds-pagehead__hint text-xs mt-0.5 max-w-2xl leading-relaxed">
                  المسار: مشرف ← إدارة ← تجهيز ← توصيل ← إغلاق.
                </p>
              </div>
            </div>
          </div>
          <div className={`shrink-0 inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-extrabold border rounded-full px-2.5 py-1 ${isOffline ? 'bg-red-500/20 border-red-300/40 text-red-100' : (offlineQueueCount||0)>0 ? 'bg-amber-500/20 border-amber-300/40 text-amber-100' : 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{isOffline ? 'أوفلاين' : (offlineQueueCount||0)>0 ? `${offlineQueueCount} معلّق` : 'متزامن'}</span>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)] gap-1.5 sm:gap-2 mt-3 sm:max-w-[620px]">
          <div className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5">
            <div className="text-[10px] font-bold text-[#a9c8e4] leading-tight">أوامر مفتوحة</div>
            <div className="text-[13px] sm:text-xl font-black text-white leading-tight tabular-nums">{openCount}</div>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5">
            <div className="text-[10px] font-bold text-[#a9c8e4] leading-tight">قيمة مفتوحة</div>
            <div className="text-[13px] sm:text-xl font-black text-white leading-tight tabular-nums truncate">{formatCurrency(openValue)}</div>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1.5">
            <div className="text-[10px] font-bold text-[#a9c8e4] leading-tight">بانتظار اعتمادي</div>
            <div className="text-[13px] sm:text-xl font-black text-[#f3d59a] leading-tight tabular-nums">{counts.supervisor + counts.admin}</div>
          </div>
        </div>
      </section>

      <div className="tg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 col-start-1 row-start-1 sm:shrink-0 sm:w-[320px]">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tg-muted)]"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="بحث في الأوامر" aria-label="بحث برقم الأمر أو اسم العميل أو المندوب" className="tg-input tg-input--search"/>
          </div>
          <button onClick={()=>refreshInvoicesNow?.()} title="تحديث" className="col-start-2 row-start-1 sm:order-3 shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] text-xs font-extrabold hover:bg-[var(--app-card-hover)]">
            <RefreshCw size={15}/>تحديث
          </button>
          <button
            onClick={handleShortageExport}
            disabled={busy === 'shortage-report'}
            title="تجميع نواقص أكتوبر وتصديرها إكسل"
            className="col-start-2 row-start-1 sm:order-3 shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-amber-300 dark:border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs font-extrabold hover:bg-amber-100 disabled:opacity-60"
          >
            <FileSpreadsheet size={15}/>
            {busy === 'shortage-report' ? 'جاري التصدير…' : 'نواقص أكتوبر (إكسل)'}
          </button>
          <div className="min-w-0 col-start-1 row-start-2 sm:shrink-0 sm:w-[190px] sm:order-2">
            <select value={activeStage} onChange={e=>setActiveStage(e.target.value as any)} className="tg-select">
              <option value="all">كل المراحل ({base.length})</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.title} ({counts[s.key]})</option>)}
            </select>
          </div>
          {onOpenNewOrder && <button onClick={onOpenNewOrder} className="col-start-2 row-start-2 sm:order-4 shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-[#102b4e] text-white text-xs font-extrabold hover:bg-[#16365f]"><FileText size={15}/>أمر جديد</button>}
        </div>
      </div>

      {/* stage summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-0.5 text-[10.5px] font-bold text-[var(--tg-muted)]">
          <span>سير الطلب: من الاعتماد إلى التسليم</span>
          <span className="tabular-nums">{base.length.toLocaleString('ar-EG')} أمر</span>
        </div>
        <div className="grid grid-cols-3 xl:grid-cols-6 gap-1.5 sm:gap-2">
          {STAGES.map((s, index) => {
            const on = activeStage === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveStage(on ? 'all' : s.key)}
                aria-pressed={on}
                className={`tg-stage-card text-right p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border transition ${STAGE_TONE[s.key]} ${
                  on ? 'border-current shadow-md' : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[10px] sm:text-[11px] font-extrabold leading-tight line-clamp-2 min-h-[26px] sm:min-h-[30px]">
                    {s.title}
                  </span>
                  <span className="shrink-0 w-5 h-5 rounded-md grid place-items-center text-[10px] font-black tabular-nums bg-white/70 dark:bg-white/10">
                    {index + 1}
                  </span>
                </div>
                <div className="text-lg sm:text-xl font-black leading-none mt-1 tabular-nums">
                  {counts[s.key]}
                </div>
                <div className="hidden sm:block text-[9.5px] font-bold mt-1 leading-tight opacity-75 line-clamp-2">
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* list */}
      <div className="space-y-3">
        {filtered.map(inv => {
          const st = getStage(inv);
          const isOpen = expanded === inv.id;
          const val = Number(inv.estimatedGrandTotal || inv.totalAmount || 0);
          return (
            <article key={inv.id} className="tg-card overflow-hidden">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="font-mono text-[11px] font-bold text-[var(--tg-muted)]" dir="ltr">#{inv.invoiceNumber}</span>
                    {stageBadge(inv)}
                    {alerts(inv)}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0 font-black text-[var(--tg-ink)] text-[15px] leading-tight truncate">{inv.customerName || 'عميل'}</div>
                    <div className="shrink-0 font-black text-[var(--tg-ink)] text-base leading-none tabular-nums">{formatCurrency(val)}</div>
                  </div>
                  <div className="text-[11px] text-[var(--tg-muted)] font-bold mt-1 truncate">
                    {inv.repName || '—'} · {inv.branchName || '—'} · {inv.date ? formatArabicDate(inv.date) : ''} · {(
                      Array.isArray((inv as any).items) ? (inv as any).items.length
                      : Array.isArray(hydratedItemsById[inv.id]) ? hydratedItemsById[inv.id].length
                      : '—'
                    )} صنف
                  </div>
                </div>
                <button onClick={()=>setExpanded(isOpen?null:inv.id)} aria-label={isOpen ? 'طي التفاصيل' : 'عرض التفاصيل'} className="shrink-0 p-2 rounded-xl border border-[var(--tg-line)] text-[var(--tg-ink)] hover:bg-[var(--app-card-hover)]">{isOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
              </div>

              <div>{flowSteps(inv)}</div>
              <div>{actionArea(inv)}</div>

              {/* جدول الأصناف والمنتجات — يُحمّل عند التوسيع لتقليل تحميل القوائم */}
              {isOpen ? (
                hydratingIds[inv.id] ? (
                  <div className="text-xs font-bold text-[var(--tg-muted)] px-1 py-2">جاري تحميل بنود الفاتورة...</div>
                ) : (
                  <InvoiceItemsTable invoice={{ ...inv, items: (Array.isArray((inv as any).items) && (inv as any).items.length > 0 ? (inv as any).items : (hydratedItemsById[inv.id] || [])) } as any} />
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded(inv.id)}
                  className="w-full text-xs font-black text-[var(--tg-primary)] bg-[var(--tg-primary-soft)] border border-[var(--tg-primary-line)] rounded-xl px-3 py-2 hover:opacity-90"
                >
                  عرض بنود الفاتورة
                </button>
              )}

                {cancelFor === inv.id && (
                  <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-400/30 rounded-xl p-3 space-y-2">
                    <div className="text-xs font-extrabold text-rose-800 dark:text-rose-200">تأكيد إلغاء الطلب</div>
                    <input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} className="w-full border border-rose-200 dark:border-rose-400/30 rounded-lg px-3 py-2 text-sm font-bold bg-[var(--app-card)] text-[var(--tg-ink)]" placeholder="سبب الإلغاء" />
                    <div className="flex gap-2">
                      <button disabled={busy===inv.id} onClick={()=>{ doReject(inv, cancelReason); setCancelFor(null); }} className="px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-extrabold disabled:opacity-50">تأكيد الإلغاء</button>
                      <button onClick={()=>setCancelFor(null)} className="px-3 py-2 rounded-lg border border-[var(--tg-line)] text-xs font-extrabold bg-[var(--app-card)] text-[var(--tg-ink)]">تراجع</button>
                    </div>
                  </div>
                )}
                {deliverWarnFor === inv.id && (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-400/30 rounded-xl p-3 space-y-2">
                    <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5"><AlertTriangle size={14}/>نواقص/توريد أكتوبر غير مكتمل</div>
                    <div className="text-xs font-bold text-amber-800 dark:text-amber-200/90">يوجد نواقص أو توريد من أكتوبر لم يكتمل بعد. السياسة الحالية تسمح بالتحويل إلى "توصيل" مع متابعة التوريد (تسليم جزئي/لاحق) — هل تريد المتابعة؟</div>
                    <div className="flex gap-2">
                      <button disabled={busy===inv.id} onClick={()=>{ doStatus(inv, 'قيد التوصيل' as OrderStatus, 'تم تحويل الطلب إلى توصيل مع وجود نواقص معلّقة'); setDeliverWarnFor(null); }} className="px-3 py-2 rounded-lg bg-[#102b4e] text-white text-xs font-extrabold disabled:opacity-50">متابعة إلى توصيل</button>
                      <button onClick={()=>setDeliverWarnFor(null)} className="px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-400/40 text-xs font-extrabold bg-[var(--app-card)] text-amber-900 dark:text-amber-200">تراجع</button>
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-[var(--tg-line)] pt-3 grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs font-bold text-[var(--tg-muted)]">
                    <div className="bg-[var(--app-card-secondary)] rounded-xl p-3 space-y-1">
                      <div className="font-extrabold text-[var(--tg-ink)] mb-1">تفاصيل</div>
                      <div>الحالة: <b className="text-[var(--tg-ink)]">{inv.status}</b></div>
                      <div>الدفع: <b className="text-[var(--tg-ink)]">{inv.paymentMethod || '—'}</b></div>
                      <div>ملاحظات: <b className="text-[var(--tg-ink)]">{inv.notes || '—'}</b></div>
                      {inv.cancellationReason && <div className="text-rose-700 dark:text-rose-300">سبب الإلغاء: <b>{inv.cancellationReason}</b></div>}
                    </div>
                    <div className="bg-[var(--app-card-secondary)] rounded-xl p-3 space-y-1">
                      <div className="font-extrabold text-[var(--tg-ink)] mb-1">الائتمان/النواقص</div>
                      <div>تجاوز ائتماني: <b className={inv.creditLimitExceeded?'text-rose-700 dark:text-rose-300':'text-[var(--tg-ink)]'}>{inv.creditLimitExceeded ? 'نعم' : 'لا'}</b></div>
                      <div>استثناء ائتماني: <b className="text-[var(--tg-ink)]">{inv.creditOverrideStatus || (inv.creditOverrideRequested ? 'مطلوب' : '—')}</b></div>
                      <div>نواقص/توريد أكتوبر: <b className={inv.hasOctoberShortages?'text-amber-700 dark:text-amber-300':'text-[var(--tg-ink)]'}>{inv.hasOctoberShortages ? (inv.octoberSupplyDispatched ? 'تم التوريد' : 'مطلوب/قيد التوريد') : 'لا يوجد'}</b></div>
                    </div>
                    <div className="bg-[var(--app-card-secondary)] rounded-xl p-3 space-y-1">
                      <div className="font-extrabold text-[var(--tg-ink)] mb-1">إجراءات</div>
                      <div className="flex flex-wrap gap-2">
                        {onViewInvoice && <button onClick={()=>{ void openView(inv); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] hover:bg-[var(--app-card-hover)]"><Eye size={13}/>عرض التفاصيل</button>}
                        {onEditInvoice && getStage(inv)==='supervisor' && <button onClick={()=>{ void openEdit(inv); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-ink)] hover:bg-[var(--app-card-hover)]"><ClipboardCheck size={13}/>تعديل</button>}
                        {/* تصدير PDF/إكسل مش هنا: موجود في شاشة معاينة الفاتورة اللي بتفتح من «عرض التفاصيل» — أمر واحد في مكان واحد. */}
                      </div>
                      <div className="text-[11px] text-[var(--tg-muted)] mt-1">الاعتماد والتجهيز والتسليم والإغلاق متاحة حسب الصلاحية والحالة.</div>
                    </div>
                  </div>
                )}
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center p-8 rounded-2xl border border-dashed border-[var(--tg-line)] bg-[var(--app-card)] text-[var(--tg-muted)] font-bold">لا توجد أوامر مطابقة</div>
        )}
      </div>
    </div>
  );
};

export default OrdersPipelineView;