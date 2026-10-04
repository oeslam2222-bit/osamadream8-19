import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Ban,
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  Lock,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Phone,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { useApp } from '../context/AppContext';
import type {
  CollectionForecastRecord,
  Customer,
  CustomerCommentKind,
  CustomerCommentRecord,
  CustomerVisit,
  ForecastMonthPlan,
} from '../types';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from '../services/customerDues';
import { calculateCustomerFinancials } from '../services/customerFinancialService';
import {
  AR_MONTH_NAMES,
  COMMENT_KIND_COLORS,
  buildAlerts,
  buildDefaultMonthPlan,
  buildForecastExportRows,
  buildProgress,
  buildSuggestedWeeks,
  canApproveForecasts,
  canManageForecasts,
  canSeeRepForecasts,
  canWriteOwnForecast,
  isLockedForEditing,
  commentId,
  currentMonthKey,
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

const MONTH_NAMES_AR_12 = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export default function CollectionForecastView() {
  const {
    currentUser,
    users,
    customers,
    targets,
    forecasts,
    forecastPlans,
    customerComments,
    visits,
    invoices,
    saveForecast,
    submitForecastWeek,
    approveForecastWeek,
    requestForecastChange,
    saveForecastPlan,
    saveCustomerComment,
    toggleArchiveVisit,
  } = useApp();

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [repFilter, setRepFilter] = useState<string>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  // Draft inputs state for week forecasts
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState('');

  // Selected customer for full dossier details modal
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<Customer | null>(null);

  // Month plan & supervisor approval modals
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [planDraft, setPlanDraft] = useState<ForecastMonthPlan | null>(null);
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  const [changeNoteTarget, setChangeNoteTarget] = useState<{ repId: string; weekIndex: number } | null>(null);
  const [changeNote, setChangeNote] = useState('');

  // Comments modal state
  const [commentTarget, setCommentTarget] = useState<Customer | null>(null);
  const [commentKind, setCommentKind] = useState<CustomerCommentKind>('defaulted');
  const [commentBody, setCommentBody] = useState('');

  const isAdmin = canManageForecasts(currentUser);
  const canApprove = canApproveForecasts(currentUser);

  /* ---------- خطة الشهر: تقسيم الأسابيع ---------- */
  const plan: ForecastMonthPlan = useMemo(() => {
    const stored = forecastPlans.find((p) => p.id === monthKey);
    if (stored) return stored;
    const parsed = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!parsed) return buildDefaultMonthPlan(new Date().getFullYear(), new Date().getMonth() + 1, currentUser?.name);
    return buildDefaultMonthPlan(Number(parsed[1]), Number(parsed[2]), currentUser?.name);
  }, [forecastPlans, monthKey, currentUser]);

  const weeks = plan.weeks;
  const weeksCount = weeks.length;
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

  /* ---------- O(1) Pre-Indexed Forecast Maps (سرعة فائقة) ---------- */
  const { forecastByCustomerAndWeek, forecastTotalsByCustomer } = useMemo(() => {
    const byCustWeek = new Map<string, CollectionForecastRecord>();
    const byCustTotal = new Map<string, number>();

    visibleForecasts.forEach((f) => {
      byCustWeek.set(`${f.customerId}::${f.weekIndex}`, f);
      const prev = byCustTotal.get(f.customerId) || 0;
      byCustTotal.set(f.customerId, prev + (Number(f.collectionForecast) || 0));
    });

    return { forecastByCustomerAndWeek: byCustWeek, forecastTotalsByCustomer: byCustTotal };
  }, [visibleForecasts]);

  /* ---------- O(1) Pre-Indexed Comments & Returns & Visits ---------- */
  const commentByCode = useMemo(() => {
    const map = new Map<string, CustomerCommentRecord>();
    (customerComments || []).forEach((c) => {
      if (c.customerCode) map.set(c.customerCode, c);
    });
    return map;
  }, [customerComments]);

  const lastVisitMap = useMemo(() => {
    const map = new Map<string, string>();
    (visits || []).forEach((v) => {
      const prev = map.get(v.customerId);
      if (!prev || String(v.date) > prev) map.set(v.customerId, String(v.date));
    });
    return map;
  }, [visits]);

  const returnsByCode = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; lastDate: string }>();
    (invoices || []).forEach((inv) => {
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

  /* ---------- العملاء: عميل واحد لكل (مندوب، عميل) مرتبط بالصلاحية ---------- */
  const scopedCustomers = useMemo(() => {
    return customers.filter((c) => {
      const repId = c.repId || '';
      const repName = c.salesRepName || c.repName || '';
      if (!repName) return false;
      return canSeeRepForecasts(currentUser, users, c.branchName || '', repId, repName);
    });
  }, [customers, currentUser, users]);

  /* ---------- خيارات المناديب المتاحة للفلترة ---------- */
  const repOptions = useMemo(() => {
    const seen = new Map<string, string>();
    scopedCustomers.forEach((c) => {
      const repId = c.repId || c.salesRepName || c.repName || '';
      const name = c.salesRepName || c.repName || '';
      if (repId && name) seen.set(repId, name);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [scopedCustomers]);

  /* ---------- الفلترة السريعة والخفيفة للعملاء (Instant Filtering) ---------- */
  const filteredCustomers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return scopedCustomers.filter((c) => {
      const repId = c.repId || '';
      const repName = c.salesRepName || c.repName || '';

      if (repFilter !== 'ALL' && repId !== repFilter && !isArabicNameMatch(repName, repFilter)) {
        return false;
      }

      if (!q) return true;

      const name = (c.name || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      const rName = repName.toLowerCase();
      const branch = (c.branchName || '').toLowerCase();

      return name.includes(q) || code.includes(q) || rName.includes(q) || branch.includes(q);
    });
  }, [scopedCustomers, deferredSearch, repFilter]);

  // Sort matched customers by expected collection desc, then by name
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      const valA = forecastTotalsByCustomer.get(a.id) || 0;
      const valB = forecastTotalsByCustomer.get(b.id) || 0;
      if (valB !== valA) return valB - valA;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [filteredCustomers, forecastTotalsByCustomer]);

  /* ---------- ترقيم الصفحات (Pagination) ---------- */
  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageCustomers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, repFilter, weekFilter, monthKey, pageSize]);

  /* ---------- إجماليات سريعة للبطاقات القيادية ---------- */
  const kpiTotals = useMemo(() => {
    let totalForecast = 0;
    visibleForecasts.forEach((f) => {
      totalForecast += Number(f.collectionForecast) || 0;
    });

    const monthTargets = targets.filter((t) => monthKeyOf(t.year, t.month) === monthKey);
    const targetCollection = monthTargets.reduce((sum, t) => sum + (Number(t.collectionTarget) || 0), 0);
    const actualCollection = monthTargets.reduce((sum, t) => sum + (Number(t.collectionAchieved) || 0), 0);
    const coverage = targetCollection > 0 ? Math.round((totalForecast / targetCollection) * 100) : 0;

    return {
      totalForecast,
      targetCollection,
      actualCollection,
      coverage,
    };
  }, [visibleForecasts, targets, monthKey]);

  /* ---------- التقدم المالي والتجميع للمشرفين ---------- */
  const progress: ForecastProgressRow[] = useMemo(() => {
    return buildProgress(
      visibleForecasts,
      targets.filter((t) => monthKeyOf(t.year, t.month) === monthKey),
      weeksCount
    );
  }, [visibleForecasts, targets, monthKey, weeksCount]);

  /* ---------- كتابة وتعديل أرقام التوقع (Cell Commit) ---------- */
  const recordFor = useCallback(
    (customer: Customer, week: number): CollectionForecastRecord => {
      const key = `${customer.id}::${week}`;
      const existing = forecastByCustomerAndWeek.get(key);
      if (existing) return existing;

      return {
        id: emptyForecastId(monthKey, week, customer.id),
        monthKey,
        weekIndex: week,
        repId: customer.repId || '',
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
    [monthKey, forecastByCustomerAndWeek]
  );

  const commitCell = useCallback(
    async (customer: Customer, week: number, raw: string) => {
      const base = recordFor(customer, week);
      const value = raw === '' ? 0 : Math.max(0, Number(raw) || 0);

      if (isLockedForEditing(base, currentUser)) {
        setSavedFlash('الرقم معتمد ومقفول — يتطلب طلب تعديل من المشرف');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }
      if (!canWriteOwnForecast(currentUser, base, users)) {
        setSavedFlash('غير مصرح لك بتعديل توقعات مندوب آخر');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }

      const nextStatus = base.status === 'approved' && canApprove ? 'approved' : base.status;
      await saveForecast({
        ...base,
        collectionForecast: value,
        status: nextStatus,
        changeRequestNote: undefined,
      });

      setDraft((d) => {
        const next = { ...d };
        delete next[`${customer.id}::${week}`];
        return next;
      });
      setSavedFlash(`تم حفظ توقع أسبوع ${week} لـ ${customer.name} ✅`);
      setTimeout(() => setSavedFlash(''), 3000);
    },
    [recordFor, currentUser, users, canApprove, saveForecast]
  );

  /* ---------- تصدير التقرير إلى Excel ---------- */
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

  const shiftMonth = (delta: number) => {
    const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!m) return;
    const d = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
    setMonthKey(monthKeyOf(d.getFullYear(), d.getMonth() + 1));
    setRepFilter('ALL');
  };

  const monthOptions = useMemo(() => {
    const now = new Date();
    const out: string[] = [];
    for (let i = -1; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(monthKeyOf(d.getFullYear(), d.getMonth() + 1));
    }
    return out;
  }, []);

  const openCommentModal = (c: Customer) => {
    setCommentTarget(c);
    const existing = commentByCode.get(c.code || '');
    setCommentKind(existing?.kind || 'defaulted');
    setCommentBody(existing?.body || '');
  };

  const handleSaveComment = async () => {
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
    setSavedFlash('تم حفظ الملاحظة على كود العميل ✅');
    setTimeout(() => setSavedFlash(''), 3000);
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ========================================================================= */}
      {/* 1. Header with Month Navigator & Actions                                  */}
      {/* ========================================================================= */}
      <section className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-emerald-500/25 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>إدارة التدفق النقدي والتحصيلات</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-xs font-bold">
                نسخة خفيفة وسريعة ⚡
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <span>توقع التحصيلات الأسبوعية (W1 - W5)</span>
              <span className="text-emerald-400 font-mono text-base">({formatMonthLabel(monthKey)})</span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              عرض مباشر لبيانات العملاء (الكود، الاسم، المديونية، إجمالي المستحقات) مع فتح تفاصيل العميل والزيارات عند النقر.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Month Switcher */}
            <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded-2xl p-1 shadow-sm">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="px-2 py-1.5 rounded-xl text-emerald-300 hover:bg-slate-800 transition cursor-pointer"
                title="الشهر السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <select
                value={monthKey}
                onChange={(e) => setMonthKey(e.target.value)}
                className="px-2 py-1.5 bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer"
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
                className="px-2 py-1.5 rounded-xl text-emerald-300 hover:bg-slate-800 transition cursor-pointer"
                title="الشهر القادم"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setPlanDraft({ ...plan, weeks: plan.weeks.map((w) => ({ ...w })) });
                  setPlanErrors([]);
                  setShowPlanEditor(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black shadow-sm transition cursor-pointer"
              >
                <CalendarDays className="w-4 h-4" />
                <span>تقسيم الأسابيع</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-sm transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel 📥</span>
            </button>
          </div>
        </div>

        {/* Weeks Range Visual Strip */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {weeks.map((w) => {
            const isCurrent = currentWeek === w.index;
            return (
              <span
                key={w.index}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition ${
                  isCurrent
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-xs'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700'
                }`}
              >
                أسبوع {w.index}: {formatWeekRange(w)}
                {isCurrent && <span className="mr-1 text-slate-950">● الأسبوع الحالي</span>}
              </span>
            );
          })}
        </div>
      </section>

      {/* Notification Toast */}
      {savedFlash && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-black shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{savedFlash}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Executive KPI Cards Summary (خفيفة جداً ومحسوبة بالذاكرة)             */}
      {/* ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>إجمالي التوقع للشهر</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-800 mt-1 font-mono">
            {formatCurrency(kpiTotals.totalForecast)}
          </div>
          <div className="text-[10.5px] text-slate-500 font-bold mt-0.5">
            نسبة تغطية التارجت: <span className="text-emerald-700 font-black">{kpiTotals.coverage}%</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>هدف التحصيل المطلوب</span>
            <Target className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-blue-800 mt-1 font-mono">
            {formatCurrency(kpiTotals.targetCollection)}
          </div>
          <div className="text-[10.5px] text-slate-500 font-bold mt-0.5">
            المسجل بتارجت الشهر المعتمد
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>المحقق الفعلي حتى الآن</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-indigo-800 mt-1 font-mono">
            {formatCurrency(kpiTotals.actualCollection)}
          </div>
          <div className="text-[10.5px] text-slate-500 font-bold mt-0.5">
            فارق التوقع: {formatCurrency(kpiTotals.totalForecast - kpiTotals.actualCollection)}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>العملاء في نطاق البحث</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 mt-1 font-mono">
            {filteredCustomers.length.toLocaleString('ar-EG')}
          </div>
          <div className="text-[10.5px] text-slate-500 font-bold mt-0.5">
            إجمالي شبكة التوزيع ({scopedCustomers.length})
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. Fast Instant Filter Bar (بدون أي تأخير)                                */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-3 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث فوري باسم العميل أو الكود أو المندوب أو الفرع..."
            className="w-full px-3 py-2 pl-8 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <select
          value={repFilter}
          onChange={(e) => setRepFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
        >
          <option value="ALL">كافة المناديب ({repOptions.length})</option>
          {repOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
        >
          <option value="ALL">كافة الأسابيع (W1-W{weeksCount})</option>
          {weeks.map((w) => (
            <option key={w.index} value={String(w.index)}>
              أسبوع {w.index} ({formatWeekRange(w)})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <span>عرض:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-slate-300 text-xs font-black bg-white cursor-pointer"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
          >
            مسح البحث ✕
          </button>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 4. Streamlined Customer Forecast Table (جدول العملاء والتوقع السريع)      */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-black text-slate-900">
              قائمة العملاء وبيانات المديونية والمستحقات والتوقع
            </span>
            <span className="text-[11px] font-bold text-slate-500 font-mono">
              ({sortedCustomers.length} عميل مطابق)
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
            <span>💡 اضغط على اسم العميل أو زر (👁️) لفتح الملف الشامل والزيارات</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-slate-900 text-slate-100 font-black">
              <tr>
                <th className="p-3 text-center w-12">#</th>
                <th className="p-3">كود العميل</th>
                <th className="p-3 min-w-[200px]">اسم العميل</th>
                <th className="p-3">المندوب والفرع</th>
                <th className="p-3 text-rose-300">المديونية</th>
                <th className="p-3 text-amber-300">إجمالي المستحقات</th>
                {shownWeeks.map((w) => (
                  <th key={w.index} className="p-3 text-center whitespace-nowrap min-w-[105px]">
                    <div>متوقع أ{w.index}</div>
                    <span className="text-[9.5px] font-normal text-slate-400 block font-mono">
                      {w.start.slice(5)} إلى {w.end.slice(5)}
                    </span>
                  </th>
                ))}
                <th className="p-3 text-emerald-300 text-center">إجمالي المتوقع</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageCustomers.map((c, index) => {
                const rowNum = (safePage - 1) * pageSize + index + 1;
                const balance = resolveCustomerBalanceValue(c);
                const dues = resolveCustomerDuesValue(c);
                const monthTotal = forecastTotalsByCustomer.get(c.id) || 0;
                const repName = c.salesRepName || c.repName || 'المندوب';
                const branchName = c.branchName || 'الفرع';
                const returnInfo = returnsByCode.get(c.code || '');
                const commentRecord = commentByCode.get(c.code || '');

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="p-3 text-center font-mono text-slate-400 text-xs">
                      {rowNum}
                    </td>

                    {/* Customer Code */}
                    <td className="p-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                      {c.code || '—'}
                    </td>

                    {/* Customer Name (Clickable to open dossier) */}
                    <td className="p-3 font-black text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerDetail(c)}
                          className="hover:text-emerald-700 hover:underline cursor-pointer text-right flex items-center gap-1"
                          title="عرض ملف العميل الشامل"
                        >
                          <span>{c.name}</span>
                          <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition" />
                        </button>
                        {returnInfo && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-black border border-rose-300" title={`مرتجع بقيمة ${formatCurrency(returnInfo.amount)}`}>
                            مرتجع
                          </span>
                        )}
                        {(c.guaranteeAmount || 0) > 0 && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold border border-amber-300">
                            ضمانة 📄
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Rep & Branch */}
                    <td className="p-3 whitespace-nowrap">
                      <span className="font-bold text-slate-800 block">{repName}</span>
                      <span className="text-[10px] text-slate-400 block">{branchName}</span>
                    </td>

                    {/* Current Balance */}
                    <td className="p-3 font-mono font-black text-rose-700 whitespace-nowrap">
                      {balance > 0 ? formatCurrency(balance) : '0 ج.م'}
                    </td>

                    {/* Total Dues */}
                    <td className="p-3 font-mono font-black text-amber-800 whitespace-nowrap">
                      {dues > 0 ? formatCurrency(dues) : '0 ج.م'}
                    </td>

                    {/* Week Input Cells */}
                    {shownWeeks.map((w) => {
                      const recKey = `${c.id}::${w.index}`;
                      const rec = forecastByCustomerAndWeek.get(recKey);
                      const baseRec = recordFor(c, w.index);
                      const editable = canWriteOwnForecast(currentUser, baseRec, users);
                      const locked = isLockedForEditing(baseRec, currentUser);
                      const currentVal = draft[recKey] !== undefined ? draft[recKey] : (rec ? String(rec.collectionForecast || '') : '');

                      return (
                        <td key={w.index} className="p-2 text-center whitespace-nowrap">
                          <input
                            type="number"
                            min={0}
                            disabled={!editable || locked}
                            value={currentVal}
                            placeholder="0"
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraft((prev) => ({ ...prev, [recKey]: val }));
                            }}
                            onBlur={(e) => {
                              commitCell(c, w.index, e.target.value);
                            }}
                            title={locked ? 'معتمد ومثبت من المشرف' : `تسجيل متوقع أسبوع ${w.index}`}
                            className={`w-24 px-2 py-1 rounded-xl text-center font-mono font-black text-xs border transition ${
                              locked
                                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                : Number(currentVal) > 0
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-400'
                                : 'bg-white text-slate-800 border-slate-300 focus:border-emerald-500 focus:outline-none'
                            }`}
                          />
                        </td>
                      );
                    })}

                    {/* Month Expected Total */}
                    <td className="p-3 text-center font-mono font-black text-emerald-700 whitespace-nowrap bg-emerald-50/40">
                      {monthTotal > 0 ? formatCurrency(monthTotal) : '—'}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerDetail(c)}
                          className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[11px] transition flex items-center gap-1 cursor-pointer"
                          title="عرض كافة تفاصيل العميل"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>التفاصيل</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openCommentModal(c)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            commentRecord
                              ? `${COMMENT_KIND_COLORS[commentRecord.kind]} font-bold`
                              : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-300'
                          }`}
                          title={commentRecord?.body || 'تسجيل ملاحظة على العميل'}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {pageCustomers.length === 0 && (
                <tr>
                  <td colSpan={8 + shownWeeks.length} className="p-8 text-center text-slate-400 font-bold text-xs">
                    لا يوجد عملاء مطابقين للبحث والفلاتر المحددة حالياً.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ================= Pagination Controls ================= */}
        {sortedCustomers.length > 0 && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="font-bold text-slate-500">
              عرض {(safePage - 1) * pageSize + 1} إلى {Math.min(safePage * pageSize, sortedCustomers.length)} من إجمالي {sortedCustomers.length} عميل
            </span>

            <div className="flex items-center gap-1.5 font-bold">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>السابق</span>
              </button>

              <span className="px-3 py-1 font-mono font-black text-slate-800">
                صفحة {safePage} من {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer flex items-center gap-1"
              >
                <span>التالي</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 5. Complete Customer Dossier Modal (نفس تفاصيل كافه العملاء والزيارات)       */}
      {/* ========================================================================= */}
      {selectedCustomerDetail && (() => {
        const c = selectedCustomerDetail;
        const fin = calculateCustomerFinancials(c, 'ALL');
        const customerVisitsList = c.visitHistory || [];
        const activeVisits = customerVisitsList.filter((v) => !v.isArchived);
        const archivedVisits = customerVisitsList.filter((v) => v.isArchived);
        const relatedComments = (customerComments || []).filter(
          (cm) => cm.customerCode === c.code || cm.customerId === c.id
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto border border-slate-200 space-y-4">
              {/* Modal Header */}
              <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl z-10 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-white flex items-center gap-2">
                      <span>{c.name}</span>
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-white/10 px-2 py-0.5 rounded-md">
                        كود: {c.code || '—'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-300">
                      الملف الشامل للعميل والمبيعات والتحصيلات وسجل الزيارات
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCustomerDetail(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                {/* Information Card Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div>
                    <span className="text-[10.5px] font-bold text-slate-400 block">المندوب المسئول:</span>
                    <span className="font-black text-slate-800 text-xs">{c.salesRepName || c.repName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] font-bold text-slate-400 block">الفرع:</span>
                    <span className="font-black text-slate-800 text-xs">{c.branchName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] font-bold text-slate-400 block">الهاتف:</span>
                    <span className="font-black text-slate-800 text-xs font-mono">{c.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10.5px] font-bold text-slate-400 block">العنوان:</span>
                    <span className="font-black text-slate-800 text-xs truncate block">{c.address || '—'}</span>
                  </div>
                </div>

                {/* Financial Summary Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                    <span className="text-[11px] font-bold text-rose-800 block">المديونية الحالية</span>
                    <span className="font-mono text-base font-black text-rose-900">{formatCurrency(fin.balance)}</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <span className="text-[11px] font-bold text-amber-800 block">إجمالي المستحقات</span>
                    <span className="font-mono text-base font-black text-amber-900">{formatCurrency(fin.overdue)}</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200">
                    <span className="text-[11px] font-bold text-blue-800 block">مبيعات 2026</span>
                    <span className="font-mono text-base font-black text-blue-900">{formatCurrency(fin.sales2026)}</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <span className="text-[11px] font-bold text-emerald-800 block">تحصيلات 2026</span>
                    <span className="font-mono text-base font-black text-emerald-900">{formatCurrency(fin.collections2026)}</span>
                  </div>
                </div>

                {/* 2026 Monthly Breakdown Table */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="p-3 bg-slate-100 border-b border-slate-200 font-black text-slate-800 flex items-center justify-between">
                    <span>حركة مبيعات وتحصيلات أشهر 2026</span>
                    <span className="text-emerald-700">نسبة السداد العامة: {fin.collectionRate}%</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                          <th className="p-2.5 text-right">الشهر</th>
                          <th className="p-2.5 text-blue-800">المبيعات (ج.م)</th>
                          <th className="p-2.5 text-emerald-800">التحصيلات (ج.م)</th>
                          <th className="p-2.5 text-center">نسبة السداد</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {MONTH_NAMES_AR_12.map((mName, idx) => {
                          const mNum = idx + 1;
                          const s = c.monthlySales2026?.[mNum] || 0;
                          const col = c.monthlyCollections2026?.[mNum] || 0;
                          const rate = s > 0 ? Math.round((col / s) * 100) : (col > 0 ? 100 : 0);
                          const hasData = s > 0 || col > 0;

                          return (
                            <tr key={mNum} className="hover:bg-slate-50">
                              <td className="p-2 text-right font-black text-slate-900">
                                {mName} (شهر {mNum})
                              </td>
                              <td className="p-2 font-mono font-bold text-blue-900">
                                {s > 0 ? formatCurrency(s) : '—'}
                              </td>
                              <td className="p-2 font-mono font-bold text-emerald-900">
                                {col > 0 ? formatCurrency(col) : '—'}
                              </td>
                              <td className="p-2 text-center">
                                {hasData ? (
                                  <span className={`px-2 py-0.5 rounded-full font-black text-[10px] inline-block ${
                                    rate >= 90 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {rate}%
                                  </span>
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Visit History Section */}
                <div className="rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-700" />
                      <span className="font-black text-sm text-slate-900">سجل وملاحظات الزيارات الميدانية للعميل</span>
                      <span className="text-xs font-bold text-slate-400 font-mono">({customerVisitsList.length})</span>
                    </div>
                  </div>

                  {activeVisits.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {activeVisits.map((v) => (
                        <div key={v.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                              <span className="bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                                📅 {v.date} {v.time ? `• ${v.time}` : ''}
                              </span>
                              <span className="bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded font-bold border border-indigo-200">
                                المندوب: {v.repName || 'المندوب'}
                              </span>
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black border border-emerald-300">
                                الإفادة: {v.outcome || 'متابعة'}
                              </span>
                            </div>
                            {v.notes && (
                              <p className="text-slate-700 bg-white p-2 rounded-lg border border-slate-200 mt-1">
                                {v.notes}
                              </p>
                            )}
                          </div>
                          {v.collectedAmount && v.collectedAmount > 0 ? (
                            <div className="font-mono font-black text-sm text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
                              +{formatCurrency(v.collectedAmount)}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-4 text-slate-400 font-bold">لا توجد زيارات مسجلة لهذا العميل حالياً.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 6. Comments Modal (تسجيل ملاحظات الحساب)                                   */}
      {/* ========================================================================= */}
      {commentTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-5 space-y-4 border border-slate-200 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-black text-sm text-slate-900">
                تسجيل ملاحظة على حساب: {commentTarget.name}
              </span>
              <button
                type="button"
                onClick={() => setCommentTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-slate-600 block">تصنيف الملاحظة:</label>
              <select
                value={commentKind}
                onChange={(e) => setCommentKind(e.target.value as CustomerCommentKind)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold cursor-pointer"
              >
                <option value="defaulted">⚠️ عميل متعثر في السداد</option>
                <option value="return">↩️ بضاعة مرتجعة</option>
                <option value="note">📝 ملاحظة ائتمانية عامة</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-slate-600 block">نص الملاحظة:</label>
              <textarea
                rows={3}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="اكتب الملاحظة هنا بدقة لتظهر للفريق والمشرفين..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCommentTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-600 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveComment}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black cursor-pointer shadow-sm"
              >
                حفظ الملاحظة ✅
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
