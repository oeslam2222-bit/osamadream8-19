import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Info,
  Lock,
  MessageSquare,
  Pencil,
  Save,
  Send,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { useApp } from '../context/AppContext';
import type { CollectionForecastRecord, Customer, CustomerCommentKind, CustomerCommentRecord, ForecastMonthPlan } from '../types';
import { calculateCustomerFinancials } from '../services/customerFinancialService';
import {
  AR_MONTH_NAMES,
  COMMENT_KIND_COLORS,
  COMMENT_KIND_LABELS,
  aggregateByRep,
  buildAlerts,
  buildCustomerBadge,
  buildDefaultMonthPlan,
  buildForecastExportRows,
  buildProgress,
  buildSuggestedWeeks,
  canApproveForecasts,
  canEditMonthPlan,
  canManageForecasts,
  canSeeRepForecasts,
  canWriteOwnForecast,
  isLockedForEditing,
  commentId,
  currentMonthKey,
  daysBetween,
  emptyForecastId,
  filterForecastsForUser,
  formatMonthLabel,
  formatWeekRange,
  monthKeyOf,
  validateMonthPlan,
  weekIndexForDate,
  type ForecastProgressRow,
} from '../services/forecastService';
import { formatCurrency } from '../services/invoiceService';
import { isArabicNameMatch } from '../services/arabicMatchingService';

type Tone = 'normal' | 'cheque' | 'returned';

const TONE_ROW: Record<Tone, string> = {
  normal: 'bg-white',
  cheque: 'bg-amber-50/80',
  returned: 'bg-rose-50/80',
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-300',
  submitted: 'bg-sky-100 text-sky-800 border-sky-300',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  change_requested: 'bg-amber-100 text-amber-900 border-amber-400',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'بعت للمشرف',
  approved: 'معتمد',
  change_requested: 'مطلوب تعديل',
};

const EDITABLE_ROW = 'bg-amber-100/40';

/** آخر زيارة لكل عميل من سجل الزيارات. */
function useLastVisitMap() {
  const { visits } = useApp();
  return useMemo(() => {
    const map = new Map<string, string>();
    visits.forEach((v) => {
      const prev = map.get(v.customerId);
      if (!prev || String(v.date) > prev) map.set(v.customerId, String(v.date));
    });
    return map;
  }, [visits]);
}

/** المرتجعات مجمّعة بكود العميل — عشان الشارة الحمراء والتنبيه. */
function useReturnsByCode() {
  const { invoices } = useApp();
  return useMemo(() => {
    const map = new Map<string, { count: number; amount: number; lastDate: string }>();
    invoices.forEach((inv) => {
      (inv.returnRecords || []).forEach((r) => {
        const code = r.customerCode || inv.customerCode || '';
        if (!code) return;
        const prev = map.get(code) || { count: 0, amount: 0, lastDate: '' };
        prev.count += 1;
        prev.amount += Number(r.totalRefundAmount || 0);
        if (!prev.lastDate || String(r.date) > prev.lastDate) prev.lastDate = String(r.date);
        map.set(code, prev);
      });
    });
    return map;
  }, [invoices]);
}

export default function CollectionForecastView() {
  const {
    currentUser,
    users,
    customers,
    targets,
    forecasts,
    forecastPlans,
    customerComments,
    saveForecast,
    submitForecastWeek,
    approveForecastWeek,
    requestForecastChange,
    saveForecastPlan,
    saveCustomerComment,
    deleteCustomerComment,
  } = useApp();

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [search, setSearch] = useState('');
  const [repFilter, setRepFilter] = useState<string>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [hideIneligible, setHideIneligible] = useState(false);
  const [draft, setDraft] = useState<Record<string, { collection: string; sales: string }>>({});
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [planDraft, setPlanDraft] = useState<ForecastMonthPlan | null>(null);
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  const [commentTarget, setCommentTarget] = useState<Customer | null>(null);
  const [commentKind, setCommentKind] = useState<CustomerCommentKind>('defaulted');
  const [commentBody, setCommentBody] = useState('');
  const [changeNoteTarget, setChangeNoteTarget] = useState<{ repId: string; weekIndex: number } | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  const lastVisitMap = useLastVisitMap();
  const returnsByCode = useReturnsByCode();

  const isAdmin = canManageForecasts(currentUser);
  const canApprove = canApproveForecasts(currentUser);

  /* ---------- خطة الشهر: من Supabase، وإلا خطة مقترحة ---------- */
  const plan: ForecastMonthPlan = useMemo(() => {
    const stored = forecastPlans.find((p) => p.id === monthKey);
    if (stored) return stored;
    const parsed = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!parsed) return buildDefaultMonthPlan(new Date().getFullYear(), new Date().getMonth() + 1, currentUser?.name);
    return buildDefaultMonthPlan(Number(parsed[1]), Number(parsed[2]), currentUser?.name);
  }, [forecastPlans, monthKey, currentUser]);

  const weeks = plan.weeks;
  const weeksCount = weeks.length;
  // One source of truth for the week columns: header and body must render the
  // same weeks or the filtered table gets misaligned.
  const shownWeeks = useMemo(
    () => (weekFilter === 'ALL' ? weeks : weeks.filter((w) => String(w.index) === weekFilter)),
    [weeks, weekFilter]
  );
  const currentWeek = weekIndexForDate(plan, new Date().toISOString().slice(0, 10));

  /* ---------- التوقعات الظاهرة للمستخدم الحالي ---------- */
  const visibleForecasts = useMemo(
    () => filterForecastsForUser(forecasts.filter((f) => f.monthKey === monthKey), currentUser, users),
    [forecasts, monthKey, currentUser, users]
  );

  /* ---------- العملاء: عميل واحد لكل (مندوب، عميل) مرتبط بالصلاحية ---------- */
  const scopedCustomers = useMemo(() => {
    return customers.filter((c) => {
      const repId = (c as any).repId || '';
      const repName = c.salesRepName || c.repName || '';
      if (!repName) return false;
      return canSeeRepForecasts(currentUser, users, c.branchName || '', repId, repName);
    });
  }, [customers, currentUser, users]);

  const repOf = useCallback(
    (c: Customer) => (c as any).repId || (() => {
      const u = users.find((x) => isArabicNameMatch(x.name, c.salesRepName || c.repName || ''));
      return u?.id || '';
    })(),
    [users]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedCustomers
      .map((c) => {
        const repId = repOf(c);
        const repName = c.salesRepName || c.repName || 'غير محدد';
        const fin = calculateCustomerFinancials(c, 'ALL');
        const mine = visibleForecasts.filter((f) => f.customerId === c.id);
        const ret = returnsByCode.get(c.code || '');
        const badge = buildCustomerBadge(c, !!ret?.count, lastVisitMap.get(c.id));
        const weekCollection: Record<number, number> = {};
        mine.forEach((f) => {
          weekCollection[f.weekIndex] = (weekCollection[f.weekIndex] || 0) + (Number(f.collectionForecast) || 0);
        });
        const weekSales: Record<number, number> = {};
        mine.forEach((f) => {
          weekSales[f.weekIndex] = (weekSales[f.weekIndex] || 0) + (Number(f.salesForecast) || 0);
        });
        const record = (w: number) => mine.find((f) => f.weekIndex === w);
        return {
          customer: c,
          repId,
          repName,
          badge,
          balance: fin.balance,
          dues: fin.overdue,
          creditLimit: fin.creditLimit,
          isOverLimit: fin.isOverLimit,
          monthCollection: mine.reduce((s, f) => s + (Number(f.collectionForecast) || 0), 0),
          monthSales: mine.reduce((s, f) => s + (Number(f.salesForecast) || 0), 0),
          weekCollection,
          weekSales,
          record,
          lastVisit: badge.lastVisitDate,
          comment: customerComments.find((cm) => cm.customerCode === (c.code || '')) || null,
        };
      })
      .filter((r) => {
        if (repFilter !== 'ALL' && r.repId !== repFilter && !isArabicNameMatch(r.repName, repFilter)) return false;
        if (hideIneligible && !r.badge.isDealt) return false;
        if (!q) return true;
        return (
          (r.customer.name || '').toLowerCase().includes(q) ||
          (r.customer.code || '').toLowerCase().includes(q) ||
          r.repName.toLowerCase().includes(q) ||
          (r.customer.branchName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.monthCollection - a.monthCollection || a.customer.name.localeCompare(b.customer.name, 'ar'));
  }, [
    scopedCustomers, visibleForecasts, search, repFilter, weekFilter, hideIneligible,
    returnsByCode, lastVisitMap, customerComments, repOf,
  ]);

  /* ---------- تجميع ---------- */
  const repRows = useMemo(() => aggregateByRep(visibleForecasts, weeksCount), [visibleForecasts, weeksCount]);
  const progress: ForecastProgressRow[] = useMemo(
    () => buildProgress(visibleForecasts, targets.filter((t) => monthKeyOf(t.year, t.month) === monthKey), weeksCount),
    [visibleForecasts, targets, monthKey, weeksCount]
  );

  const totals = useMemo(() => {
    const forecastCollection = rows.reduce((s, r) => s + r.monthCollection, 0);
    const forecastSales = rows.reduce((s, r) => s + r.monthSales, 0);
    const targetCollection = progress.reduce((s, p) => s + p.targetCollection, 0);
    const targetSales = progress.reduce((s, p) => s + p.targetSales, 0);
    const actualCollection = progress.reduce((s, p) => s + p.actualCollection, 0);
    const balance = rows.reduce((s, r) => s + r.balance, 0);
    const dues = rows.reduce((s, r) => s + r.dues, 0);
    return {
      forecastCollection,
      forecastSales,
      targetCollection,
      targetSales,
      actualCollection,
      balance,
      dues,
      coverage: targetCollection > 0 ? Math.round((forecastCollection / targetCollection) * 100) : 0,
      salesCoverage: targetSales > 0 ? Math.round((forecastSales / targetSales) * 100) : 0,
    };
  }, [rows, progress]);

  const alerts = useMemo(
    () =>
      buildAlerts({
        plan,
        forecasts: visibleForecasts,
        progress,
        comments: customerComments,
        customers: scopedCustomers,
        returnsByCustomerCode: returnsByCode,
      }),
    [plan, visibleForecasts, progress, customerComments, scopedCustomers, returnsByCode]
  );

  const visibleAlerts = useMemo(() => {
    if (!currentUser) return [];
    if (isAdmin) return alerts;
    return alerts.filter((a) => canSeeRepForecasts(currentUser, users, a.branchName, a.repId, repRows.find((r) => r.repId === a.repId)?.repName || ''));
  }, [alerts, currentUser, isAdmin, users, repRows]);

  const repOptions = useMemo(() => {
    const seen = new Map<string, string>();
    scopedCustomers.forEach((c) => {
      const id = repOf(c);
      const name = c.salesRepName || c.repName || '';
      if (id && name) seen.set(id, name);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [scopedCustomers, repOf]);

  /* ---------- كتابة رقم (مسودة) ---------- */
  const draftValue = (id: string, key: 'collection' | 'sales', fallback: number) =>
    draft[id]?.[key] ?? (fallback ? String(fallback) : '');

  // The row as the permission check must see it: the saved record, or a blank
  // draft-shaped one when the rep has not typed anything yet.
  const recordFor = useCallback(
    (customer: Customer, week: number): CollectionForecastRecord => {
      const id = emptyForecastId(monthKey, week, customer.id);
      const existing = forecasts.find((f) => f.id === id);
      if (existing) return existing;
      return {
        id,
        monthKey,
        weekIndex: week,
        repId: repOf(customer),
        repName: customer.salesRepName || customer.repName || '',
        branchName: customer.branchName || '',
        customerId: customer.id,
        customerCode: customer.code || '',
        customerName: customer.name || '',
        collectionForecast: 0,
        salesForecast: 0,
        status: 'draft',
      };
    },
    [monthKey, forecasts, repOf]
  );

  const commitCell = useCallback(
    async (customer: Customer, week: number, key: 'collection' | 'sales', raw: string) => {
      const existing = forecasts.find((f) => f.id === emptyForecastId(monthKey, week, customer.id));
      const base = recordFor(customer, week);
      const value = raw === '' ? 0 : Math.max(0, Number(raw) || 0);

      if (isLockedForEditing(base, currentUser)) {
        setSavedFlash('الرقم معتمد ومقفول — لازم طلب تعديل من المشرف');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }
      if (!canWriteOwnForecast(currentUser, base, users)) {
        setSavedFlash('مينفعش تعدّل في أرقام مندوب تاني');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }

      // Editing an approved week by an approver keeps it approved.
      const nextStatus = existing && existing.status === 'approved' && canApprove ? 'approved' : base.status;
      await saveForecast({
        ...base,
        [key === 'collection' ? 'collectionForecast' : 'salesForecast']: value,
        status: nextStatus,
        changeRequestNote: undefined,
      });
      setDraft((d) => {
        const next = { ...d };
        delete next[base.id];
        return next;
      });
    },
    [monthKey, forecasts, repOf, saveForecast, canApprove, recordFor, currentUser, users]
  );

  /* ---------- أسبوع: مندوب واحد ---------- */
  const weekStatus = useCallback(
    (repId: string, week: number) => {
      const lines = visibleForecasts.filter((f) => f.repId === repId && f.weekIndex === week);
      if (!lines.length) return 'draft';
      if (lines.some((l) => l.status === 'change_requested')) return 'change_requested';
      if (lines.some((l) => l.status === 'draft')) return 'draft';
      if (lines.some((l) => l.status === 'submitted')) return 'submitted';
      return 'approved';
    },
    [visibleForecasts]
  );

  const repIdForFilter = repFilter === 'ALL' ? null : repFilter;
  const isMine = currentUser?.role === 'sales_rep';
  const myRepId = useMemo(() => {
    if (!isMine || !currentUser) return '';
    const match = repOptions.find(([, name]) => isArabicNameMatch(name, currentUser.name || ''));
    return match ? match[0] : currentUser.id;
  }, [isMine, currentUser, repOptions]);

  const submitWeek = async (repId: string, week: number) => {
    const n = await submitForecastWeek(monthKey, week, repId);
    setSavedFlash(n ? `تم إرسال توقع الأسبوع ${week} للمشرف (${n} عميل)` : 'مفيش أرقام مبعوتة');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  const approveWeek = async (repId: string, week: number) => {
    const n = await approveForecastWeek(monthKey, week, repId);
    setSavedFlash(n ? `تم اعتماد وتثبيت الأسبوع ${week} (${n} عميل)` : 'مفيش أرقام في الأسبوع ده');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  const askChange = async () => {
    if (!changeNoteTarget) return;
    await requestForecastChange(monthKey, changeNoteTarget.weekIndex, changeNoteTarget.repId, changeNote.trim());
    setChangeNoteTarget(null);
    setChangeNote('');
    setSavedFlash('تم إرسال طلب التعديل للمندوب');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  /* ---------- خطة الشهر ---------- */
  const openPlanEditor = () => {
    setPlanDraft({ ...plan, weeks: plan.weeks.map((w) => ({ ...w })) });
    setPlanErrors([]);
    setShowPlanEditor(true);
  };

  const addWeek = () => {
    if (!planDraft) return;
    setPlanDraft({
      ...planDraft,
      weeks: [
        ...planDraft.weeks,
        { index: planDraft.weeks.length + 1, start: planDraft.monthEnd, end: planDraft.monthEnd },
      ],
    });
  };

  const removeWeek = (index: number) => {
    if (!planDraft || planDraft.weeks.length <= 1) return;
    setPlanDraft({
      ...planDraft,
      weeks: planDraft.weeks.filter((_, i) => i !== index).map((w, i) => ({ ...w, index: i + 1 })),
    });
  };

  const applySuggested = () => {
    if (!planDraft) return;
    setPlanDraft({ ...planDraft, weeks: buildSuggestedWeeks(planDraft.year, planDraft.month) });
    setPlanErrors([]);
  };

  const shiftMonth = (delta: number) => {
    const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!m) return;
    const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
    setMonthKey(monthKeyOf(d.getFullYear(), d.getMonth() + 1));
    setRepFilter('ALL');
  };

  const savePlan = async () => {
    if (!planDraft) return;
    const check = validateMonthPlan(planDraft);
    if (!check.valid) {
      setPlanErrors(check.errors);
      return;
    }
    setPlanErrors([]);
    await saveForecastPlan(planDraft);
    setShowPlanEditor(false);
    setSavedFlash('تم حفظ تقسيم الأسابيع — كل الأدوار هتشوفه');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  /* ---------- الكومنت ---------- */
  const openComment = (c: Customer) => {
    setCommentTarget(c);
    const existing = customerComments.find((cm) => cm.customerCode === (c.code || ''));
    setCommentKind(existing?.kind || 'defaulted');
    setCommentBody(existing?.body || '');
  };

  const submitComment = async () => {
    if (!commentTarget || !commentBody.trim()) return;
    await saveCustomerComment({
      id: commentId(commentTarget.code || commentTarget.id),
      customerId: commentTarget.id,
      customerCode: commentTarget.code || '',
      customerName: commentTarget.name || '',
      branchName: commentTarget.branchName || '',
      repName: commentTarget.salesRepName || commentTarget.repName || '',
      kind: commentKind,
      body: commentBody.trim(),
      authorName: currentUser?.name || '',
      createdAt: new Date().toISOString(),
    });
    setCommentTarget(null);
    setCommentBody('');
    setSavedFlash('تم حفظ الكومنت على كود العميل');
    setTimeout(() => setSavedFlash(''), 4000);
  };

  /* ---------- التصدير ---------- */
  const handleExport = () => {
    const data = buildForecastExportRows({
      forecasts: visibleForecasts,
      comments: customerComments,
      customers: scopedCustomers,
      returnsByCustomerCode: returnsByCode,
      lastVisitByCustomerId: lastVisitMap,
    });
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'توقع التحصيلات');
    XLSX.writeFile(wb, `توقع_التحصيلات_${monthKey}.xlsx`);
  };

  // Every hook must run before the `!currentUser` guard below, otherwise the first
  // render (no user yet) calls fewer hooks than later renders and React throws.
  const monthOptions = useMemo(() => {
    const now = new Date();
    const out: string[] = [];
    for (let i = -1; i <= 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(monthKeyOf(d.getFullYear(), d.getMonth() + 1));
    }
    return out;
  }, []);

  if (!currentUser) return null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ================= Header ================= */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-4 shadow-lg border border-emerald-500/25">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              توقع التحصيلات
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5">
              الصفحة دي بتقول هل أرقام التارجت هتحقق ولا لأ — التوقع مقابل الهدف، والأسبوع، والعميل
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900/70 border border-slate-700 rounded-xl p-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="px-2 py-1.5 rounded-lg text-emerald-300 hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="px-3 py-1.5 bg-transparent text-white text-xs font-black"
              >
                {monthOptions.map((k) => (
                  <option key={k} value={k} className="text-slate-900">
                    {formatMonthLabel(k)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="px-2 py-1.5 rounded-lg text-emerald-300 hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={openPlanEditor}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" />
                تقسيم الأسابيع
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير التقرير
            </button>
          </div>
        </div>

        {/* week strip */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {weeks.map((w) => {
            const isCurrent = currentWeek === w.index;
            const isPast = new Date(w.end).getTime() < Date.now();
            return (
              <span
                key={w.index}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border ${
                  isCurrent
                    ? 'bg-emerald-500 text-white border-emerald-300'
                    : isPast
                    ? 'bg-slate-800 text-slate-400 border-slate-700'
                    : 'bg-slate-800 text-slate-200 border-slate-600'
                }`}
              >
                أسبوع {w.index}: {formatWeekRange(w)}
                {isCurrent && <span className="mr-1">● الآن</span>}
              </span>
            );
          })}
          <span className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-slate-800 text-slate-300 border border-slate-600">
            {weeksCount} أسابيع
          </span>
        </div>
      </div>

      {savedFlash && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4" />
          {savedFlash}
        </div>
      )}

      {/* ================= KPI ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Wallet className="w-4 h-4 text-emerald-600" />}
          label="المتوقع تحصيله الشهر ده"
          value={formatCurrency(totals.forecastCollection)}
          sub={
            totals.targetCollection > 0
              ? `هدف التارجت ${formatCurrency(totals.targetCollection)} (${totals.coverage}%)`
              : 'مفيش هدف متسجل في التارجت لهذا الشهر'
          }
          tone={totals.coverage >= 100 ? 'good' : totals.coverage >= 80 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={<Target className="w-4 h-4 text-sky-600" />}
          label="المحقق فعلياً (من التارجت)"
          value={formatCurrency(totals.actualCollection)}
          sub={`الفرق بين المتوقع والمحقق: ${formatCurrency(totals.forecastCollection - totals.actualCollection)}`}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-violet-600" />}
          label="المتوقع بيعه الشهر ده"
          value={formatCurrency(totals.forecastSales)}
          sub={totals.targetSales > 0 ? `هدف البيع ${formatCurrency(totals.targetSales)} (${totals.salesCoverage}%)` : 'مفيش هدف بيع مسجل'}
          tone={totals.salesCoverage >= 100 ? 'good' : totals.salesCoverage >= 80 ? 'warn' : 'bad'}
        />
        <KpiCard
          icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
          label="تنبيهات المتابعة"
          value={visibleAlerts.length.toLocaleString()}
          sub={`${visibleAlerts.filter((a) => a.severity === 'high').length} عاجل · ${visibleAlerts.filter((a) => a.severity === 'medium').length} متوسط`}
          tone={visibleAlerts.some((a) => a.severity === 'high') ? 'bad' : 'warn'}
        />
      </div>

      {/* ================= التنبيهات ================= */}
      {visibleAlerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-black text-rose-900">تنبيهات تحتاج متابعة ({visibleAlerts.length})</span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
            {visibleAlerts.slice(0, 40).map((a) => (
              <div key={a.id} className="px-4 py-2 flex items-start gap-2.5 text-xs">
                <span
                  className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    a.severity === 'high' ? 'bg-rose-500' : a.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-black text-slate-800">{a.title}</div>
                  <div className="text-slate-500">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= المشرف: اعتماد الأسابيع ================= */}
      {canApprove && repRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between">
            <span className="text-xs font-black flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              اعتماد التوقعات الأسبوعية
            </span>
            <span className="text-[10px] text-slate-400">بعد الاعتماد الرقم يتقفل والمندوب يطلب تعديل</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px] border-collapse">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2">المندوب</th>
                  <th className="p-2">الفرع</th>
                  {weeks.map((w) => (
                    <th key={w.index} className="p-2 text-center whitespace-nowrap">
                      أسبوع {w.index}
                      <span className="block text-[9px] font-normal text-slate-500">{formatWeekRange(w)}</span>
                    </th>
                  ))}
                  <th className="p-2 text-center">إجمالي الشهر</th>
                  <th className="p-2 text-center">مقابل الهدف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {repRows.map((rep) => {
                  const pr = progress.find((p) => p.repId === rep.repId);
                  return (
                    <tr key={rep.repId} className="hover:bg-slate-50">
                      <td className="p-2 font-black text-slate-800 whitespace-nowrap">{rep.repName}</td>
                      <td className="p-2 text-slate-500 whitespace-nowrap">{rep.branchName || '—'}</td>
                      {weeks.map((w) => {
                        const st = weekStatus(rep.repId, w.index);
                        const amount = rep.weekCollection[w.index] || 0;
                        const canAct = st === 'submitted' || (st === 'change_requested' && canApprove);
                        return (
                          <td key={w.index} className="p-1.5 text-center">
                            <div className="font-mono font-black text-slate-700">{Math.round(amount).toLocaleString()}</div>
                            <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black border ${STATUS_STYLE[st]}`}>
                              {STATUS_LABEL[st]}
                            </span>
                            {canAct && (
                              <div className="mt-1 flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => approveWeek(rep.repId, w.index)}
                                  title="اعتماد وتثبيت"
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-black cursor-pointer"
                                >
                                  اعتماد
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setChangeNoteTarget({ repId: rep.repId, weekIndex: w.index })}
                                  title="طلب تعديل"
                                  className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[9px] font-black cursor-pointer"
                                >
                                  تعديل
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-mono font-black text-emerald-800">
                        {Math.round(rep.totalCollection).toLocaleString()}
                      </td>
                      <td className="p-2 text-center">
                        {pr ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                              pr.status === 'ahead'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : pr.status === 'on_track'
                                ? 'bg-sky-100 text-sky-800 border-sky-300'
                                : pr.status === 'behind'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : 'bg-slate-100 text-slate-500 border-slate-300'
                            }`}
                          >
                            {pr.targetCollection > 0 ? `${pr.collectionCoverage}%` : 'بدون هدف'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= الفلاتر ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم العميل أو الكود أو المندوب…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
        />
        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
        >
          <option value="ALL">كل المناديب ({repOptions.length})</option>
          {repOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
        >
          <option value="ALL">كل الأسابيع</option>
          {weeks.map((w) => (
<option key={w.index} value={String(w.index)}>
            أسبوع {w.index} ({formatWeekRange(w)})
          </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={hideIneligible} onChange={(e) => setHideIneligible(e.target.checked)} />
          المتعاملين فقط
        </label>
        <span className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-black">{rows.length} عميل</span>
      </div>

      {/* ================= جدول العملاء ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-500" />
            العملاء والمتوقع عليهم — {formatMonthLabel(monthKey)}
          </span>
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> شيكات
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" /> عنده مرتجع
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px] border-collapse">
            <thead className="bg-slate-900 text-slate-100">
              <tr>
                <th className="p-2">الكود</th>
                <th className="p-2">العميل</th>
                <th className="p-2">المندوب</th>
                <th className="p-2 text-center">طريقة الدفع</th>
                <th className="p-2 text-center">التصنيف</th>
                <th className="p-2 text-left">المديونية</th>
                <th className="p-2 text-left">المستحقات</th>
                <th className="p-2 text-left">الحد الائتماني</th>
                {shownWeeks.map((w) => (
                  <th key={w.index} className="p-2 text-center whitespace-nowrap">
                    متوقع أ{w.index}
                    <span className="block text-[9px] font-normal text-slate-400">{formatWeekRange(w)}</span>
                  </th>
                ))}
                <th className="p-2 text-left">متوقع الشهر</th>
                <th className="p-2">آخر زيارة</th>
                <th className="p-2">الكومنت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const weeksToShow = shownWeeks;
                return (
                  <tr key={r.customer.id} className={`${TONE_ROW[r.badge.tone]} hover:brightness-[0.99]`}>
                    <td className="p-2 font-mono text-slate-600 whitespace-nowrap">{r.customer.code || '—'}</td>
                    <td className="p-2 font-black text-slate-800 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {r.badge.hasReturn && <Ban className="w-3 h-3 text-rose-600" />}
                        {r.badge.isCheque && !r.badge.hasReturn && <ShieldCheck className="w-3 h-3 text-amber-600" />}
                        {r.customer.name}
                      </span>
                    </td>
                    <td className="p-2 text-slate-500 whitespace-nowrap">{r.repName}</td>
                    <td className="p-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                          r.badge.isCheque ? 'bg-amber-100 text-amber-900 border-amber-400' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {r.badge.paymentLabel}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                        {r.badge.eligibilityLabel}
                      </span>
                    </td>
                    <td className="p-2 text-left font-mono font-black text-rose-700">{Math.round(r.balance).toLocaleString()}</td>
                    <td className="p-2 text-left font-mono font-black text-rose-600">{Math.round(r.dues).toLocaleString()}</td>
                    <td className={`p-2 text-left font-mono ${r.isOverLimit ? 'font-black text-rose-700' : 'text-slate-500'}`}>
                      {Math.round(r.creditLimit).toLocaleString()}
                    </td>

                    {weeksToShow.map((w) => {
                      const rec = r.record(w.index);
                      // Same helpers the save path uses, so a cell can never look
                      // editable while the write would be refused (or vice versa).
                      const cell = recordFor(r.customer, w.index);
                      const editable = canWriteOwnForecast(currentUser, cell, users);
                      const locked = isLockedForEditing(cell, currentUser);
                      const active = rec && (rec.collectionForecast > 0 || rec.salesForecast > 0);
                      return (
                        <td key={w.index} className={`p-1 text-center ${active ? EDITABLE_ROW : ''}`}>
                          <input
                            type="number"
                            min={0}
                            disabled={!editable || locked}
                            value={draftValue(
                              rec ? rec.id : emptyForecastId(monthKey, w.index, r.customer.id),
                              'collection',
                              rec ? rec.collectionForecast : 0
                            )}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                [rec ? rec.id : emptyForecastId(monthKey, w.index, r.customer.id)]: {
                                  ...d[rec ? rec.id : emptyForecastId(monthKey, w.index, r.customer.id)],
                                  collection: e.target.value,
                                },
                              }))
                            }
                            onBlur={(e) => commitCell(r.customer, w.index, 'collection', e.target.value)}
                            title={locked ? 'معتمد ومقفول — اطلب تعديل من المشرف' : `متوقع تحصيل ${r.customer.name} أسبوع ${w.index}`}
                            className={`w-20 px-1 py-1 rounded text-center font-mono font-black text-[11px] border ${
                              locked
                                ? 'bg-slate-100 text-slate-500 border-slate-300 cursor-not-allowed'
                                : 'bg-white text-slate-800 border-slate-300 focus:border-emerald-500 focus:outline-none'
                            }`}
                            placeholder="0"
                          />
                          {locked && <Lock className="w-2.5 h-2.5 inline text-slate-400 mr-0.5" />}
                        </td>
                      );
                    })}

                    <td className="p-2 text-left font-mono font-black text-emerald-700">
                      {Math.round(r.monthCollection).toLocaleString()}
                    </td>
                    <td className="p-2 text-slate-500 whitespace-nowrap">{r.lastVisit || '—'}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => openComment(r.customer)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-black border cursor-pointer ${
                          r.comment ? COMMENT_KIND_COLORS[r.comment.kind] : 'bg-slate-50 text-slate-500 border-slate-300'
                        }`}
                        title={r.comment?.body || 'إضافة كومنت'}
                      >
                        {r.comment ? (
                          <span className="flex items-center gap-1 max-w-[160px]">
                            <MessageSquare className="w-3 h-3 shrink-0" />
                            <span className="truncate">{r.comment.body}</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Pencil className="w-3 h-3" /> كومنت
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11 + weeks.length} className="p-8 text-center text-xs text-slate-400">
                    مفيش عملاء مطابقين للفلاتر
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-black">
              <tr>
                <td className="p-2" colSpan={5}>
                  الإجمالي
                </td>
                <td className="p-2 text-left font-mono text-rose-700">{Math.round(totals.balance).toLocaleString()}</td>
                <td className="p-2 text-left font-mono text-rose-600">{Math.round(totals.dues).toLocaleString()}</td>
                <td className="p-2" />
                {weeks.map((w) => (
                  <td key={w.index} className="p-2 text-center font-mono text-emerald-800">
                    {Math.round(rows.reduce((s, r) => s + (r.weekCollection[w.index] || 0), 0)).toLocaleString()}
                  </td>
                ))}
                <td className="p-2 text-left font-mono text-emerald-800">{Math.round(totals.forecastCollection).toLocaleString()}</td>
                <td className="p-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ================= داش مبسط ================= */}
      <SimpleSummary customers={scopedCustomers} returnsByCode={returnsByCode} />

      {/* ================= زر الإرسال للمندوب ================= */}
      {isMine && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-3 flex flex-wrap items-center gap-2">
          <Send className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-black text-slate-800">إرسال توقع الأسبوع للمشرف</span>
          {weeks.map((w) => (
            <button
              key={w.index}
              type="button"
              onClick={() => submitWeek(myRepId, w.index)}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black cursor-pointer"
            >
              أسبوع {w.index} ({formatWeekRange(w)})
            </button>
          ))}
        </div>
      )}

      {/* ================= مودال تقسيم الأسابيع ================= */}
      {showPlanEditor && planDraft && (
        <Modal title="تقسيم الشهر على الأسابيع (الإدارة)" onClose={() => setShowPlanEditor(false)}>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-violet-900">
              <div className="font-black mb-1">راجع التواريخ — الأيام لازم تكون متجاورة ومفيشOverlap</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applySuggested}
                  className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[11px] font-black cursor-pointer"
                >
                  رجّع التقسيم المقترح (7 أيام لكل أسبوع)
                </button>
                <button
                  type="button"
                  onClick={addWeek}
                  className="px-2.5 py-1 rounded-lg bg-slate-700 text-white text-[11px] font-black cursor-pointer"
                >
                  + ضيف أسبوع
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px] border-collapse">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="p-2">الأسبوع</th>
                    <th className="p-2">من</th>
                    <th className="p-2">إلى</th>
                    <th className="p-2">عدد الأيام</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {planDraft.weeks.map((w, i) => (
                    <tr key={i}>
                      <td className="p-2 font-black">{w.index}</td>
                      <td className="p-1.5">
                        <input
                          type="date"
                          value={w.start}
                          onChange={(e) => {
                            const weeks = planDraft.weeks.map((x, xi) => (xi === i ? { ...x, start: e.target.value } : x));
                            setPlanDraft({ ...planDraft, weeks });
                          }}
                          className="px-2 py-1 rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="date"
                          value={w.end}
                          onChange={(e) => {
                            const weeks = planDraft.weeks.map((x, xi) => (xi === i ? { ...x, end: e.target.value } : x));
                            setPlanDraft({ ...planDraft, weeks });
                          }}
                          className="px-2 py-1 rounded border border-slate-300"
                        />
                      </td>
                      <td className="p-2 text-center font-mono">
                        {(() => {
                          const d = daysBetween(w.start, w.end) + 1;
                          return <span className={d < 0 ? 'text-rose-600 font-black' : ''}>{d}</span>;
                        })()}
                      </td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => removeWeek(i)}
                          className="px-1.5 py-1 rounded bg-rose-500 text-white text-[10px] font-black cursor-pointer"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {planErrors.length > 0 && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800">
                {planErrors.map((e, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {e}
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={planDraft.isClosed}
                onChange={(e) => setPlanDraft({ ...planDraft, isClosed: e.target.checked })}
              />
              <span className="font-bold">اقفل الشهر — مفيش تعديل بعد كده لأي حد</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowPlanEditor(false)}
                className="px-3 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-black cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={savePlan}
                className="px-3 py-2 rounded-xl bg-violet-600 text-white text-xs font-black cursor-pointer flex items-center gap-1"
              >
                <Save className="w-4 h-4" /> حفظ التقسيم
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= مودال الكومنت ================= */}
      {commentTarget && (
        <Modal
          title={`كومنت على ${commentTarget.name} (${commentTarget.code || 'بدون كود'})`}
          onClose={() => setCommentTarget(null)}
        >
          <div className="space-y-2.5 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(COMMENT_KIND_LABELS) as CustomerCommentKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCommentKind(k)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border cursor-pointer ${
                    commentKind === k ? COMMENT_KIND_COLORS[k] : 'bg-white text-slate-500 border-slate-300'
                  }`}
                >
                  {COMMENT_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              rows={4}
              placeholder="اكتب سبب التعثر أو المرتجع أو أي ملاحظة على العميل…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-emerald-500"
            />
            {customerComments.find((c) => c.customerCode === (commentTarget.code || '')) && (
              <button
                type="button"
                onClick={async () => {
                  await deleteCustomerComment(commentId(commentTarget.code || commentTarget.id));
                  setCommentTarget(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-300 text-[11px] font-black cursor-pointer"
              >
                امسح الكومنت
              </button>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCommentTarget(null)}
                className="px-3 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-black cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={submitComment}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= مودال طلب التعديل ================= */}
      {changeNoteTarget && (
        <Modal title="طلب تعديل من المندوب" onClose={() => setChangeNoteTarget(null)}>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-start gap-1.5 text-amber-800">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>التوقع هيتقفل والمندوب يقدر يعدّله بعد ما يعدّل الأرقام ويحاول يبعتّه تاني.</span>
            </div>
            <textarea
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              rows={3}
              placeholder="اكتب المطلوب تعديله…"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChangeNoteTarget(null)}
                className="px-3 py-2 rounded-xl bg-slate-200 text-slate-800 text-xs font-black cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={askChange}
                className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer"
              >
                إرسال الطلب
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- components ---------------- */

function KpiCard({
  icon, label, value, sub, tone = 'plain',
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'plain' | 'good' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'border-emerald-300 bg-emerald-50/60'
    : tone === 'warn' ? 'border-amber-300 bg-amber-50/60'
    : tone === 'bad' ? 'border-rose-300 bg-rose-50/60'
    : 'border-slate-200';
  return (
    <div className={`bg-white rounded-2xl border p-3 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between gap-1">
        <span>{label}</span>
        {icon}
      </div>
      <div className="text-lg font-black text-slate-900 mt-1 font-mono">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{sub}</div>}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-black">{title}</span>
          <button type="button" onClick={onClose} className="text-slate-300 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

/** داش بسيط: آخر شهر تحصيل فيه + المديونية والمستحقات والحد الائتماني + طريقة الدفع. */
function SimpleSummary({ customers, returnsByCode }: { customers: Customer[]; returnsByCode: Map<string, { count: number; amount: number; lastDate: string }> }) {
  const rows = useMemo(() => {
    return customers.map((c) => {
      const fin = calculateCustomerFinancials(c, 'ALL');
      const m = c.monthlyCollections2026 || {};
      const lastMonthWithCollection = Object.entries(m)
        .filter(([, v]) => Math.abs(Number(v) || 0) > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => b - a)[0];
      const ret = returnsByCode.get(c.code || '');
      return {
        code: c.code || '—',
        name: c.name,
        lastMonth: lastMonthWithCollection
          ? `${AR_MONTH_NAMES[lastMonthWithCollection - 1]} 2026`
          : 'مفيش تحصيل',
        balance: fin.balance,
        dues: fin.overdue,
        creditLimit: fin.creditLimit,
        payment: (c.guaranteeAmount || 0) > 0 || /شيك|كمبيال/.test(c.guaranteeDocs || '') ? 'شيكات' : 'نقدي',
        hasReturn: !!ret?.count,
        isCheque:
          (c.guaranteeAmount || 0) > 0 || /شيك|كمبيال/.test(c.guaranteeDocs || ''),
      };
    });
  }, [customers, returnsByCode]);

  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-pointer"
      >
        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
          <ArrowDownToLine className="w-4 h-4 text-slate-500" />
          ملخص سريع — آخر شهر تحصيل فيه، المديونية، المستحقات، الحد الائتماني، طريقة الدفع
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-right text-[11px] border-collapse">
            <thead className="bg-slate-100 text-slate-700 sticky top-0">
              <tr>
                <th className="p-2">الكود</th>
                <th className="p-2">العميل</th>
                <th className="p-2">آخر شهر تحصيل فيه</th>
                <th className="p-2 text-left">المديونية</th>
                <th className="p-2 text-left">إجمالي المستحقات</th>
                <th className="p-2 text-left">الحد الائتماني</th>
                <th className="p-2 text-center">طريقة الدفع</th>
                <th className="p-2 text-center">مرتجع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.code} className={r.hasReturn ? 'bg-rose-50/70' : r.isCheque ? 'bg-amber-50/70' : ''}>
                  <td className="p-2 font-mono text-slate-600">{r.code}</td>
                  <td className="p-2 font-black text-slate-800">{r.name}</td>
                  <td className="p-2 text-slate-600">{r.lastMonth}</td>
                  <td className="p-2 text-left font-mono text-rose-700">{Math.round(r.balance).toLocaleString()}</td>
                  <td className="p-2 text-left font-mono text-rose-600">{Math.round(r.dues).toLocaleString()}</td>
                  <td className="p-2 text-left font-mono text-slate-600">{Math.round(r.creditLimit).toLocaleString()}</td>
                  <td className="p-2 text-center">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black border ${
                        r.isCheque ? 'bg-amber-100 text-amber-900 border-amber-400' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      {r.payment}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    {r.hasReturn ? <Ban className="w-3.5 h-3.5 text-rose-600 inline" /> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}