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
  ClipboardPaste,
  Clock,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Layers,
  Lock,
  LockOpen,
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
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
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
  ForecastWeek,
  ForecastStatus,
} from '../types';
import { resolveCustomerBalanceValue, resolveCustomerDuesValue } from '../services/customerDues';
import { calculateCustomerFinancials } from '../services/customerFinancialService';
import {
  COMMENT_KIND_COLORS,
  buildDefaultMonthPlan,
  buildForecastExportRows,
  buildBlockWeeks,
  buildEvenWeeks,
  buildProgress,
  canApproveForecasts,
  canManageForecasts,
  canSeeRepForecasts,
  canWriteOwnForecast,
  isLockedForEditing,
  addDays,
  clampWeekCount,
  commentId,
  currentMonthKey,
  daysInMonth,
  emptyForecastId,
  emptyMonthForecastId,
  filterForecastsForUser,
  formatMonthLabel,
  formatWeekRange,
  isWeekForecast,
  MAX_WEEK_LABEL_LENGTH,
  MAX_WEEKS_PER_MONTH,
  MIN_WEEKS_PER_MONTH,
  monthKeyOf,
  MONTH_FORECAST_INDEX,
  NO_WEEK_DIVISION,
  normalizeWeekLabels,
  scopeForecastsToPlan,
  spanDays,
  suggestedWeekCountForSpan,
  toISODate,
  validateMonthPlan,
  weekIndexForDate,
  weekLabel,
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

/**
 * صياغة عدد الفترات بالعربي.
 *
 * الشهر بقى بيتقسم على أي عدد فترات، فصيغة `${n} أسابيع` تبقى غلط لغوياً مع 1
 * و2 — فبنكتبهم صح.
 */
function weekCountLabel(count: number): string {
  if (count === 1) return 'أسبوع واحد';
  if (count === 2) return 'أسبوعين';
  return `${count} أسابيع`;
}

/**
 * اسم خانة التوقع في الرسائل: رقم شهري أو اسم الفترة اللي الأدمن كتبه.
 *
 * الدوال دي بتشتغل بـweekIndex بس (مش بالـweek object)، فبتبص في خطة الشهر
 * نفسها. لو الفترة مش موجودة في التقسيم الحالي رجعنا لاسم افتراضي.
 */
function forecastSlotLabel(weekIndex: number, weeks: ForecastWeek[]): string {
  if (weekIndex === MONTH_FORECAST_INDEX) return 'التوقع الشهري';
  const found = weeks.find((w) => w.index === weekIndex);
  return found ? weekLabel(found) : `الأسبوع ${weekIndex}`;
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
    visits,
    invoices,
    saveForecast,
    submitForecastWeek,
    approveForecastWeek,
    requestForecastChange,
    saveForecastPlan,
    saveCustomerComment,
    deleteCustomerForecasts,
  } = useApp();

  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [repFilter, setRepFilter] = useState<string>('ALL');
  const [supervisorFilter, setSupervisorFilter] = useState<string>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [showPasteMonthly, setShowPasteMonthly] = useState(false);
  const [pasteMonthlyText, setPasteMonthlyText] = useState('');
  const [pasteMonthlyPreview, setPasteMonthlyPreview] = useState<Array<{ code: string; amount: number; customer: Customer | null }>>([]);
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  // الصفحة دي بتعرض اللي عليهم مستحقات فعلاً. الفلتر مفعّل افتراضياً لأن قصد
  // القسم متابعة التحصيل، بس يفضل مفتاح عشان المندوب يفتح شبكة عميله كلها.
  const [debtOnly, setDebtOnly] = useState<boolean>(true);
  const [classFilter, setClassFilter] = useState<string>('ALL');

  // Draft inputs state for week forecasts
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState('');

  // Selected customer for full dossier details modal
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<Customer | null>(null);

  // Month plan & supervisor approval modals
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [planDraft, setPlanDraft] = useState<ForecastMonthPlan | null>(null);
  const [planErrors, setPlanErrors] = useState<string[]>([]);
  /** رقم الأسابيع المكتوب في خانة العدد — حر من 1 لغاية MAX، مش 4/5 بس. */
  const [weekCountInput, setWeekCountInput] = useState('');
  const [changeNoteTarget, setChangeNoteTarget] = useState<{ repId: string; weekIndex: number } | null>(null);
  const [changeNote, setChangeNote] = useState('');

  // Comments modal state
  const [commentTarget, setCommentTarget] = useState<Customer | null>(null);
  const [commentKind, setCommentKind] = useState<CustomerCommentKind>('defaulted');
  const [commentBody, setCommentBody] = useState('');

  const isAdmin = canManageForecasts(currentUser);
  const canApprove = canApproveForecasts(currentUser);

  /* ---------- خطة الشهر: تقسيم الفترات (اختياري) ---------- */
  const plan: ForecastMonthPlan = useMemo(() => {
    const stored = forecastPlans.find((p) => p.id === monthKey);
    if (stored) return stored;
    const parsed = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!parsed) return buildDefaultMonthPlan(new Date().getFullYear(), new Date().getMonth() + 1, currentUser?.name);
    return buildDefaultMonthPlan(Number(parsed[1]), Number(parsed[2]), currentUser?.name);
  }, [forecastPlans, monthKey, currentUser]);

  /**
   * الشهر المقفول بيقفل الكتابة عن كل الأدوار غير الأدمن.
   *
   * القرار مقصود إن الأدمن يفضل يقدر يعدّل ويقدر يفتح تاني: لو قفلنا كل حاجة
   * بدون مخرج، أي ضغطة غلط هتقفل الشهر على كل المندوبين ومفيش حد يقدر يفتح.
   * يعني القفل بيحمي الأرقام المحسوبة بس مش بيعمل قفل لا رجعة فيه.
   */
  const planLocked = !!plan.isClosed && !isAdmin;

  const weeks = plan.weeks;
  const weeksCount = weeks.length;
  const shownWeeks = useMemo(
    () => (weekFilter === 'ALL' ? weeks : weeks.filter((w) => String(w.index) === weekFilter)),
    [weeks, weekFilter]
  );
  const currentWeek = weekIndexForDate(plan, new Date().toISOString().slice(0, 10));

  /* ---------- التوقعات الظاهرة للمستخدم الحالي ---------- */
  /* بنقصّ السطور على التقسيم الحالي للشهر. السبب إن سطور أسبوع مقفول بتفضل
     موجودة في البيانات بعد ما الأدمن يصغّر الشهر، ولو دخلت هنا كانت بتعدّي في
     المجموع من غير ما تكون ظاهرة في الجدول. السطور اليتيمة بتروحلنا للاشعار. */
  const { visibleForecasts, orphanForecasts } = useMemo(() => {
    const mine = filterForecastsForUser(
      forecasts.filter((f) => f.monthKey === monthKey),
      currentUser,
      users
    );
    const { scoped, orphans } = scopeForecastsToPlan(mine, weeksCount);
    return { visibleForecasts: scoped, orphanForecasts: orphans };
  }, [forecasts, monthKey, currentUser, users, weeksCount]);

  const orphanTotal = useMemo(
    () => orphanForecasts.reduce((s, f) => s + (Number(f.collectionForecast) || 0), 0),
    [orphanForecasts]
  );

  /* ---------- O(1) Pre-Indexed Forecast Maps (سرعة فائقة) ---------- */
  /* السطر الشهري المستقل بيتخزن بنفس الجدول بـ week_index = 0، فبنخزّنه في
     map لوحده. لو خلطناه مع خريطة الأسابيع، الخانة الشهرية هتعرض آخر أسبوع
     اتكتب فيها. */
  const { forecastByCustomerAndWeek, forecastTotalsByCustomer, monthForecastByCustomer } = useMemo(() => {
    const byCustWeek = new Map<string, CollectionForecastRecord>();
    const byCustTotal = new Map<string, number>();
    const monthByCustomer = new Map<string, CollectionForecastRecord>();

    visibleForecasts.forEach((f) => {
      if (isWeekForecast(f)) {
        byCustWeek.set(`${f.customerId}::${f.weekIndex}`, f);
        const prev = byCustTotal.get(f.customerId) || 0;
        byCustTotal.set(f.customerId, prev + (Number(f.collectionForecast) || 0));
      } else {
        monthByCustomer.set(f.customerId, f);
      }
    });

    return {
      forecastByCustomerAndWeek: byCustWeek,
      forecastTotalsByCustomer: byCustTotal,
      monthForecastByCustomer: monthByCustomer,
    };
  }, [visibleForecasts]);

  /* ---------- O(1) Pre-Indexed Comments & Returns & Visits ---------- */
  const commentByCode = useMemo(() => {
    const map = new Map<string, CustomerCommentRecord>();
    (customerComments || []).forEach((c) => {
      if (c.customerCode) map.set(c.customerCode, c);
    });
    return map;
  }, [customerComments]);

  /**
   * إحصائيات الزيارات لكل عميل: العدد وآخر تاريخ وآخر تحصيل.
   *
   * المصدر هو سجل الزيارات نفسه مش `customers.visit_count_2026`، لأن العدّاد
   * المخزّن على صف العميل بيتحدّث مع الحفظ وأحياناً يفضل قديم، فبيبقى الرقم
   * اللي في الجدول مخالف للواقع. هنا بنحسب من السجلات مباشرة.
   *
   * الزيارات المؤرشفة (isReturn / isArchived) مش بتتحسب كزيارة منفّذة، لأنها
   * بتتكرر في الإحصائيات كمان غير منفّذة.
   */
  const visitStatsByCustomer = useMemo(() => {
    const map = new Map<string, { count: number; completed: number; lastDate: string; lastCollected: number }>();
    (visits || []).forEach((v) => {
      const key = v.customerId || v.customerCode || '';
      if (!key) return;
      const prev = map.get(key) || { count: 0, completed: 0, lastDate: '', lastCollected: 0 };
      const isArchived = !!(v as any).isArchived;
      if (!isArchived) prev.count += 1;
      if (!isArchived && (v.status === 'منفذة' || !!(v as any).checkOutTime)) prev.completed += 1;
      const d = String(v.date || '');
      if (d && d > prev.lastDate) prev.lastDate = d;
      const amount = Number(v.collectedAmount || 0);
      if (d === prev.lastDate) prev.lastCollected += amount;
      map.set(key, prev);
    });
    return map;
  }, [visits]);

  /** آخر تاريخ زيارة — من السجلات، ويرجع لصف العميل لو مفيش سجلات. */
  const lastVisitFor = useCallback(
    (c: Customer): string => {
      const fromRecords = visitStatsByCustomer.get(c.id)?.lastDate
        || visitStatsByCustomer.get(c.code || '')?.lastDate;
      return fromRecords || c.lastVisitDate || '';
    },
    [visitStatsByCustomer]
  );

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

  /**
   * مين يدخل جدول التوقع أصلاً.
   *
   * العميل يدخل بشروط مع بعض: مديونيته أكبر من صفر **وعليه** مستحقات أكبر من
   * صفر — يعني عنده فلوس فعلاً لازم تتحصل.
   *
   * الشرطين مع بعض مقصود: مديونية من غير مستحقات معناها رصيد ملغى أو حد
   * دفع كل حاجة ومستحقاته اتصفّر، ومستحقات من غير مديونية معناها حد دفع
   * زيادة (رصيد له مش عليه) — وهو مش مدين فمحلهوش في تقرير تحصيل أصلاً.
   *
   * الأرقام بتتقري من الـcanonical readers في customerDues عشان كل شاشات
   * النظام تتفق على نفس الرقم لنفس العميل.
   */
  const isCollectibleCustomer = useCallback((c: Customer) => {
    return resolveCustomerBalanceValue(c) > 0 && resolveCustomerDuesValue(c) > 0;
  }, []);

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

  const supervisorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    scopedCustomers.forEach((c) => {
      const rep = users.find((u) => u.id === c.repId || u.name === (c.salesRepName || c.repName));
      const name = c.supervisorName || users.find((u) => u.id === rep?.supervisorId)?.name || '';
      if (name) seen.set(name, name);
    });
    return Array.from(seen.keys()).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [scopedCustomers, users]);

  /* ---------- الفلترة السريعة والخفيفة للعملاء (Instant Filtering) ---------- */
  const filteredCustomers = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return scopedCustomers.filter((c) => {
      const repId = c.repId || '';
      const repName = c.salesRepName || c.repName || '';

      if (repFilter !== 'ALL' && repId !== repFilter && !isArabicNameMatch(repName, repFilter)) {
        return false;
      }

      if (supervisorFilter !== 'ALL') {
        const rep = users.find((u) => u.id === c.repId || u.name === repName);
        const supervisorName = c.supervisorName || users.find((u) => u.id === rep?.supervisorId)?.name || '';
        if (!isArabicNameMatch(supervisorName, supervisorFilter)) return false;
      }

      if (debtOnly && !isCollectibleCustomer(c)) return false;

      if (classFilter !== 'ALL') {
        const fin = calculateCustomerFinancials(c, 'ALL');
        if (classFilter === 'eligible' && !fin.isEligible) return false;
        if (classFilter === 'blocked' && fin.isEligible) return false;
      }

      if (!q) return true;

      const name = (c.name || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      const rName = repName.toLowerCase();
      const branch = (c.branchName || '').toLowerCase();

      return name.includes(q) || code.includes(q) || rName.includes(q) || branch.includes(q);
    });
  }, [scopedCustomers, deferredSearch, repFilter, supervisorFilter, debtOnly, classFilter, isCollectibleCustomer, users]);

  // Sort matched customers by their planned collection desc, then by name
  const sortedCustomers = useMemo(() => {
    // الترتيب بالأولوية: رقم العميل الشهري المستقل، ومجموع الأسابيع fallback.
    const plannedFor = (c: Customer) => {
      const monthRec = monthForecastByCustomer.get(c.id);
      const monthVal = monthRec ? Number(monthRec.collectionForecast) || 0 : 0;
      return monthVal > 0 ? monthVal : forecastTotalsByCustomer.get(c.id) || 0;
    };

    return [...filteredCustomers].sort((a, b) => {
      const valA = plannedFor(a);
      const valB = plannedFor(b);
      if (valB !== valA) return valB - valA;
      return (a.name || '').localeCompare(b.name || '', 'ar');
    });
  }, [filteredCustomers, forecastTotalsByCustomer, monthForecastByCustomer]);

  /* ---------- ترقيم الصفحات (Pagination) ---------- */
  const totalPages = Math.max(1, Math.ceil(sortedCustomers.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageCustomers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedCustomers.slice(start, start + pageSize);
  }, [sortedCustomers, safePage, pageSize]);

  // أي تغيير في الفلاتر يرجّعنا لصفحة 1. لازم كل فلتر يكون في القائمة هنا،
  // وإلا المستخدم يبقى واقف على صفحة 5 وفلتره سايبه صفحة فاضية.
  useEffect(() => {
    setPage(1);
  }, [deferredSearch, repFilter, supervisorFilter, weekFilter, monthKey, pageSize, debtOnly, classFilter]);

  /* ---------- إجماليات سريعة للبطاقات القيادية ---------- */
  const kpiTotals = useMemo(() => {
    let weeklyTotal = 0;
    let monthTotal = 0;

    visibleForecasts.forEach((f) => {
      if (isWeekForecast(f)) weeklyTotal += Number(f.collectionForecast) || 0;
      else monthTotal += Number(f.collectionForecast) || 0;
    });

    // الرقم اللي بيتقارن بهدف الشهر هو التوقع الشهري المستقل. لو محدش كتب رقم
    // شهري (لأننا لسه في أول استخدام) بنرجع لمجموع الأسابيع بدل ما نحسب صفر
    // ونقول إن التغطية صفر والمطالبة غلط.
    const hasExplicitMonth = monthTotal > 0;
    const plannedTotal = hasExplicitMonth ? monthTotal : weeklyTotal;

    const monthTargets = targets.filter((t) => monthKeyOf(t.year, t.month) === monthKey);
    const targetCollection = monthTargets.reduce((sum, t) => sum + (Number(t.collectionTarget) || 0), 0);
    const actualCollection = monthTargets.reduce((sum, t) => sum + (Number(t.collectionAchieved) || 0), 0);
    const coverage = targetCollection > 0 ? Math.round((plannedTotal / targetCollection) * 100) : 0;

    return {
      weeklyTotal,
      monthTotal,
      hasExplicitMonth,
      plannedTotal,
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

  /**
   * سطر التوقع الشهري المستقل لنفس العميل.
   *
   * لو العميل لسه ماكتبش رقم شهري بنرجّع له مجموع الأسابيع، عشان الخانة تبان
   * فيها قيمة مفهومة بدل صفر مضلّل — والمندوب لو غيّر الرقم بيبقى صريح إنه
   * كاتب رقم مستقل.
   */
  const monthRecordFor = useCallback(
    (customer: Customer): CollectionForecastRecord => {
      const existing = monthForecastByCustomer.get(customer.id);
      if (existing) return existing;

      return {
        id: emptyMonthForecastId(monthKey, customer.id),
        monthKey,
        weekIndex: MONTH_FORECAST_INDEX,
        repId: customer.repId || '',
        repName: customer.salesRepName || customer.repName || '',
        branchName: customer.branchName || '',
        customerId: customer.id,
        customerCode: customer.code || '',
        customerName: customer.name || '',
        collectionForecast: forecastTotalsByCustomer.get(customer.id) || 0,
        salesForecast: 0,
        status: 'draft',
      };
    },
    [monthKey, monthForecastByCustomer, forecastTotalsByCustomer]
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

  /** حفظ التوقع الشهري المستقل — نفس مسار الحفظ الأسبوعي بس على week_index = 0. */
  const commitMonthCell = useCallback(
    async (customer: Customer, raw: string) => {
      const base = monthRecordFor(customer);
      const value = raw === '' ? 0 : Math.max(0, Number(raw) || 0);

      if (isLockedForEditing(base, currentUser)) {
        setSavedFlash('التوقع الشهري معتمد ومقفول — يتطلب طلب تعديل من المشرف');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }
      if (!canWriteOwnForecast(currentUser, base, users)) {
        setSavedFlash('غير مصرح لك بتعديل توقعات مندوب آخر');
        setTimeout(() => setSavedFlash(''), 4000);
        return;
      }

      await saveForecast({
        ...base,
        collectionForecast: value,
        status: base.status === 'approved' && canApprove ? 'approved' : base.status,
        changeRequestNote: undefined,
      });

      setDraft((d) => {
        const next = { ...d };
        delete next[`${customer.id}::${MONTH_FORECAST_INDEX}`];
        return next;
      });
      setSavedFlash(`تم حفظ التوقع الشهري لـ ${customer.name} ✅`);
      setTimeout(() => setSavedFlash(''), 3000);
    },
    [monthRecordFor, currentUser, users, canApprove, saveForecast]
  );

  /* ---------- تصدير التقرير إلى Excel ---------- */
  /* التقرير بيطلع على كل عملاء النطاق مش بس المعروضين في الشاشة، عشان اللي
     بيقفل الشهر يلاقي الشبكة كاملة في ملف واحد. الأعمدة الجديدة (التوقع الشهري
     المستقل وفرقه عن الأسابيع) ليها عرض أكبر لأنها أرقام كبيرة وبتتقرا جنب
     بعض للمقارنة. */
  const handleExport = () => {
    const data = buildForecastExportRows({
      forecasts: visibleForecasts,
      comments: customerComments,
      customers: scopedCustomers,
      returnsByCustomerCode: returnsByCode,
      lastVisitByCustomerId: lastVisitMap,
      visitStatsByCustomer,
    });
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
      { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 16 },
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

  /* ---------- خطة الشهر: تقسيم مرن للأيام (الأدمن والمطوّر فقط) ---------- */
  const openPlanEditor = () => {
    setPlanDraft({
      ...plan,
      monthStart: plan.monthStart || toISODate(plan.year, plan.month, 1),
      monthEnd: plan.monthEnd || toISODate(plan.year, plan.month, daysInMonth(plan.year, plan.month)),
      weeks: plan.weeks.map((w) => ({ ...w })),
    });
    setWeekCountInput(String(plan.weeks.length));
    setPlanErrors([]);
    setShowPlanEditor(true);
  };

  /** تقسيم افتراضي: كتل 7 أيام داخل مدى الشهر اللي الأدمن حدده. */
  const applySuggestedSplit = () => {
    if (!planDraft) return;
    // بنقسّم المدى اللي الأدمن حدده (مش الشهر التقويمي) عشان لو عمل الشهر
    // من يوم 25، التقسيم يفضل جواه ومحدش يفقد يوم.
    const suggested = buildBlockWeeks(planDraft.monthStart, planDraft.monthEnd, 7).slice(
      0,
      MAX_WEEKS_PER_MONTH
    );
    if (!suggested.length) {
      setPlanErrors(['مدى الشهر غير صحيح — راجع بداية ونهاية الشهر']);
      return;
    }
    setPlanDraft((p) => (p ? { ...p, weeks: suggested } : p));
    setWeekCountInput(String(suggested.length));
    setPlanErrors([]);
  };

  /**
   * يوزّع مدى الشهر على أي عدد فترات من 1 لغاية MAX.
   *
   * مفيش رقم ثابت هنا — فترة واحدة بغطي الشهر كله، اتنين نص ونص، 4، 5، أو
   * أي رقم تاني الإدارة تختاره. بداية ونهاية الشهر بيفضلوا زي ما الأدمن كاتبهم.
   *
   * أسماء الفترات بتتنقل مع ترتيبها: لو كتبت «نص شهر» على الفترة التانية وبعدين
   * طلبت 4 فترات، الاسم بيفضل على مكانه التاني. غير كده أي تغيير في التقسيم
   * كان هيمسح شغل الإدارة اليدوي من غير سبب.
   */
  const applyWeekCount = (count: number) => {
    if (!planDraft) return;
    const total = spanDays(planDraft.monthStart, planDraft.monthEnd);
    const safe = clampWeekCount(count);
    // كل فترة لازم يوم واحد على الأقل، فلو المدة أقل من عدد الفترات التقسيم
    // مستحيل — بنقول السبب بدل ما نرمي رسالة "المدى غير صحيح" المضللة.
    if (total <= 0 || total < safe) {
      setPlanErrors([
        `مدى الشهر ${total} يوم مش بيسمح على ${safe} فترات — لازم كل فترة يوم على الأقل`,
      ]);
      return;
    }
    const weeks = buildEvenWeeks(planDraft.monthStart, planDraft.monthEnd, safe);
    if (!weeks.length) {
      setPlanErrors(['مدى الشهر غير صحيح — راجع بداية ونهاية الشهر']);
      return;
    }
    const previousLabels = planDraft.weeks;
    setPlanDraft((p) =>
      p
        ? { ...p, weeks: weeks.map((w, i) => (previousLabels[i]?.label ? { ...w, label: previousLabels[i].label } : w)) }
        : p
    );
    setWeekCountInput(String(weeks.length));
    setPlanErrors([]);
  };

  /** بيشتغل على قيمة خانة العدد: بيلغي الـ min/max وبيبلّغ قبل ما يقصّ. */
  const applyWeekCountInput = () => {
    const parsed = Number(weekCountInput);
    if (!weekCountInput.trim() || !Number.isFinite(parsed)) {
      setPlanErrors(['اكتب رقم صحيح لعدد الفترات']);
      return;
    }
    const rounded = Math.round(parsed);
    // صفر مش خطأ — معناه «بلا تقسيم»، والصفحة تشتغل على التوقع الشهري بس.
    if (rounded === NO_WEEK_DIVISION) {
      clearPlanWeeks();
      return;
    }
    if (rounded < MIN_WEEKS_PER_MONTH || rounded > MAX_WEEKS_PER_MONTH) {
      setPlanErrors([
        `عدد الفترات لازم يكون من 0 (بلا تقسيم) ل��اية ${MAX_WEEKS_PER_MONTH}`,
      ]);
      return;
    }
    applyWeekCount(rounded);
  };

  const updatePlanWeek = (index: number, field: 'start' | 'end', value: string) => {
    setPlanDraft((p) => {
      if (!p) return p;
      return {
        ...p,
        weeks: p.weeks.map((w) => (w.index === index ? { ...w, [field]: value } : w)),
      };
    });
    setPlanErrors([]);
  };

  /**
   * تسمية الفترة باسم يعرضه بدل «أسبوع 2».
   *
   * الاسم للعرض بس: week_index فضل مفتاح الربط في كل حاجة (الـid، الترقيم،
   * الاعتماد، التصدير)، فتسمة الفترة مش بتلصق الأرقام بتاعة حد تاني.
   */
  const updatePlanWeekLabel = (index: number, value: string) => {
    setPlanDraft((p) => {
      if (!p) return p;
      return {
        ...p,
        weeks: p.weeks.map((w) => (w.index === index ? { ...w, label: value } : w)),
      };
    });
    setPlanErrors([]);
  };

  /**
   * زرار «إضافة فترة».
   *
   * مش بنضيف فترة فارغة بره الشهر وخلاص — بنقسّص آخر فترة نصين. كده النتيجة
   * سليمة على طول (ترتيب، جوه الشهر، من غير فجوة) والأدمن بيعدّل التواريخ لو
   * عايز غير كده. أول ضغطة من حالة «بلا تقسيم» بتعمل فترة واحدة على الشهر كله.
   */
  const addPlanWeek = () => {
    setPlanDraft((p) => {
      if (!p || p.weeks.length >= MAX_WEEKS_PER_MONTH) return p;
      const last = p.weeks[p.weeks.length - 1];
      if (!last) {
        return { ...p, weeks: [{ index: 1, start: p.monthStart, end: p.monthEnd }] };
      }
      const lastLen = spanDays(last.start, last.end);
      // آخر فترة يوم واحد: مفيش نص يتقسم. بنقول للأدمن السبب بدل ما نعمل
      // فترة تانية بتقاطع الأولى أو ضغطة مش هتعمل حاجة.
      if (lastLen < 2) {
        setPlanErrors([`الفترة الأخيرة (${weekLabel(last)}) يوم واحد — وسّعها الأول عشان نقدر نقسّمها`]);
        return p;
      }
      const firstHalfEnd = addDays(last.start, Math.floor(lastLen / 2) - 1);
      return {
        ...p,
        weeks: [
          ...p.weeks.slice(0, -1),
          { ...last, end: firstHalfEnd },
          { index: p.weeks.length + 1, start: addDays(firstHalfEnd, 1), end: last.end },
        ],
      };
    });
    setWeekCountInput(String((planDraft?.weeks.length || 0) + 1));
    setPlanErrors([]);
  };

  /**
   * «بلا تقسيم»: يمسح التقسيم كله.
   *
   * مش حذف بيانات — سطور التوقع نفسها بتفضل زي ما هي في القاعدة. الفرق إن
   * الصفحة هتعرض التوقع الشهري المستقل بس، وأي سطر أسبوعي قديم يبقى معلّق
   * لإشعار الأدمن (نفس سلوك تصغير الشهر).
   */
  const clearPlanWeeks = () => {
    setPlanDraft((p) => (p ? { ...p, weeks: [] } : p));
    setWeekCountInput('0');
    setPlanErrors([]);
  };

  const removePlanWeek = (index: number) => {
    setPlanDraft((p) => {
      if (!p || p.weeks.length <= 1) return p;
      const removed = p.weeks.find((w) => w.index === index);
      const weeks = p.weeks
        .filter((w) => w.index !== index)
        .map((w, i) => ({ ...w, index: i + 1 }));
      // حذف أسبوع بيخلي الشهر مش مكتمل، فنقفل الفجوة اللي سببه الحذف: نمدّد
      // الأسبوع اللي قبله لحد نهاية الأسبوع المحذوف، أو نمدّد الأول لبداية
      // الشهر لو كان المحذوف هو الأول. من غير كده يبقى يوم أو أكتر من غير تغطية.
      const prevIdx = weeks.findIndex((w) => w.index === index - 1);
      if (removed && prevIdx >= 0) {
        weeks[prevIdx] = { ...weeks[prevIdx], end: removed.end };
      } else if (removed && weeks.length > 0 && weeks[0].start > p.monthStart) {
        weeks[0] = { ...weeks[0], start: p.monthStart };
      }
      return { ...p, weeks };
    });
    setWeekCountInput(String(Math.max(MIN_WEEKS_PER_MONTH, (planDraft?.weeks.length || 1) - 1)));
    setPlanErrors([]);
  };

  const handleSavePlan = async () => {
    if (!planDraft) return;
    // بننضّف الأسماء قبل التحقق: مسافات زيادة أو اسم فاضي لازم يتشال قبل ما
    // يتخزن، ومتنسجلوش كـundefined في الـjsonb.
    const cleaned: ForecastMonthPlan = { ...planDraft, weeks: normalizeWeekLabels(planDraft.weeks) };
    const check = validateMonthPlan(cleaned);
    if (!check.valid) {
      setPlanErrors(check.errors);
      return;
    }
    await saveForecastPlan(cleaned);
    const savedCount = cleaned.weeks.length;
    setShowPlanEditor(false);
    setPlanDraft(null);
    setPlanErrors([]);
    setSavedFlash(`تم حفظ تقسيم الشهر: ${weekCountLabel(savedCount)} ✅`);
    setTimeout(() => setSavedFlash(''), 3500);
  };

    /** قفل/فتح الشهر — للأدمن والمطوّر بس، والرسالة بوضوح عشان مفيش مفاجآت. */
  const togglePlanClosed = async () => {
    const nextClosed = !plan.isClosed;
    const ok = window.confirm(
      nextClosed
        ? `قفل شهر ${formatMonthLabel(monthKey)}؟\n\nكل المندوبين والمشرفين هيبقوا ما يقدروش يعدّلوا في التوقعات لحد ما تفتح الشهر تاني.`
        : `فتح شهر ${formatMonthLabel(monthKey)} تاني؟\n\nهيقدر أي حد يعدّل في التوقعات من جديد.`
    );
    if (!ok) return;
    await saveForecastPlan({ ...plan, isClosed: nextClosed });
    setSavedFlash(nextClosed ? 'تم قفل الشهر 🔒' : 'تم فتح الشهر من جديد 🔓');
    setTimeout(() => setSavedFlash(''), 3500);
  };

  /* ---------- حالة كل أسبوع لكل مندوب (أضعف حالة في الأسبوع تغلب) ---------- */
  /* أسبوع واحد فيه سطر واحد لسه مسودة = الأسبوع كله لسه مفتوح عند المشرف.
     عشان كده بنجمع كل الحالات وناخد الأضعف، مش حالة أول صف في الجدول.
     السطر الشهري (0) داخل في الخريطة عن قصد — ليه نفس دورة الاعتماد. */
  const weekStatusByRep = useMemo(() => {
    const map = new Map<string, ForecastStatus[]>();
    visibleForecasts.forEach((f) => {
      const key = `${f.repId}::${f.weekIndex}`;
      const list = map.get(key) || [];
      list.push(f.status);
      map.set(key, list);
    });
    return map;
  }, [visibleForecasts]);

  const weakestStatusFor = (repId: string, weekIndex: number): ForecastStatus | '' => {
    const list = weekStatusByRep.get(`${repId}::${weekIndex}`);
    if (!list || list.length === 0) return '';
    if (list.includes('change_requested')) return 'change_requested';
    if (list.includes('draft')) return 'draft';
    if (list.includes('submitted')) return 'submitted';
    return 'approved';
  };

/* ---------- اعتماد التوقعات: المندوب بيبعت، والمشرف يعتمد أو يرجّع ---------- */
  const handleSubmitWeek = async (repId: string, weekIndex: number) => {
    const changed = await submitForecastWeek(monthKey, weekIndex, repId);
    const label = forecastSlotLabel(weekIndex, weeks);
    setSavedFlash(
      changed > 0 ? `تم إرسال ${label} للمشرف ✅` : `مفيش صفوف ${label} مبعوتة بعد`
    );
    setTimeout(() => setSavedFlash(''), 3000);
  };

  const handleApproveWeek = async (repId: string, weekIndex: number) => {
    const changed = await approveForecastWeek(monthKey, weekIndex, repId);
    const label = forecastSlotLabel(weekIndex, weeks);
    setSavedFlash(
      changed > 0 ? `تم اعتماد ${label} وقفل الأرقام 🔒` : `مفيش صفوف ${label} تختص`
    );
    setTimeout(() => setSavedFlash(''), 3000);
  };

  const handleRequestChange = async () => {
    if (!changeNoteTarget || !changeNote.trim()) return;
    const { repId, weekIndex } = changeNoteTarget;
    await requestForecastChange(monthKey, weekIndex, repId, changeNote.trim());
    setChangeNoteTarget(null);
    setChangeNote('');
    const label = forecastSlotLabel(weekIndex, weeks);
    setSavedFlash(`تم رجوع ${label} للمندوب للتعديل ✅`);
    setTimeout(() => setSavedFlash(''), 3000);
  };

  const openCommentModal = (c: Customer) => {
    setCommentTarget(c);
    const existing = commentByCode.get(c.code || '');
    setCommentKind(existing?.kind || 'defaulted');
    setCommentBody(existing?.body || '');
  };

  const parseMonthlyPaste = (text: string) => {
  const customerByCode = new Map(customers.map((c) => [String(c.code || '').trim().toUpperCase(), c]));
  const rows: Array<{ code: string; amount: number; customer: Customer | null }> = [];

  for (const rawLine of text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
  // Excel/WhatsApp may remove tabs and line breaks, leaving values like
  // CUST000129200,000CUST003754300,000. Recover each CUST code and the
  // amount up to the next code before applying the regular two-column parser.
  const codeMatches = [...rawLine.matchAll(/CUST\d+/gi)];
  if (codeMatches.length > 0) {
  codeMatches.forEach((match, index) => {
  const code = match[0].toUpperCase();
  const amountText = rawLine.slice(match.index! + match[0].length, codeMatches[index + 1]?.index ?? rawLine.length);
  const amount = Number(amountText.replace(/[^0-9.-]/g, '')) || 0;
  rows.push({ code, amount, customer: customerByCode.get(code) || null });
  });
  continue;
  }

  const parts = rawLine.split(/[\t,;]+/).map((part) => part.trim()).filter(Boolean);
  const code = parts[0] || '';
  const amount = Number(String(parts[1] || '').replace(/[^0-9.-]/g, '')) || 0;
  rows.push({ code, amount, customer: customerByCode.get(code.toUpperCase()) || null });
  }

  return rows.filter((row) => row.code);
  };

  const handlePasteMonthlyPreview = (text: string) => {
    setPasteMonthlyText(text);
    setPasteMonthlyPreview(parseMonthlyPaste(text));
  };

  const handleSavePastedMonthly = async () => {
    const rows = pasteMonthlyPreview.filter((row) => row.customer && row.amount >= 0);
    for (const row of rows) await commitMonthCell(row.customer!, String(row.amount));
    setShowPasteMonthly(false);
    setPasteMonthlyText('');
    setPasteMonthlyPreview([]);
    setSavedFlash(`تم حفظ ${rows.length} توقع شهري من البيانات المنسوخة`);
    setTimeout(() => setSavedFlash(''), 3500);
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

  // المقترح بيتحسب من المدة الفعلية اللي الأدمن كتبها في المودال: كتل 7 أيام،
  // مقصوصة بين الحد الأدنى والأعلى. مش رقم ثابت 4/5.
  const spanLength = spanDays(planDraft?.monthStart || '', planDraft?.monthEnd || '');
  const suggestedCount = suggestedWeekCountForSpan(spanLength);

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
                <span>توقعات التحصيل</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-xs font-bold">
                نسخة خفيفة وسريعة ⚡
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <span>جدول التوقع الأسبوعي والشهري</span>
              <span className="text-emerald-400 font-mono text-base">({formatMonthLabel(monthKey)})</span>
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              من جدول العملاء: الاسم والكود والمديونية وإجمالي المستحقات، مع التوقع الأسبوعي والتقسيم الشهري المستقل للأدمن.
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
                onClick={togglePlanClosed}
                title={plan.isClosed ? 'فتح الشهر من جديد للكل' : 'قفل الشهر ومنع التعديل على كل الأدوار'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-black shadow-sm transition cursor-pointer ${
                  plan.isClosed ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-600 hover:bg-slate-500'
                }`}
              >
                {plan.isClosed ? <LockOpen className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{plan.isClosed ? 'الشهر مقفول' : 'قفل الشهر'}</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={openPlanEditor}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-black shadow-sm transition cursor-pointer"
                title="تحديد بداية ونهاية الشهر ونهاية كل أسبوع (الأدمن والمطوّر فقط)"
              >
                <CalendarDays className="w-4 h-4" />
                <span>تقسيم الفترات</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowPasteMonthly(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-sm transition cursor-pointer"
              title="لصق كود العميل والمبلغ الشهري من واتساب أو إكسل"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>لصق توقعات شهرية</span>
            </button>

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

        {/* No-division banner — الشهر على التوقع الشهري المستقل لوحده */}
        {weeksCount === 0 && (
          <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-[11.5px] font-bold text-slate-200">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              الشهر ده مش متقسم لفترات — الجدول بيعرض التوقع الشهري المستقل بس. لو عايز
              فترات، افتح «تقسيم الفترات» واختار أي عدد من 1 لغاية {MAX_WEEKS_PER_MONTH} (أو
              سيبه على 0).
            </span>
          </div>
        )}

        {/* Weeks Range Visual Strip */}
        {weeksCount > 0 && (
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
                {weekLabel(w)}: {formatWeekRange(w)}
                {isCurrent && <span className="mr-1 text-slate-950">● الفترة الحالية</span>}
              </span>
            );
          })}
        </div>
        )}
      </section>

      {/* Notification Toast */}
      {savedFlash && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-black shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{savedFlash}</span>
        </div>
      )}

      {/* شهر مقفول — العرض بيفضل موجود والكتابة مقفولة */}
      {plan.isClosed && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 text-xs font-bold shadow-sm">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-black">
              شهر {formatMonthLabel(monthKey)} مقفول {isAdmin ? '' : '— التعديل متوقف'}
            </span>
            <p className="text-[10.5px] text-slate-300 leading-relaxed">
              {isAdmin
                ? 'أنت أدمن، فتقدر تعدّل عادي وتفتح الشهر من جديد من زرار «الشهر مقفول» فوق.'
                : 'الأرقام اتقفلت بعد اعتماد المشرف. لو محتاج تعديل، كلّم المشرف أو الأدمن يفتح الشهر.'}
            </p>
          </div>
        </div>
      )}

      {/* سطور معلّقة: أرقام كتبت في أسبوع بقى خارج التقسيم الحالي */}
      {orphanForecasts.length > 0 && (
        <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-amber-50 text-amber-950 border border-amber-300 text-xs font-bold shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-black">
              في {orphanForecasts.length} سطر توقّع ({formatCurrency(orphanTotal)}) لفترة مش داخل في تقسيم الشهر الحالي
            </span>
            <p className="text-[10.5px] text-amber-800 leading-relaxed">
              غالباً ده لأن التقسيم اتصغّر أو اتشال بعد ما الأرقام كتبت. السطور دي مش متحسبة في
              أي رقم بالصفحة عشان متظهرش أرقام مش موجودة للعين. لو عايز ترجّعها، افتح «تقسيم
              الفترات» ووسّع الشهر تاني.
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Executive KPI Cards Summary (خفيفة جداً ومحسوبة بالذاكرة)             */}
      {/* ========================================================================= */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>التوقع الشهري المستقل</span>
            <CalendarCheck className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-base sm:text-lg font-black text-teal-800 mt-1 font-mono">
            {formatCurrency(kpiTotals.plannedTotal)}
          </div>
          <div className="text-[10.5px] text-slate-500 font-bold mt-0.5">
            {kpiTotals.hasExplicitMonth ? (
              <>مجموع الأسابيع: <span className="text-slate-700 font-black">{formatCurrency(kpiTotals.weeklyTotal)}</span></>
            ) : (
              <>لسه محدش كتب رقم شهري — الرقم ده مجموع الأسابيع</>
            )}
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
            نسبة التغطية: <span className="text-emerald-700 font-black">{kpiTotals.coverage}%</span>
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
            فارق التوقع: {formatCurrency(kpiTotals.plannedTotal - kpiTotals.actualCollection)}
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
            {debtOnly ? 'اللي عليهم مستحقات > 0' : 'إجمالي شبكة التوزيع'} ({scopedCustomers.length})
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
          value={supervisorFilter}
          onChange={(e) => setSupervisorFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
        >
          <option value="ALL">كافة المشرفين ({supervisorOptions.length})</option>
          {supervisorOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>

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

        {weeksCount > 0 && (
        <select
          value={weekFilter}
          onChange={(e) => setWeekFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
        >
          <option value="ALL">كافة الفترات ({weeksCount})</option>
          {weeks.map((w) => (
            <option key={w.index} value={String(w.index)}>
              {weekLabel(w)} ({formatWeekRange(w)})
            </option>
          ))}
        </select>
        )}

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white cursor-pointer"
        >
          <option value="ALL">كل التصنيفات</option>
          <option value="eligible">قابل للتعامل فقط</option>
          <option value="blocked">غير قابل للتعامل فقط</option>
        </select>

        <button
          type="button"
          onClick={() => setDebtOnly((v) => !v)}
          title="عرض اللي عليهم مستحقات أكبر من صفر فقط، بناءً على بيانات جدول العملاء"
          className={`px-3 py-2 rounded-xl text-xs font-black border transition cursor-pointer flex items-center gap-1.5 ${
            debtOnly
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>{debtOnly ? 'اللي عليهم مستحقات' : 'كل العملاء'}</span>
        </button>

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
                {/* مفيش عمود رقم عن قصد: الكود هو أول عمود وعنوانه فوق خانة
                    الكود على طول، فمفيش أي سبب يخلي الصف ينزلق تحت عنوان غلط. */}
                <th className="p-3">كود العميل</th>
                <th className="p-3 min-w-[200px]">اسم العميل</th>
                <th className="p-3">المندوب والفرع</th>
                <th className="p-3 text-rose-300">المديونية</th>
                <th className="p-3 text-amber-300">إجمالي المستحقات</th>
                <th className="p-3 text-center whitespace-nowrap">قابل / غير</th>
                <th className="p-3 text-center whitespace-nowrap min-w-[110px]">
                  <div>عدد الزيارات</div>
                  <span className="text-[9.5px] font-normal text-slate-400 block">منفّذة / الإجمالي</span>
                </th>
                <th className="p-3 text-center whitespace-nowrap">آخر زيارة</th>
                {shownWeeks.map((w) => (
                  <th
                    key={w.index}
                    className="p-3 text-center whitespace-nowrap min-w-[105px] max-w-[160px]"
                    title={weekLabel(w)}
                  >
                    <div className="truncate">{weekLabel(w)}</div>
                    <span className="text-[9.5px] font-normal text-slate-400 block font-mono">
                      {w.start.slice(5)} إلى {w.end.slice(5)}
                    </span>
                  </th>
                ))}
                <th className="p-3 text-teal-300 text-center whitespace-nowrap min-w-[130px]">
                  <div className="flex items-center justify-center gap-1">
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>متوقع شهري مستقل</span>
                  </div>
                  <span className="text-[9.5px] font-normal text-slate-400 block font-mono">
                    رقم لوحده — مش مجموع الأسابيع
                  </span>
                </th>
                <th className="p-3 text-emerald-300 text-center">مجموع الأسابيع</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageCustomers.map((c) => {
                const balance = resolveCustomerBalanceValue(c);
                const dues = resolveCustomerDuesValue(c);
                const weekSum = forecastTotalsByCustomer.get(c.id) || 0;
                const repName = c.salesRepName || c.repName || 'المندوب';
                const branchName = c.branchName || 'الفرع';
                const returnInfo = returnsByCode.get(c.code || '');
                const commentRecord = commentByCode.get(c.code || '');
                const fin = calculateCustomerFinancials(c, 'ALL');

                // نص تصنيف الشيت كما هو. لو الخانة فاضية في الشيت بنبقى عند
                // قابل/غير بس — وده برضه زي ما الشيت بيقوله، مش تخمين.
                const sheetClassificationText =
                  fin.sheetClassificationLabel?.trim() ||
                  (fin.isEligible ? 'قابل' : 'غير');

                const visitStats = visitStatsByCustomer.get(c.id);

                return (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
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

                    {/* التصنيف — خانة واحدة بس: قابل / غير، زي ما الشيت مكتوب.
                        إعادة صياغة العمود هنا هي بالظبط اللي بتخلي الشاشة تقول حاجات
                        الشيت ما قالهاش (cell مكتوب فيه «قابل» بيتعرض «قابل للتعامل»)،
                        فبنعرض خام الأعمدة في خانة مستقلة ونكتفي باللون للتمييز.
                        حالة المتعامل مش معروضة في الصفحة دي خالص، والفلتر بيمسّها كمان. */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-black text-[11px] border inline-block ${
                          fin.isEligible
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}
                        title={`تصنيف الشيت: ${sheetClassificationText}`}
                      >
                        {sheetClassificationText}
                      </span>
                    </td>


                    {/* عدد الزيارات — منفّذة من الإجمالي */}
                    <td className="p-3 text-center whitespace-nowrap">
                      {visitStats && visitStats.count > 0 ? (
                        <span
                          className={`px-2 py-0.5 rounded-lg font-black text-[11px] font-mono border inline-block ${
                            visitStats.completed > 0
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-100 text-slate-600 border-slate-300'
                          }`}
                          title={`${visitStats.completed} زيارة منفّذة من إجمالي ${visitStats.count}`}
                        >
                          {visitStats.completed} / {visitStats.count}
                        </span>
                      ) : (
                        <span className="text-slate-300" title="لا توجد زيارات مسجلة">—</span>
                      )}
                    </td>

                    {/* آخر زيارة */}
                    <td className="p-3 text-center whitespace-nowrap">
                      {(() => {
                        const last = lastVisitFor(c);
                        if (!last) return <span className="text-slate-300">—</span>;
                        return (
                          <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                            {last}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Week Input Cells */}
                    {shownWeeks.map((w) => {
                      const recKey = `${c.id}::${w.index}`;
                      const rec = forecastByCustomerAndWeek.get(recKey);
                      const baseRec = recordFor(c, w.index);
                      const editable = canWriteOwnForecast(currentUser, baseRec, users) && !planLocked;
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

                    {/* التوقع الشهري المستقل — رقم بيكتبه المندوب لوحده */}
                    {(() => {
                      const recKey = `${c.id}::${MONTH_FORECAST_INDEX}`;
                      const rec = monthForecastByCustomer.get(c.id);
                      const baseRec = monthRecordFor(c);
                      const editable = canWriteOwnForecast(currentUser, baseRec, users) && !planLocked;
                      const locked = isLockedForEditing(baseRec, currentUser);
                      const currentVal =
                        draft[recKey] !== undefined ? draft[recKey] : (rec ? String(rec.collectionForecast || '') : '');
                      // لو مفيش سطر شهري محفوظ، بنورّيه مجموع الأسابيع بس بلون
                      // مختلف — كده المستخدم يفهم إن ده مش رقم مستقل بعد.
                      const isDerived = !rec && weekSum > 0;

                      return (
                        <td className="p-2 text-center whitespace-nowrap bg-teal-50/30">
                          <input
                            type="number"
                            min={0}
                            disabled={!editable || locked}
                            value={currentVal}
                            placeholder={weekSum > 0 ? String(weekSum) : '0'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraft((prev) => ({ ...prev, [recKey]: val }));
                            }}
                            onBlur={(e) => {
                              commitMonthCell(c, e.target.value);
                            }}
                            title={locked ? 'معتمد ومثبت من المشرف' : 'التوقع الشهري — رقم مستقل عن الأسابيع'}
                            className={`w-28 px-2 py-1 rounded-xl text-center font-mono font-black text-xs border transition ${
                              locked
                                ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                                : isDerived
                                ? 'bg-teal-50 text-teal-900 border-teal-300 border-dashed'
                                : 'bg-teal-100 text-teal-950 border-teal-400 focus:outline-none'
                            }`}
                          />
                          {isDerived && (
                            <span className="block text-[9px] font-bold text-teal-600 mt-0.5" title="لسه مجموع الأسابيع — اكتب رقمك المستقل">
                              محسوب من الأسابيع
                            </span>
                          )}
                        </td>
                      );
                    })()}

                    {/* مجموع الأسابيع — مقارنة صريحة بالرقم الشهري المكتوب */}
                    <td className="p-3 text-center font-mono font-black text-emerald-700 whitespace-nowrap bg-emerald-50/40">
                      {weekSum > 0 ? formatCurrency(weekSum) : '—'}
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
                  <td colSpan={11 + shownWeeks.length} className="p-8 text-center">
                    <div className="space-y-2">
                      <p className="text-slate-400 font-bold text-xs">لا يوجد عملاء مطابقين للبحث والفلاتر المحددة حالياً.</p>
                      {/* الرسالة بتقول السبب الحقيقي للمشكلة بدل ما تسيب المستخدم يفكر
                          إن مفيش عملاء أصلاً — فلتر المستحقات والفلتر التصنيفي هم
                          أكثر سببين يخفيوا الشبكة. */}
                      {scopedCustomers.length > 0 && debtOnly && (
                        <p className="text-slate-500 font-bold text-[11px]">
                          في {scopedCustomers.length} عميل في نطاقك، بس مفيش ولا واحد عليهم مستحقات أكبر من صفر.
                        </p>
                      )}
                      {(debtOnly || classFilter !== 'ALL' || repFilter !== 'ALL' || deferredSearch.trim()) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDebtOnly(false);
                            setClassFilter('ALL');
                            setRepFilter('ALL');
                            setSearch('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black cursor-pointer"
                        >
                          إعادة ضبط الفلاتر وعرض كل العملاء
                        </button>
                      )}
                    </div>
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
      {/* 2b. شريط الاعتماد حسب الدور: المندوب بيبعت، والمشرف بيPIOتمد أو يرجّع      */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-900 text-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-black">اعتماد التوقعات — دور كل مستخدم</span>
            <span className="text-[11px] font-bold text-slate-400 font-mono">({progress.length} مندوب)</span>
          </div>
          <span className="text-[10.5px] text-slate-400 font-bold">
            {canApprove
              ? 'المشرف ومدير الفرع والإدارة بيحاولوا يعتمدوا أو يرجعوا التوقع للمعديل'
              : 'مندوب بيبعت توقع الأسبوع أو التوقع الشهري للمشرف'}
          </span>
        </div>

        {progress.length === 0 ? (
          <p className="p-6 text-center text-xs font-bold text-slate-400">
            مفيش توقعات مكتوبة لشهر {formatMonthLabel(monthKey)} بعد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-black text-[11px]">
                <tr>
                  <th className="p-2.5">المندوب</th>
                  <th className="p-2.5 text-center">التوقع الشهري</th>
                  <th className="p-2.5 text-center">مجموع الأسابيع</th>
                  <th className="p-2.5 text-center">الهدف</th>
                  <th className="p-2.5 text-center">التغطية</th>
                  <th className="p-2.5 text-center">حالة الأسابيع</th>
                  <th className="p-2.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {progress.map((p) => (
                  <tr key={p.repId || p.repName} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-2.5 font-black text-slate-900 whitespace-nowrap">
                      {p.repName}
                      <span className="block text-[10px] font-normal text-slate-400">{p.branchName}</span>
                    </td>
                    <td className="p-2.5 text-center font-mono font-black text-teal-700 whitespace-nowrap">
                      {p.monthCollection > 0 ? formatCurrency(p.monthCollection) : '—'}
                    </td>
                    <td className="p-2.5 text-center font-mono font-black text-emerald-700 whitespace-nowrap">
                      {formatCurrency(p.weeklyCollection)}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                      {formatCurrency(p.targetCollection)}
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg font-black text-[10px] border inline-block ${
                          p.status === 'ahead'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : p.status === 'on_track'
                            ? 'bg-sky-100 text-sky-800 border-sky-300'
                            : p.status === 'behind'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-slate-100 text-slate-500 border-slate-300'
                        }`}
                      >
                        {p.collectionCoverage}%
                      </span>
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] border ${STATUS_STYLE.approved}`}>
                          معتمد {p.approvedWeeks}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded font-black text-[10px] border ${STATUS_STYLE.submitted}`}>
                          مبعوت {p.submittedWeeks}
                        </span>
                        {p.changeRequestedWeeks > 0 && (
                          <span className={`px-1.5 py-0.5 rounded font-black text-[10px] border ${STATUS_STYLE.change_requested}`}>
                            مطلوب تعديل {p.changeRequestedWeeks}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {(() => {
                          // أسبوع 0 = التوقع الشهري المستقل، وعنده نفس دورة الاعتماد بالظبط.
                          const weekByIndex = new Map(weeks.map((wk) => [wk.index, wk]));
                          const slots = [MONTH_FORECAST_INDEX, ...weeks.map((w) => w.index)];
                          return slots.map((w) => {
                            const week = weekByIndex.get(w);
                            const label =
                              w === MONTH_FORECAST_INDEX ? 'شهري' : week ? weekLabel(week) : `أ${w}`;
                            const weekValue =
                              w === MONTH_FORECAST_INDEX
                                ? p.monthCollection
                                : Number(p.weekCollection?.[w] || 0);
                            const status = weakestStatusFor(p.repId, w);
                            return (
                              <div key={w} className="flex items-center gap-1 border border-slate-200 rounded-xl px-1.5 py-1 bg-white">
                                <span className="text-[10px] font-black text-slate-600">{label}</span>
                                <span className="text-[10px] font-mono font-bold text-slate-500">
                                  {weekValue > 0 ? Math.round(weekValue).toLocaleString('ar-EG') : '—'}
                                </span>
                                {status && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-black text-[9.5px] border ${STATUS_STYLE[status] || ''}`}
                                    title={`حالة ${label}: ${STATUS_LABEL[status] || ''}`}
                                  >
                                    {STATUS_LABEL[status] || status}
                                  </span>
                                )}
                                {!canApprove && !planLocked && (
                                  <button
                                    type="button"
                                    onClick={() => handleSubmitWeek(p.repId, w)}
                                    className="px-1.5 py-0.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black cursor-pointer"
                                    title="إرسال التوقع للمشرف"
                                  >
                                    <Send className="w-3 h-3" />
                                  </button>
                                )}
                                {canApprove && !planLocked && status !== '' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveWeek(p.repId, w)}
                                      className="px-1.5 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black cursor-pointer"
                                      title="اعتماد التوقع وقفله"
                                    >
                                      <CheckCircle2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setChangeNoteTarget({ repId: p.repId, weekIndex: w });
                                        setChangeNote('');
                                      }}
                                      className="px-1.5 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-[10px] font-black cursor-pointer"
                                      title="طلب تعديل من المندوب"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showPasteMonthly && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3" dir="rtl">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base">لصق توقعات شهرية</h3>
                <p className="text-[11px] text-slate-300 mt-1">انسخ عمودين من واتساب أو إكسل: كود العميل ثم المبلغ الشهري</p>
              </div>
              <button type="button" onClick={() => setShowPasteMonthly(false)} className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 cursor-pointer" aria-label="إغلاق">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={pasteMonthlyText}
                onChange={(e) => handlePasteMonthlyPreview(e.target.value)}
                placeholder={'مثال:\n10025\t15000\n10026\t8500'}
                className="w-full min-h-36 rounded-2xl border border-slate-300 p-3 text-sm font-mono focus:outline-none focus:border-amber-500"
                aria-label="بيانات التوقعات المنسوخة"
              />
              {pasteMonthlyPreview.length > 0 && (
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-black">المراجعة قبل الحفظ ({pasteMonthlyPreview.length} سطر)</div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                    {pasteMonthlyPreview.map((row, index) => (
                      <div key={`${row.code}-${index}`} className="px-3 py-2 flex items-center justify-between text-xs">
                        <span className="font-mono font-bold">{row.code}</span>
                        <span className={row.customer ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}>
                          {row.customer ? `${row.customer.name} — ${formatCurrency(row.amount)}` : 'كود غير موجود'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowPasteMonthly(false)} className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-black cursor-pointer">إلغاء</button>
                <button type="button" disabled={!pasteMonthlyPreview.some((row) => row.customer)} onClick={handleSavePastedMonthly} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black cursor-pointer">مطابقة وحفظ التوقعات</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. Complete Customer Dossier Modal (نفس تفاصيل كافه العملاء والزيارات)       */}
      {/* ========================================================================= */}
      {selectedCustomerDetail && (() => {
        const c = selectedCustomerDetail;
        const fin = calculateCustomerFinancials(c, 'ALL');
        // الزيارات الحديثة محفوظة في جدول الزيارات العام، بينما قديمًا كانت
        // تُنسخ داخل customer.visitHistory. اعرض المصدرين مع إزالة التكرار
        // حتى لا يظهر عدّاد الزيارات في الجدول بدون تفاصيل داخل الملف.
        const customerVisitsList = Array.from(
          new Map(
            [
              ...(c.visitHistory || []),
              ...(visits || []).filter((v) => {
                const sameCustomer =
                  v.customerId === c.id ||
                  (!!c.code && v.customerCode === c.code) ||
                  (!!c.name && v.customerName === c.name);
                return sameCustomer;
              }),
            ].map((visit) => [visit.id, visit] as const)
          ).values()
        ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
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
      {/* 6b. Week-plan editor — الأدمن والمطوّر فقط (يقسم الشهر على أي عدد فترات) */}
      {/* ========================================================================= */}
      {showPlanEditor && planDraft && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto border border-slate-200 space-y-4">
            <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between rounded-t-3xl z-10 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-violet-500/20 text-violet-400 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">تقسيم الشهر على الفترات (اختياري)</h3>
                  <p className="text-[11px] text-slate-300">
                    {formatMonthLabel(planDraft.id)} — أنت بتحدد بداية ونهاية الشهر وكل أسبوع
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPlanEditor(false);
                  setPlanDraft(null);
                  setPlanErrors([]);
                }}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Month boundaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="font-black text-slate-700 block mb-1">بداية الشهر</span>
                  <input
                    type="date"
                    value={planDraft.monthStart}
                    onChange={(e) => {
                      setPlanDraft((p) => (p ? { ...p, monthStart: e.target.value } : p));
                      setPlanErrors([]);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:border-violet-500"
                  />
                </label>
                <label className="block">
                  <span className="font-black text-slate-700 block mb-1">نهاية الشهر</span>
                  <input
                    type="date"
                    value={planDraft.monthEnd}
                    onChange={(e) => {
                      setPlanDraft((p) => (p ? { ...p, monthEnd: e.target.value } : p));
                      setPlanErrors([]);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:border-violet-500"
                  />
                </label>
              </div>

              {/* Flexible week-count picker — أي عدد من 1 لغاية MAX */}
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="font-black text-violet-900 block">
                      عدد فترات الشهر (مش لازم 4)
                    </span>
                    <span className="text-[11px] text-violet-700">
                      {/* المقترح بيتحسب من المدى اللي ظاهر فوق مش من الشهر التقويمي —
                          لو الأدمن غيّر بداية/نهاية الشهر، المقترح لازم يتبعه. */}
                      مقترح تلقائياً: {weekCountLabel(suggestedCount)} — المدى {spanLength} يوم
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={clearPlanWeeks}
                      disabled={planDraft.weeks.length === 0}
                      className={`px-3 py-1.5 rounded-xl font-black transition cursor-pointer border disabled:opacity-40 disabled:cursor-not-allowed ${
                        planDraft.weeks.length === 0
                          ? 'bg-slate-800 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                      title="مفيش تقسيم خالص — التوقع الشهري المستقل لوحده"
                    >
                      بلا تقسيم
                    </button>
                    {[1, 2, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => applyWeekCount(n)}
                        className={`px-3 py-1.5 rounded-xl font-black transition cursor-pointer border ${
                          planDraft.weeks.length === n
                            ? 'bg-violet-600 text-white border-violet-700'
                            : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-100'
                        }`}
                        title={
                          n === 1
                            ? 'أسبوع واحد بيغطي الشهر كله — التوقع الشهري بس'
                            : n === 2
                            ? 'أسبوعين: نص شهر ونص'
                            : `${weekCountLabel(n)} بالتساوي`
                        }
                      >
                        {weekCountLabel(n)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={applySuggestedSplit}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black transition cursor-pointer flex items-center gap-1"
                      title="إعادة التقسيم المقترح: كل فترة 7 أيام"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>افتراضي</span>
                    </button>
                  </div>
                </div>

                {/* أي رقم تاني: خانة عدد حرة بين 1 و MAX */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-violet-200/70">
                  <label className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black text-violet-900">أي عدد تاني:</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={NO_WEEK_DIVISION}
                      max={MAX_WEEKS_PER_MONTH}
                      value={weekCountInput}
                      onChange={(e) => {
                        setWeekCountInput(e.target.value);
                        setPlanErrors([]);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyWeekCountInput();
                      }}
                      className="w-20 px-2 py-1.5 rounded-lg border border-violet-300 text-xs font-black text-center focus:outline-none focus:border-violet-500"
                    />
                    <span className="text-[11px] font-bold text-violet-700">
                      0 = بلا تقسيم، ومن {MIN_WEEKS_PER_MONTH} لغاية {MAX_WEEKS_PER_MONTH}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={applyWeekCountInput}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black transition cursor-pointer"
                  >
                    تطبيق
                  </button>
                  <span
                    className={`text-[11px] font-black rounded-lg px-2 py-1 border ${
                      planDraft.weeks.length === 0
                        ? 'bg-slate-800 text-white border-slate-900'
                        : 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    }`}
                  >
                    {planDraft.weeks.length === 0
                      ? 'التقسيم الحالي: مفيش تقسيم'
                      : `التقسيم الحالي: ${weekCountLabel(planDraft.weeks.length)}`}
                  </span>
                </div>

                <p className="text-[10.5px] text-violet-700 leading-relaxed">
                  أي عدد بيعمل بالتساوي على مدى الشهر، وبعدين تقدر تزحزح بداية ونهاية أي فترة
                  بالأسفل. التقسيم اختياري بالكامل: «بلا تقسيم» أو 0 بيخلي الصفحة تشتغل على
                  التوقع الشهري المستقل لوحده، ومش لازم الفترات تغطي أيام الشهر كلها.
                </p>
              </div>

              {/* Week rows */}
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-3 bg-slate-100 border-b border-slate-200 font-black text-slate-800 flex items-center justify-between">
                  <span>تواريخ الفترات (بتعديل يدوي)</span>
                  <button
                    type="button"
                    onClick={addPlanWeek}
                    disabled={planDraft.weeks.length >= MAX_WEEKS_PER_MONTH}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                    title={`بيقسّص آخر فترة نصين (الحد الأقصى ${MAX_WEEKS_PER_MONTH} فترات)`}
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span>قسّم آخر فترة نصين</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-600 font-black text-[11px]">
                      <tr>
                        <th className="p-2.5 w-14">رقم</th>
                        <th className="p-2.5 min-w-[150px]">
                          اسم الفترة
                          <span className="block text-[9.5px] font-normal text-slate-400">
                            اختياري — فاضي يعني «أسبوع 1»
                          </span>
                        </th>
                        <th className="p-2.5">من تاريخ</th>
                        <th className="p-2.5">إلى تاريخ</th>
                        <th className="p-2.5 text-center w-16">الأيام</th>
                        <th className="p-2.5 text-center w-16">إزالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {planDraft.weeks.map((w) => {
                        const len =
                          (new Date(w.end).getTime() - new Date(w.start).getTime()) / 86400000 + 1;
                        return (
                          <tr key={w.index} className="hover:bg-slate-50/70">
                            <td className="p-2.5 font-black text-violet-700">أ{w.index}</td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={w.label || ''}
                                maxLength={MAX_WEEK_LABEL_LENGTH}
                                placeholder={`أسبوع ${w.index}`}
                                onChange={(e) => updatePlanWeekLabel(w.index, e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="date"
                                value={w.start}
                                onChange={(e) => updatePlanWeek(w.index, 'start', e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="date"
                                value={w.end}
                                onChange={(e) => updatePlanWeek(w.index, 'end', e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold focus:outline-none focus:border-violet-500"
                              />
                            </td>
                            <td className="p-2.5 text-center font-mono font-bold text-slate-600">{len}</td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => removePlanWeek(w.index)}
                                disabled={planDraft.weeks.length <= 1}
                                className="p-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title="حذف هذا الأسبوع (آخر أسبوع يتمدد لتغطية فترته)"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {planErrors.length > 0 && (
                <div className="rounded-2xl bg-rose-50 border border-rose-300 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-rose-900 font-black">
                    <AlertTriangle className="w-4 h-4" />
                    <span>لازم تصحّح قبل الحفظ:</span>
                  </div>
                  <ul className="list-disc pr-5 space-y-0.5 text-rose-800">
                    {planErrors.map((e, i) => (
                      <li key={i} className="text-[11px] font-bold">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <span className="text-[10.5px] text-slate-500 font-bold flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  بعد الاعتماد مش أي حد يقدر يعدّل غير بطلب تعديل من المشرف
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlanEditor(false);
                      setPlanDraft(null);
                      setPlanErrors([]);
                    }}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-600 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePlan}
                    className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black cursor-pointer shadow-sm flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ التقسيم</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6c. طلب تعديل — المشرف يرجّع التوقع للمندوب (تسجيل سبب) */}
      {/* ========================================================================= */}
      {changeNoteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-5 space-y-4 border border-slate-200 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-black text-sm text-slate-900">
                طلب تعديل {changeNoteTarget.weekIndex === MONTH_FORECAST_INDEX ? 'التوقع الشهري' : `في ${forecastSlotLabel(changeNoteTarget.weekIndex, weeks)}`}
              </span>
              <button
                type="button"
                onClick={() => setChangeNoteTarget(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="font-bold text-slate-600 block">سبب التعديل المطلوب:</label>
              <textarea
                rows={3}
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="اكتب للالمندوب إيه اللي محتاج يتظبط في الرقم..."
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setChangeNoteTarget(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-slate-600 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleRequestChange}
                disabled={!changeNote.trim()}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-black cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                رجوع للمندوب للتعديل
              </button>
            </div>
          </div>
        </div>
      )}

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
