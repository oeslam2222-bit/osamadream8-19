import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Search, Building2, Wallet, ShoppingCart, TrendingUp, Trophy, Scale,
  ChevronRight, ChevronLeft, X, Clock, MapPin, CreditCard, Star, Phone,
  AlertTriangle, CheckCircle2, FileText, BarChart3, RefreshCw,
  Plus, Activity, Filter, UserCheck, RotateCcw,
  ArrowUpRight, Image as ImageIcon, CalendarCheck, Check, ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { inferTargetSector } from '../services/targetService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import { optimizeImageUrl } from '../services/cloudinaryService';
import { classifyEligibilityColumn } from '../services/customerFinancialService';
import { getLegalCases, subscribeToLegalCases, referCustomerToLegal, isCustomerReferredToLegal } from '../services/legalAffairsService';
import type { LegalCase } from '../services/legalAffairsService';
import { LegalTransferModal } from './LegalTransferModal';
import customerMerchantAvatar from '../assets/images/customer_merchant_avatar_1794559829020.jpg';
import type { Customer, TargetRecord, User } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const QUARTER_MONTHS: Record<1 | 2 | 3 | 4, number[]> = {
  1: [1, 2, 3],
  2: [4, 5, 6],
  3: [7, 8, 9],
  4: [10, 11, 12],
};

const QUARTER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'الربع الأول Q1 (يناير - مارس)',
  2: 'الربع الثاني Q2 (إبريل - يونيو)',
  3: 'الربع الثالث Q3 (يوليو - سبتمبر)',
  4: 'الربع الرابع Q4 (أكتوبر - ديسمبر)',
};

function fmt(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function pctOf(achieved: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((achieved / target) * 100));
}

function getSectorLabel(s?: string): string {
  if (!s || s === 'all' || s === 'both') return 'غير محدد';
  if (s === 'home') return 'منزلي';
  if (s === 'electrical') return 'كهربائي';
  return s;
}

function getSectorColor(s?: string) {
  if (s === 'home') return 'bg-blue-50 text-blue-800 border border-blue-200';
  if (s === 'electrical') return 'bg-purple-50 text-purple-800 border border-purple-200';
  return 'bg-slate-50 text-slate-600 border border-slate-200';
}

/** توحيد اسم المندوب: القيم الفارغة/الافتراضية بترجع لمسمّى واحد. */
const UNKNOWN_REP_NAME = 'غير محدد';

function normalizeRepName(raw?: string | null): string {
  const name = String(raw || '').trim();
  if (!name || name === 'مندوب غير محدد' || name === 'بدون مندوب') return UNKNOWN_REP_NAME;
  return name;
}

/** مفتاح مطابقة المندوب بعد تطبيع الحروف وإزالة الألقاب/البادئات. */
function repMatchKey(raw?: string | null): string {
  return normalizeArabicText(normalizeRepName(raw))
    .replace(/^(المندوب|مندوب|كود|الاستاذ|استاذ)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** البحث عن حساب المندوب بنفس الاسم/اسم المستخدم مع تجاهل فروق الهمزات والألقاب. */
function findRepUser(users: User[], repName: string): User | undefined {
  const key = repMatchKey(repName);
  if (!key) return undefined;
  return (
    users.find((u) => u?.name && repMatchKey(u.name) === key) ||
    users.find((u) => u?.username && repMatchKey(u.username) === key)
  );
}

interface SmartProfilePageProps {
  mode?: 'customers' | 'reps';
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
  /** مرجع عميل (id / كود / اسم) يُفتح بروفايله تلقائيًا — من شاشة التحليلات مثلًا. */
  focusCustomerId?: string | null;
  /** يستدعى بعد استهلاك الـ focus حتى لا يُعاد فتحه عند الرجوع للصفحة. */
  onFocusConsumed?: () => void;
}

export const SmartProfilePage: React.FC<SmartProfilePageProps> = ({
  mode,
  onOpenNewOrderForCustomer,
  focusCustomerId,
  onFocusConsumed,
}) => {
  const {
    currentUser,
    users,
    customers,
    targets,
    visits: ctxVisits,
    getVisibleTargets,
    getVisibleCustomers,
    getVisibleInvoices,
    getVisibleVisits,
    selectedBranchFilter,
    setSelectedBranchFilter,
  } = useApp();

  const canViewReps = ['admin', 'developer', 'branch_manager', 'supervisor', 'technical_support'].includes(
    currentUser?.role || ''
  );

  /* ---------- حالة الصفحة ---------- */
  const [activeTab, setActiveTab] = useState<'customers' | 'reps'>(() =>
    mode === 'reps' && canViewReps ? 'reps' : 'customers'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [selectedBranch, setSelectedBranch] = useState('الكل');
  const [selectedSupervisor, setSelectedSupervisor] = useState('الكل');
  const [selectedEligibility, setSelectedEligibility] = useState<'all' | 'eligible' | 'ineligible'>('all');
  const [repPeriodMode, setRepPeriodMode] = useState<'all' | 'month' | 'quarter'>('all');
  const [selectedRepMonth, setSelectedRepMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedRepQuarter, setSelectedRepQuarter] = useState<1 | 2 | 3 | 4>(
    () => (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4
  );
  const [selectedRepYear, setSelectedRepYear] = useState<number | 'all'>('all');
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(12);
  const [visibleRepsCount, setVisibleRepsCount] = useState(5);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [openRepId, setOpenRepId] = useState<string | null>(null);
  const [repAnalysisTab, setRepAnalysisTab] = useState<'overview' | 'monthly' | 'visits'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (mode === 'reps' && canViewReps) {
      setActiveTab('reps');
    } else if (mode === 'customers' || !canViewReps) {
      setActiveTab('customers');
    }
  }, [mode, canViewReps]);

  useEffect(() => {
    setVisibleCustomersCount(12);
    setVisibleRepsCount(5);
    setOpenCustomerId(null);
    setOpenRepId(null);
  }, [searchQuery, selectedSector, selectedBranch, selectedSupervisor, selectedEligibility, repPeriodMode, selectedRepMonth, selectedRepQuarter, selectedRepYear, activeTab]);

  /* ---------- البيانات ---------- */
  const allTargets = useMemo(() => getVisibleTargets(), [targets, currentUser, users, customers, getVisibleTargets]);
  const allCustomers = useMemo(() => getVisibleCustomers(), [customers, currentUser, getVisibleCustomers]);
  const allInvoices = useMemo(() => getVisibleInvoices(), [targets, currentUser, getVisibleInvoices]);

  /* ---------- فتح بروفايل عميل محدد من خارج الصفحة (id / كود / اسم) ---------- */
  useEffect(() => {
    if (!focusCustomerId) return;
    const ref = String(focusCustomerId).trim();
    const found = allCustomers.find(
      (c) =>
        c.id === ref ||
        (c.code || '').trim() === ref ||
        normalizeArabicText(c.name || '') === normalizeArabicText(ref)
    );
    const targetId = found ? found.id : ref;
    setActiveTab('customers');
    setOpenCustomerId((prev) => (prev === targetId ? prev : targetId));
    if (onFocusConsumed) onFocusConsumed();
  }, [focusCustomerId, allCustomers]);

  /* ---------- تجميع بيانات المندوبين ---------- */
  type RepProfile = {
    repKey: string;
    repName: string;
    repId: string;
    repUsername?: string;
    branch: string;
    sector: string | undefined;
    supervisor: string;
    salesTarget: number;
    salesAchieved: number;
    collectionTarget: number;
    collectionAchieved: number;
    customerCount: number;
    debt: number;
    overdue: number;
    monthlySales: Record<string, number>;
    monthlyCollection: Record<string, number>;
  };

  const repYearOptions = useMemo(() => {
    const years = new Set<number>();
    allTargets.forEach((t) => {
      const y = Number(t.year);
      if (y > 2000) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [allTargets]);

  const activePeriodLabel = useMemo(() => {
    const yearSuffix = selectedRepYear === 'all' ? '' : ` ${selectedRepYear}`;
    if (repPeriodMode === 'month') return `${MONTHS_AR[selectedRepMonth - 1]}${yearSuffix}`;
    if (repPeriodMode === 'quarter') return `Q${selectedRepQuarter} (${QUARTER_MONTHS[selectedRepQuarter].map((m) => MONTHS_AR[m - 1]).join(' - ')})${yearSuffix}`;
    return selectedRepYear === 'all' ? 'كل الفترات' : `سنة ${selectedRepYear}`;
  }, [repPeriodMode, selectedRepMonth, selectedRepQuarter, selectedRepYear]);

  const repsMap = useMemo(() => {
    const map = new Map<string, RepProfile>();

    // دالة واحدة لإنشاء/تحديث كارت المندوب. المفتاح هو الاسم بعد التطبيع
    // (مش id صف التارجت — الصف بيتكرر لكل شهر وكان بيعمل كارت منفصل لكل شهر
    // وبيفصل بيانات العملاء عن بيانات الأهداف).
    const upsertRep = (
      rawName: string,
      seed?: { branch?: string; sector?: string }
    ): RepProfile => {
      const repName = normalizeRepName(rawName);
      const repKey = repMatchKey(repName) || repName;
      const user = findRepUser(users, repName);

      let entry = map.get(repKey);
      if (!entry) {
        entry = {
          repKey,
          repName,
          repId: user?.id || repKey,
          repUsername: user?.username,
          branch: '—',
          sector: undefined,
          supervisor: 'بدون مشرف',
          salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0,
          customerCount: 0, debt: 0, overdue: 0,
          monthlySales: {}, monthlyCollection: {},
        };
        map.set(repKey, entry);
      }

      if (user) {
        if (user.id) entry.repId = user.id;
        if (user.username) entry.repUsername = user.username;
        const supervisorName =
          user.supervisorName ||
          (user.supervisorId ? users.find((u) => u.id === user.supervisorId)?.name : '') ||
          '';
        if (supervisorName) entry.supervisor = supervisorName;
      }

      if (entry.branch === '—' && seed?.branch && seed.branch !== '—') entry.branch = seed.branch;
      if (!entry.sector && seed?.sector) entry.sector = seed.sector;
      return entry;
    };

    const matchesSelectedPeriod = (t: TargetRecord): boolean => {
      if (selectedRepYear !== 'all' && Number(t.year) !== selectedRepYear) return false;
      const m = Number(t.month);
      if (repPeriodMode === 'month') return m === selectedRepMonth;
      if (repPeriodMode === 'quarter') return QUARTER_MONTHS[selectedRepQuarter].includes(m);
      return true;
    };

    for (const t of allTargets) {
      const entry = upsertRep(t.repName, {
        branch: t.branch || '—',
        sector: inferTargetSector(t, users) || undefined,
      });

      const y = String(t.year);
      const m = String(t.month).padStart(2, '0');
      const monthKey = `${y}-${m}`;
      if (selectedRepYear === 'all' || Number(t.year) === selectedRepYear) {
        entry.monthlySales[monthKey] = (entry.monthlySales[monthKey] || 0) + Number(t.salesAchieved || 0);
        entry.monthlyCollection[monthKey] = (entry.monthlyCollection[monthKey] || 0) + Number(t.collectionAchieved || 0);
      }

      if (matchesSelectedPeriod(t)) {
        entry.salesTarget += Number(t.salesTarget || 0);
        entry.salesAchieved += Number(t.salesAchieved || 0);
        entry.collectionTarget += Number(t.collectionTarget || 0);
        entry.collectionAchieved += Number(t.collectionAchieved || 0);
      }
    }

    for (const c of allCustomers) {
      const entry = upsertRep(c.salesRepName || c.repName || '', {
        branch: c.branchName || '—',
        sector: c.sector || undefined,
      });
      entry.customerCount += 1;
      entry.debt += Number(c.currentBalance ?? c.balance ?? 0);
      entry.overdue += Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
    }

    return Array.from(map.values()).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [allTargets, allCustomers, users, repPeriodMode, selectedRepMonth, selectedRepQuarter, selectedRepYear]);

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    repsMap.forEach((r) => { if (r.branch && r.branch !== '—') set.add(r.branch); });
    return ['الكل', ...Array.from(set).sort()];
  }, [repsMap]);

  const supervisorOptions = useMemo(() => {
    const set = new Set<string>();
    repsMap.forEach((r) => { if (r.supervisor && r.supervisor !== 'بدون مشرف') set.add(r.supervisor); });
    return ['الكل', ...Array.from(set).sort()];
  }, [repsMap]);

  const filteredReps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return repsMap.filter((rep) => {
      const matchesSearch = !q || rep.repName.toLowerCase().includes(q) || (rep.repUsername || '').toLowerCase().includes(q) || rep.repId.toLowerCase().includes(q) || rep.branch.toLowerCase().includes(q);
      const matchesBranch = selectedBranch === 'الكل' || rep.branch === selectedBranch;
      const matchesSupervisor = selectedSupervisor === 'الكل' || rep.supervisor === selectedSupervisor;
      const matchesSector = selectedSector === 'all' || !rep.sector || rep.sector === 'all' || rep.sector === 'both' || rep.sector === selectedSector;
      return matchesSearch && matchesBranch && matchesSupervisor && matchesSector;
    });
  }, [repsMap, searchQuery, selectedBranch, selectedSupervisor, selectedSector]);

  const displayedReps = useMemo(() => filteredReps.slice(0, visibleRepsCount), [filteredReps, visibleRepsCount]);

  /* ---------- تحليلات المناديب: توب 10 + دونات حصة المبيعات + منحنى شهري ---------- */
  const repAnalytics = useMemo(() => {
    const top10 = filteredReps.slice(0, 10);
    const leader = top10[0];
    const totalSales = filteredReps.reduce((s, r) => s + r.salesAchieved, 0);

    const donut = top10.slice(0, 5).map((r) => ({ name: r.repName, value: r.salesAchieved }));
    const othersValue = totalSales - donut.reduce((s, d) => s + d.value, 0);
    if (othersValue > 0) donut.push({ name: 'باقي المناديب', value: othersValue });

    const months = leader ? Object.keys(leader.monthlySales).sort() : [];
    const line = months.map((mk) => ({
      key: mk,
      label: MONTHS_AR[Number(mk.slice(5, 7)) - 1] || mk,
      sales: leader.monthlySales[mk] || 0,
      collection: leader.monthlyCollection[mk] || 0,
    }));

    return { top10, leader, totalSales, donut, line };
  }, [filteredReps]);

  /* ---------- الشؤون القانونية: إحالة العميل + تتبع القضايا ---------- */
  const [legalCases, setLegalCases] = useState<LegalCase[]>([]);
  const [legalTransferCustomer, setLegalTransferCustomer] = useState<Customer | CustomerProfile | null>(null);
  useEffect(() => {
    const unsub = subscribeToLegalCases((c) => setLegalCases(c));
    setLegalCases(getLegalCases());
    return unsub;
  }, []);
  const canTransferToLegal = ['admin', 'branch_manager', 'developer'].includes(currentUser?.role || '');
  const handleTransferToLegal = (cust: Customer | CustomerProfile, reason?: string, transferIcon?: string) => {
    const customerLike = cust as unknown as Customer;
    const res = referCustomerToLegal({
      customer: customerLike,
      referredByName: currentUser?.name || currentUser?.username || 'الإدارة العليا',
      referredByRole: currentUser?.role || 'branch_manager',
      reason: reason || `تعثر العميل ${cust.name} في السداد وتم تجاوز فترة الائتمان المسموح بها — تمت الإحالة للشؤون القانونية.`,
      transferIcon: transferIcon || '😟',
      totalDebt: customerLike.currentBalance ?? customerLike.balance ?? 0,
      overdueAmount: customerLike.totalOverdueAndDue ?? customerLike.overdueBalance ?? 0,
    });
    if (res.success) setLegalCases(getLegalCases());
    return res;
  };
  const isCustomerInLegal = (cust: Customer) => isCustomerReferredToLegal(cust);

  /* ---------- تجميع بيانات العملاء ---------- */
  type CustomerProfile = {
    id: string;
    name: string;
    code: string;
    phone: string;
    branch: string;
    sector: string | undefined;
    repName: string;
    supervisor: string;
    balance: number;
    overdue: number;
    creditLimit: number;
    totalSales: number;
    totalCollections: number;
    tier: string;
    lastVisit?: string;
    lastOrderDate?: string;
    address?: string;
    branchName: string;
    storePhotos: string[];
    avatarUrl: string;
    lastCollectionAmount: number;
    lastCollectionDate?: string;
    returnsCount: number;
    returnsValue: number;
    pendingReturnsCount: number;
    dealEligibility?: string;
    isEligible?: boolean;
    latitude?: number;
    longitude?: number;
    locationAddress?: string;
    locationCapturedAt?: string;
    locationCapturedBy?: string;
    visitHistory?: any[];
    monthlySales2026?: Record<string | number, number>;
    monthlyCollections2026?: Record<string | number, number>;
  };

  const allVisitsList = useMemo(
    () => (getVisibleVisits ? getVisibleVisits() : ctxVisits || []),
    [getVisibleVisits, ctxVisits]
  );

  const customersMap = useMemo(() => {
    const map = new Map<string, CustomerProfile>();
    const invoiceByCustomer = new Map<string, { sales: number; collection: number }>();

    for (const inv of allInvoices) {
      const key = inv.customerId || inv.customerName || 'غير محدد';
      const cur = invoiceByCustomer.get(key) || { sales: 0, collection: 0 };
      cur.sales += Number(inv.estimatedGrandTotal || 0);
      if (inv.paymentMethod === 'نقدي (كاش)') cur.collection += Number(inv.estimatedGrandTotal || 0);
      invoiceByCustomer.set(key, cur);
    }

    const visitsStatsByCustomer = new Map<
      string,
      { collected: number; returnsCount: number; returnsValue: number; pendingReturnsCount: number }
    >();
    const addVisitStat = (key: string | undefined, v: any) => {
      if (!key) return;
      const cur = visitsStatsByCustomer.get(key) || {
        collected: 0,
        returnsCount: 0,
        returnsValue: 0,
        pendingReturnsCount: 0,
      };
      const col = Number(v.collectedAmount || 0);
      if (col > 0) cur.collected += col;
      if (v.isReturn) {
        cur.returnsCount += 1;
        cur.returnsValue += Number(v.returnValue || 0);
        if (v.returnStatus !== 'مغلق' && v.returnStatus !== 'مرفوض') {
          cur.pendingReturnsCount += 1;
        }
      }
      visitsStatsByCustomer.set(key, cur);
    };

    for (const v of allVisitsList) {
      addVisitStat(v.customerId, v);
      if (v.customerCode && v.customerCode !== v.customerId) {
        addVisitStat(v.customerCode, v);
      }
    }

    for (const c of allCustomers) {
      const balance = Number(c.currentBalance ?? c.balance ?? 0);
      const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
      const creditLimit = Number(c.creditLimit ?? 0);
      const inv =
        invoiceByCustomer.get(c.id) ||
        invoiceByCustomer.get(c.code) ||
        invoiceByCustomer.get(c.name) ||
        { sales: 0, collection: 0 };
      const vStats =
        visitsStatsByCustomer.get(c.id) ||
        (c.code ? visitsStatsByCustomer.get(c.code) : undefined) ||
        { collected: 0, returnsCount: 0, returnsValue: 0, pendingReturnsCount: 0 };

      const monthlySalesSum = c.monthlySales2026
        ? Object.values(c.monthlySales2026).reduce((s, val) => s + (Number(val) || 0), 0)
        : 0;
      const monthlyCollSum = c.monthlyCollections2026
        ? Object.values(c.monthlyCollections2026).reduce((s, val) => s + Math.abs(Number(val) || 0), 0)
        : 0;

      const totalSales = Math.max(
        Number(c.sales2026 || 0),
        Number(c.totalMonthlySales || 0),
        Number(c.totalOverallSales || 0),
        monthlySalesSum,
        inv.sales
      );
      const totalCollections = Math.max(
        Number(c.collections2026 || 0),
        Number(c.totalMonthlyCollections || 0),
        Number(c.totalOverallCollections || 0),
        monthlyCollSum,
        inv.collection + vStats.collected
      );

      let supervisor = 'بدون مشرف';
      const repName = normalizeRepName(c.salesRepName || c.repName);
      const user = findRepUser(users, repName);
      if (user?.supervisorName) supervisor = user.supervisorName;
      else if (user?.supervisorId) {
        const sup = users.find((u) => u.id === user.supervisorId);
        if (sup) supervisor = sup.name;
      }

      // تصنيف العميل — من عامود «قابل / غير» حصريًا
      const eligibilityInfo = classifyEligibilityColumn(
        c.dealEligibility || (c as any).deal_eligibility
      );
      const isEligible = eligibilityInfo ? eligibilityInfo.eligible : true;
      const eligibilityLabel = eligibilityInfo?.raw || (isEligible ? 'قابل للتعامل' : 'غير قابل للتعامل');

      const rawPhoto =
        c.locationPhotoUrl ||
        (Array.isArray(c.storePhotos) ? c.storePhotos[0] : '') ||
        c.profileImageUrl ||
        c.avatarUrl ||
        '';
      const avatarUrl = rawPhoto ? optimizeImageUrl(rawPhoto, 200, true) : customerMerchantAvatar;

      map.set(c.id, {
        id: c.id,
        name: c.name || 'غير محدد',
        code: c.code || '—',
        phone: c.phone || '—',
        branch: c.branchName || '—',
        branchName: c.branchName || '—',
        sector: c.sector,
        repName,
        supervisor,
        balance,
        overdue,
        creditLimit,
        totalSales,
        totalCollections,
        tier: c.tier || 'عادي',
        lastOrderDate: c.lastOrderDate || undefined,
        dealEligibility: eligibilityLabel,
        isEligible,
        latitude: c.latitude,
        longitude: c.longitude,
        locationAddress: c.locationAddress,
        locationCapturedAt: c.locationCapturedAt,
        locationCapturedBy: c.locationCapturedBy,
        visitHistory: c.visitHistory,
        monthlySales2026: c.monthlySales2026,
        monthlyCollections2026: c.monthlyCollections2026,
        lastVisit: c.lastCollectionDate || undefined,
        lastCollectionAmount: Number(c.lastCollectionAmount || 0),
        lastCollectionDate: c.lastCollectionDate || undefined,
        returnsCount: vStats.returnsCount,
        returnsValue: vStats.returnsValue,
        pendingReturnsCount: vStats.pendingReturnsCount,
        address: c.address || c.region || '',
        storePhotos: Array.isArray(c.storePhotos) ? c.storePhotos : [],
        avatarUrl,
      });
    }

    return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
  }, [allCustomers, allInvoices, allVisitsList, users]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customersMap.filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || c.phone.includes(q) || c.repName.toLowerCase().includes(q);
      const matchesBranch = selectedBranch === 'الكل' || c.branch === selectedBranch;
      const matchesSupervisor = selectedSupervisor === 'الكل' || c.supervisor === selectedSupervisor;
      const matchesSector = selectedSector === 'all' || !c.sector || c.sector === 'all' || c.sector === 'both' || c.sector === selectedSector;
      const matchesEligibility =
        selectedEligibility === 'all' ||
        (selectedEligibility === 'eligible' && (c as any).isEligible) ||
        (selectedEligibility === 'ineligible' && !(c as any).isEligible);
      return matchesSearch && matchesBranch && matchesSupervisor && matchesSector && matchesEligibility;
    });
  }, [customersMap, searchQuery, selectedBranch, selectedSupervisor, selectedSector, selectedEligibility]);

  const displayedCustomers = useMemo(() => filteredCustomers.slice(0, visibleCustomersCount), [filteredCustomers, visibleCustomersCount]);

  /* ---------- مؤشرات عامة ---------- */
  const totalDebt = filteredCustomers.reduce((sum, c) => sum + c.balance, 0);
  const totalOverdue = filteredCustomers.reduce((sum, c) => sum + c.overdue, 0);
  const totalCollections = filteredCustomers.reduce((sum, c) => sum + c.totalCollections, 0);
  const totalSales = filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0);

  const repTotalDebt = filteredReps.reduce((sum, r) => sum + r.debt, 0);
  const repTotalOverdue = filteredReps.reduce((sum, r) => sum + r.overdue, 0);
  const repTotalSales = filteredReps.reduce((sum, r) => sum + r.salesAchieved, 0);
  const repTotalCollections = filteredReps.reduce((sum, r) => sum + r.collectionAchieved, 0);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 1200);
  };

  const handleOpenCustomer = (id: string) => setOpenCustomerId((prev) => (prev === id ? null : id));
  const handleOpenRep = (id: string) => {
    if (openRepId === id) {
      setOpenRepId(null);
    } else {
      setRepAnalysisTab('overview');
      setOpenRepId(id);
    }
  };

  const selectedCustomer = useMemo(() => {
    if (!openCustomerId) return null;
    const raw = allCustomers.find((c) => c.id === openCustomerId);
    const mapped = customersMap.find((c) => c.id === openCustomerId);
    if (!raw && !mapped) return null;
    return { ...(raw || {}), ...(mapped || {}) };
  }, [allCustomers, customersMap, openCustomerId]);

  const selectedRep = useMemo(() => repsMap.find((r) => r.repKey === openRepId), [repsMap, openRepId]);
  const selectedRepUser = useMemo(
    () => (selectedRep ? findRepUser(users, selectedRep.repName) : undefined),
    [users, selectedRep]
  );

  const repCustomers = useMemo(() => {
    if (!selectedRep) return [];
    const repKey = repMatchKey(selectedRep.repName);
    return filteredCustomers.filter((c) => repMatchKey(c.repName) === repKey);
  }, [selectedRep, filteredCustomers]);

  const repCustomersWithDebt = useMemo(() => {
    return repCustomers.filter((c) => c.balance > 0 || c.overdue > 0);
  }, [repCustomers]);

  const repVisits = useMemo(() => {
    if (!selectedRep) return [];
    const all = getVisibleVisits ? getVisibleVisits() : (ctxVisits || []);
    const rName = repMatchKey(selectedRep.repName);
    return all.filter((v: any) => {
      if (v.repId && (v.repId === selectedRep.repId || v.repId === selectedRep.repUsername || v.repId === selectedRep.repName)) return true;
      if (v.repName && repMatchKey(v.repName) === rName) return true;
      return false;
    }).sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [selectedRep, getVisibleVisits, ctxVisits]);

  const repMonthlyVisitsCount = useMemo(() => {
    if (!repVisits.length) return 0;
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    return repVisits.filter((v: any) => {
      if (!v.date) return false;
      const d = new Date(v.date);
      return d.getMonth() + 1 === curMonth && d.getFullYear() === curYear;
    }).length;
  }, [repVisits]);

  const monthlyAnalysis = useMemo(() => {
    if (!selectedRep) return [];
    // نجمّع كل صفوف الأهداف الخاصة بالمندوب بالاسم المطبّع — مش بالـid —
    // عشان تظهر كل شهور السنة مش صف شهر واحد بس.
    const repKey = repMatchKey(selectedRep.repName);
    const repTargets = allTargets.filter(
      (t) => repMatchKey(t.repName) === repKey
    );
    const map = new Map<number, { targetSales: number; achSales: number; targetColl: number; achColl: number }>();
    for (let m = 1; m <= 12; m++) {
      map.set(m, { targetSales: 0, achSales: 0, targetColl: 0, achColl: 0 });
    }
    for (const t of repTargets) {
      const m = Number(t.month);
      if (m >= 1 && m <= 12) {
        const cur = map.get(m)!;
        cur.targetSales += Number(t.salesTarget || 0);
        cur.achSales += Number(t.salesAchieved || 0);
        cur.targetColl += Number(t.collectionTarget || 0);
        cur.achColl += Number(t.collectionAchieved || 0);
      }
    }
    // دمج أيضاً أي مبيعات شهرية تم حسابها
    Object.entries(selectedRep.monthlySales || {}).forEach(([k, val]) => {
      const parts = k.split('-');
      const m = Number(parts[1] || parts[0]);
      if (m >= 1 && m <= 12) {
        const cur = map.get(m);
        if (cur && cur.achSales === 0) cur.achSales = Number(val || 0);
      }
    });
    Object.entries(selectedRep.monthlyCollection || {}).forEach(([k, val]) => {
      const parts = k.split('-');
      const m = Number(parts[1] || parts[0]);
      if (m >= 1 && m <= 12) {
        const cur = map.get(m);
        if (cur && cur.achColl === 0) cur.achColl = Number(val || 0);
      }
    });

    const rows: { month: number; label: string; targetSales: number; achSales: number; targetColl: number; achColl: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const row = map.get(m)!;
      if (row.targetSales > 0 || row.achSales > 0 || row.targetColl > 0 || row.achColl > 0) {
        rows.push({ month: m, label: MONTHS_AR[m - 1], ...row });
      }
    }
    return rows;
  }, [selectedRep, allTargets]);

  /* ---------- Render ---------- */
  return (
    <div className="tg-dash space-y-4" dir="rtl">

      {/* ترويسة الصفحة */}
      <section className="ds-pagehead">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-[#dbeafe] mb-1">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> {activeTab === 'reps' ? 'المناديب' : 'العملاء'}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/25">
                {activeTab === 'customers' ? <Users className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  {activeTab === 'reps' ? 'بروفايل المناديب' : 'قاعدة العملاء والبروفايلات'}
                </h1>
                <p className="text-xs sm:text-sm font-semibold text-[#dbeafe] mt-0.5">
                  {activeTab === 'customers'
                    ? 'عرض كل العملاء مع تفاصيل المديونية والتحصيل والزيارات وتثبيت الموقع الجغرافي.'
                    : 'متابعة ملف كل مندوب وأهدافه الشهرية والتحصيل والمديونيات وزياراته.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {mode === 'reps' && canViewReps && (
              <button
                type="button"
                onClick={() => setActiveTab('reps')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-blue-600 text-white shadow-sm shadow-blue-500/25 cursor-pointer"
              >
                <UserCheck size={16} />
                <span>المناديب</span>
              </button>
            )}
            <button
              type="button"
              disabled={isRefreshing}
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-black border border-white/25 bg-white/15 text-white hover:bg-white/25 transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      {/* ================= قسم العملاء ================= */}
      {activeTab === 'customers' && (
        <div>
          {/* كروت الإجمالية */}
          <section className="kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
            <div className="tg-kpi tg-kpi--amber">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><CreditCard size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(totalDebt)} ج.م</span>
              <span className="tg-kpi__label">إجمالي المديونية</span>
              <span className="tg-kpi__hint">كل العملاء</span>
            </div>
            <div className="tg-kpi tg-kpi--red">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><AlertTriangle size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(totalOverdue)} ج.م</span>
              <span className="tg-kpi__label">إجمالي المتأخرات</span>
              <span className="tg-kpi__hint">مستحق فوراً</span>
            </div>
            <div className="tg-kpi tg-kpi--emerald">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><Wallet size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(totalCollections)} ج.م</span>
              <span className="tg-kpi__label">إجمالي التحصيل</span>
              <span className="tg-kpi__hint">محصل نقدي</span>
            </div>
            <div className="tg-kpi tg-kpi--blue">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><ShoppingCart size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(totalSales)} ج.م</span>
              <span className="tg-kpi__label">إجمالي المبيعات</span>
              <span className="tg-kpi__hint">فواتير مسجلة</span>
            </div>
          </section>

          {/* فلاتر العملاء */}
          <section className="tg-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم العميل أو الكود أو الهاتف..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-[var(--tg-line)] rounded-xl text-sm font-bold text-[#0f172a] placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition"
                />
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">القطاع</span>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value as 'all' | 'home' | 'electrical')}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">كل القطاعات</option>
                  <option value="home">منزلي</option>
                  <option value="electrical">كهربائي</option>
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">الفرع</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>{b === 'الكل' ? 'كل الفروع' : b}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">المشرف / المندوب</span>
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  {supervisorOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">تصنيف الشيت (قابل / غير)</span>
                <select
                  value={selectedEligibility}
                  onChange={(e) => setSelectedEligibility(e.target.value as any)}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">كل التصنيفات</option>
                  <option value="eligible">قابل للتعامل</option>
                  <option value="ineligible">غير قابل للتعامل</option>
                </select>
              </div>
            </div>
          </section>

          {/* كروت العملاء (بروفايل احترافي عالي التباين) */}
          <div className="cust-grid grid grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-4">
            {displayedCustomers.length === 0 ? (
              <div className="col-span-full tg-card p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-slate-950">لا يوجد عملاء مطابقة للبحث</h3>
                <p className="mt-1 text-sm font-bold text-slate-700">جرّب تعديل البحث أو الفلاتر.</p>
              </div>
            ) : (
              displayedCustomers.map((cust) => {
                const exceeded = cust.creditLimit > 0 && (cust.balance + cust.overdue) > cust.creditLimit;
                const totalDebtDue = Math.max(cust.balance, cust.overdue);
                const sector = (cust.sector || 'all') as 'home' | 'electrical' | 'both' | 'all';
                const sectorLabel = sector === 'home' ? 'منزلي' : sector === 'electrical' ? 'كهرباء' : 'عام';
                const collRate =
                  cust.totalSales > 0 ? Math.min(100, Math.round((cust.totalCollections / cust.totalSales) * 100)) : 0;
                const hasPhone = Boolean(cust.phone && cust.phone !== '—');
                const debtTone = exceeded || cust.overdue > 0 ? 'risk' : cust.balance > 0 ? 'warn' : 'ok';

                return (
                  <article
                    key={cust.id}
                    onClick={() => handleOpenCustomer(cust.id)}
                    className="cust-card group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs transition-all duration-150 hover:border-slate-300 hover:shadow-md cursor-pointer"
                  >
                    {/* رأس الكارت: الأفاتار التعبيري + الاسم + الميتاداتا النظيفة بدون كبسولات */}
                    <div>
                      <div className="flex items-start gap-3.5">
                        <div className="relative shrink-0">
                          <img
                            src={cust.avatarUrl}
                            alt={cust.name}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.fallback) {
                                img.dataset.fallback = '1';
                                img.src = customerMerchantAvatar;
                              }
                            }}
                            className={`h-16 w-16 rounded-2xl object-cover object-top bg-slate-100 border-2 ${
                              debtTone === 'risk'
                                ? 'border-rose-400'
                                : debtTone === 'warn'
                                  ? 'border-amber-400'
                                  : 'border-emerald-400'
                            }`}
                          />
                          {cust.latitude && cust.longitude && (
                            <span
                              title="موقع GPS مثبت"
                              className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-white border-2 border-white shadow-xs"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-base sm:text-[17px] font-black text-slate-950 leading-snug line-clamp-1 group-hover:text-blue-900 transition-colors">
                              {cust.name}
                            </h3>
                            <span
                              className={`shrink-0 text-xs font-black ${
                                cust.isEligible ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {cust.isEligible ? 'قابل' : 'غير قابل'}
                            </span>
                          </div>

                          {/* سطر بيانات وصفية نظيف بفواصل نقطية (Zero-Pill) وتباين عالٍ */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-bold text-slate-700">
                            <span className="font-mono font-black text-slate-900">{cust.code}</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span>{sectorLabel}</span>
                            <span aria-hidden="true" className="text-slate-400">·</span>
                            <span className="truncate max-w-[140px]">
                              {cust.branch && cust.branch !== '—' ? cust.branch : 'فرع غير محدد'}
                            </span>
                          </div>

                          {/* اسم المندوب والمسؤولية */}
                          <div className="mt-1 text-xs font-semibold text-slate-700 truncate">
                            المندوب: <span className="font-black text-slate-900">{cust.repName}</span>
                          </div>
                        </div>
                      </div>

                      {/* قسم التحصيل والمديونيات والمرتجعات — جدول منسق عالي التباين سهل القراءة أثناء الحركة */}
                      <div className="cust-rows mt-4 rounded-xl border border-slate-200 bg-slate-50/90 divide-y divide-slate-200">
                        {/* 1) المديونيات والمتأخرات */}
                        <div className="cust-row flex items-center justify-between gap-3 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                              <CreditCard className="h-3.5 w-3.5 text-slate-700 shrink-0" />
                              <span>المديونية والمتأخرات</span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-bold text-slate-700">
                              {exceeded
                                ? 'تجاوز الحد الائتماني'
                                : cust.overdue > 0
                                  ? `متأخرات مستحقة: ${fmt(cust.overdue)} ج.م`
                                  : cust.balance > 0
                                    ? 'مديونية جارية منتظمة'
                                    : 'حساب منتظم بدون مديونية'}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div
                              className={`text-base sm:text-lg font-black tabular-nums leading-tight ${
                                debtTone === 'risk'
                                  ? 'text-rose-700'
                                  : debtTone === 'warn'
                                    ? 'text-slate-950'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {fmt(totalDebtDue)} <span className="text-xs font-extrabold">ج.م</span>
                            </div>
                          </div>
                        </div>

                        {/* 2) التحصيل */}
                        <div className="cust-row flex items-center justify-between gap-3 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                              <Wallet className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                              <span>التحصيل</span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-bold text-slate-700 tabular-nums">
                              {cust.lastCollectionDate
                                ? `آخر تحصيل ${cust.lastCollectionDate}${cust.lastCollectionAmount > 0 ? ` (${fmt(cust.lastCollectionAmount)})` : ''}`
                                : cust.totalSales > 0
                                  ? `نسبة السداد ${collRate}% من المبيعات`
                                  : 'لا توجد تحصيلات مسجلة'}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className="text-base sm:text-lg font-black tabular-nums text-emerald-800 leading-tight">
                              {fmt(cust.totalCollections)} <span className="text-xs font-extrabold">ج.م</span>
                            </div>
                          </div>
                        </div>

                        {/* 3) المرتجعات */}
                        <div className="cust-row flex items-center justify-between gap-3 px-3.5 py-2.5">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                              <RotateCcw className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                              <span>المرتجعات</span>
                            </div>
                            <div className="mt-0.5 text-[11px] font-bold text-slate-700">
                              {cust.returnsCount > 0
                                ? cust.pendingReturnsCount > 0
                                  ? `${cust.returnsCount} إذن (${cust.pendingReturnsCount} قيد المتابعة)`
                                  : `${cust.returnsCount} إذن مرتجع مسجل`
                                : 'لا توجد مرتجعات مسجلة'}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div
                              className={`text-sm sm:text-base font-black tabular-nums leading-tight ${
                                cust.pendingReturnsCount > 0
                                  ? 'text-amber-800'
                                  : cust.returnsValue > 0
                                    ? 'text-slate-900'
                                    : 'text-slate-700'
                              }`}
                            >
                              {cust.returnsValue > 0 ? (
                                <>
                                  {fmt(cust.returnsValue)} <span className="text-xs font-extrabold">ج.م</span>
                                </>
                              ) : (
                                `${cust.returnsCount} إذن`
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* شريط الإجراءات السريع — أهداف لمس كبيرة مريحة أثناء الحركة */}
                    <div className="cust-cta mt-3.5 flex items-center gap-2">
                      {hasPhone && (
                        <a
                          href={`tel:${cust.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-black text-slate-900 hover:bg-slate-100 transition shrink-0"
                          title={`اتصال بالعميل: ${cust.phone}`}
                        >
                          <Phone className="h-4 w-4 text-slate-800 shrink-0" />
                          <span className="font-mono tabular-nums" dir="ltr">{cust.phone}</span>
                        </a>
                      )}
                      {canTransferToLegal && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLegalTransferCustomer(cust);
                          }}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0F2B38] px-3.5 text-xs font-black text-white hover:bg-[#123554] transition shrink-0"
                        >
                          <Scale className="h-3.5 w-3.5" />
                          <span>تحويل للشؤون القانونية</span>
                        </button>
                      )}
                      <div className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-[#0b2337] px-4 text-xs sm:text-sm font-black text-white transition group-hover:bg-[#123554]">
                        <span>ملف العميل</span>
                        <ChevronLeft className="h-4 w-4 shrink-0" />
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {visibleCustomersCount < filteredCustomers.length && (
            <div className="flex justify-center p-4 border-t border-[var(--tg-line)] bg-slate-50/60">
              <button
                type="button"
                onClick={() => setVisibleCustomersCount((c) => c + 12)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-sm"
              >
                عرض المزيد من العملاء ({filteredCustomers.length - visibleCustomersCount} متبقي)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= قسم المندوبين ================= */}
      {activeTab === 'reps' && (
        <div>
          {/* كروت الإجمالية للمندوبين */}
          <section className="kpi-grid grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
            <div className="tg-kpi tg-kpi--amber">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><CreditCard size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(repTotalDebt)} ج.م</span>
              <span className="tg-kpi__label">إجمالي مديونية المندوبين</span>
              <span className="tg-kpi__hint">العملاء الدين عليهم</span>
            </div>
            <div className="tg-kpi tg-kpi--red">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><AlertTriangle size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(repTotalOverdue)} ج.م</span>
              <span className="tg-kpi__label">إجمالي المتأخرات</span>
              <span className="tg-kpi__hint">على عملاء المندوبين</span>
            </div>
            <div className="tg-kpi tg-kpi--emerald">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><Wallet size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(repTotalCollections)} ج.م</span>
              <span className="tg-kpi__label">إجمالي التحصيل</span>
              <span className="tg-kpi__hint">محصل المندوبين</span>
            </div>
            <div className="tg-kpi tg-kpi--blue">
              <div className="tg-kpi__top">
                <span className="tg-kpi__icon"><ShoppingCart size={20} /></span>
              </div>
              <span className="tg-kpi__value">{fmt(repTotalSales)} ج.م</span>
              <span className="tg-kpi__label">إجمالي المبيعات</span>
              <span className="tg-kpi__hint">تحقيق المندوبين</span>
            </div>
          </section>

          {/* تحليلات المناديب: دونات الحصص + توب 10 + منحنى شهري لأفضل مندوب */}
          {repAnalytics.top10.length > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* دونات حصص المبيعات */}
              <div className="tg-card p-4 sm:p-5 flex flex-col items-center">
                <div className="w-full flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-black text-slate-900">حصة المبيعات</h3>
                  <span className="text-[11px] font-extrabold text-slate-600 tabular-nums">إجمالي {fmt(repAnalytics.totalSales)} ج.م</span>
                </div>
                <div className="relative w-[190px] h-[190px] my-1">
                  <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                    {(() => {
                      const C = 2 * Math.PI * 54;
                      let acc = 0;
                      const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0f2b38', '#94a3b8'];
                      return repAnalytics.donut.map((d, i) => {
                        const frac = repAnalytics.totalSales > 0 ? d.value / repAnalytics.totalSales : 0;
                        const dash = `${Math.max(frac * C - 2, 0)} ${C}`;
                        const offset = -acc * C;
                        acc += frac;
                        return (
                          <circle
                            key={d.name}
                            cx="70" cy="70" r="54" fill="none"
                            stroke={colors[i % colors.length]}
                            strokeWidth="16"
                            strokeDasharray={dash}
                            strokeDashoffset={offset}
                            strokeLinecap="butt"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10.5px] font-extrabold text-slate-600">أفضل مندوب</span>
                    <span className="text-[13px] font-black text-slate-900 text-center leading-tight px-2 line-clamp-2">
                      {repAnalytics.leader?.repName || '—'}
                    </span>
                  </div>
                </div>
                <div className="w-full mt-2 space-y-1">
                  {(() => {
                    const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#0f2b38', '#94a3b8'];
                    return repAnalytics.donut.map((d, i) => {
                      const frac = repAnalytics.totalSales > 0 ? Math.round((d.value / repAnalytics.totalSales) * 100) : 0;
                      return (
                        <div key={d.name} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="flex items-center gap-1.5 font-bold text-slate-800 truncate">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
                            <span className="truncate max-w-[110px]">{d.name}</span>
                          </span>
                          <span className="font-black tabular-nums text-slate-900 shrink-0">{frac}%</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* توب 10 مناديب */}
              <div className="tg-card p-4 sm:p-5 lg:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                      <Trophy className="h-4.5 w-4.5" />
                    </span>
                    <h3 className="text-sm font-black text-slate-900">أعلى 10 مناديب في المبيعات</h3>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-black">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">{activePeriodLabel}</span>
                    {selectedBranch !== 'الكل' && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">فرع: {selectedBranch}</span>
                    )}
                  </div>
                </div>
                <div className="space-y-2.5">
                  {repAnalytics.top10.map((rep, i) => {
                    const leaderSales = repAnalytics.top10[0].salesAchieved;
                    const w = leaderSales > 0 ? Math.max(6, Math.round((rep.salesAchieved / leaderSales) * 100)) : 0;
                    const medal = i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-slate-900' : i === 2 ? 'bg-orange-300 text-orange-950' : 'bg-slate-100 text-slate-700';
                    return (
                      <div
                        key={rep.repKey}
                        onClick={() => handleOpenRep(rep.repKey)}
                        className="flex items-center gap-3 cursor-pointer group"
                      >
                        <span className={`h-7 w-7 rounded-lg text-[11px] font-black flex items-center justify-center shrink-0 tabular-nums ${medal}`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[12.5px] font-black text-slate-900 truncate group-hover:text-blue-800 transition-colors">
                              {rep.repName}
                            </span>
                            <span className="text-[12px] font-black tabular-nums text-slate-900 shrink-0">
                              {fmt(rep.salesAchieved)} <span className="text-[10px] font-extrabold text-slate-600">ج.م</span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${i === 0 ? 'bg-gradient-to-l from-blue-500 to-blue-700' : 'bg-blue-400/80'}`}
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* منحنى المبيعات الشهري لأفضل مندوب */}
              {repAnalytics.line.length > 1 && (
                <div className="tg-card p-4 sm:p-5 lg:col-span-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-black text-slate-900">
                      مبيعات {repAnalytics.leader?.repName || ''} شهرياً
                    </h3>
                    <span className="text-[11px] font-extrabold text-slate-600">مبيعات × تحصيل</span>
                  </div>
                  <svg viewBox="0 0 600 170" className="w-full h-[170px]" preserveAspectRatio="none">
                    {(() => {
                      const pts = repAnalytics.line;
                      const max = Math.max(...pts.map((p) => Math.max(p.sales, p.collection)), 1);
                      const x = (i: number) => 20 + (i * 560) / Math.max(pts.length - 1, 1);
                      const y = (v: number) => 150 - (v / max) * 128;
                      const path = (key: 'sales' | 'collection') => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
                      return (
                        <>
                          <line x1="20" y1="150" x2="580" y2="150" stroke="#e2e8f0" strokeWidth="1.5" />
                          <path d={`${path('sales')} L${x(pts.length - 1).toFixed(1)},150 L20,150 Z`} fill="rgba(37,99,235,0.10)" stroke="none" />
                          <path d={path('sales')} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                          <path d={path('collection')} fill="none" stroke="#059669" strokeWidth="2.5" strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
                          {pts.map((p, i) => (
                            <g key={p.key}>
                              <circle cx={x(i)} cy={y(p.sales)} r="3.5" fill="#ffffff" stroke="#2563eb" strokeWidth="2" />
                              <text x={x(i)} y="166" textAnchor="middle" fontSize="10" fontWeight="800" fill="#475569">{p.label}</text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )}
            </section>
          )}

          {/* فلاتر المندوبين (بالشهر / بالربع سنوي 3 شهور / بالفرع) */}
          <section className="tg-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-[#0F2B38] flex items-center gap-1.5">
                  <CalendarCheck className="w-4 h-4 text-blue-700" />
                  الفترة التحليلية:
                </span>
                <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200 gap-1">
                  {[
                    { key: 'all' as const, label: 'الكل' },
                    { key: 'month' as const, label: 'بالشهر' },
                    { key: 'quarter' as const, label: 'ربع سنوي (3 شهور)' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setRepPeriodMode(item.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer whitespace-nowrap ${
                        repPeriodMode === item.key
                          ? 'bg-[#0F2B38] text-white shadow-xs'
                          : 'text-slate-700 hover:bg-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {repPeriodMode === 'month' && (
                  <select
                    value={selectedRepMonth}
                    onChange={(e) => setSelectedRepMonth(Number(e.target.value))}
                    aria-label="اختيار الشهر"
                    className="bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 text-xs sm:text-sm font-black text-[#0b2337] cursor-pointer focus:outline-none"
                  >
                    {MONTHS_AR.map((mName, idx) => (
                      <option key={mName} value={idx + 1}>{mName}</option>
                    ))}
                  </select>
                )}

                {repPeriodMode === 'quarter' && (
                  <select
                    value={selectedRepQuarter}
                    onChange={(e) => setSelectedRepQuarter(Number(e.target.value) as 1 | 2 | 3 | 4)}
                    aria-label="اختيار الربع السنوي"
                    className="bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 text-xs sm:text-sm font-black text-[#0b2337] cursor-pointer focus:outline-none"
                  >
                    {([1, 2, 3, 4] as const).map((q) => (
                      <option key={q} value={q}>{QUARTER_LABELS[q]}</option>
                    ))}
                  </select>
                )}

                {repYearOptions.length > 0 && (
                  <select
                    value={selectedRepYear}
                    onChange={(e) => setSelectedRepYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    aria-label="اختيار السنة"
                    className="bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 text-xs sm:text-sm font-black text-[#0b2337] cursor-pointer focus:outline-none"
                  >
                    <option value="all">كل السنوات</option>
                    {repYearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم المندوب أو الكود أو الفرع..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-[var(--tg-line)] rounded-xl text-sm font-bold text-[#0f172a] placeholder:text-slate-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition"
                />
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">القطاع</span>
                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value as 'all' | 'home' | 'electrical')}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">كل القطاعات</option>
                  <option value="home">منزلي</option>
                  <option value="electrical">كهربائي</option>
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">الفرع</span>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>{b === 'الكل' ? 'كل الفروع' : b}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[11px] font-extrabold text-slate-700 leading-none mb-1">المشرف</span>
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="bg-transparent font-black text-[#0b2337] text-sm focus:outline-none cursor-pointer w-full"
                >
                  {supervisorOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* كروت المندوبين (بروفايل) - أول 5 */}
          <div className="rep-grid grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-4">
            {repsMap.length === 0 ? (
              <div className="col-span-full tg-card p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[28px] bg-slate-100 text-slate-600 shadow-inner">
                  <UserCheck className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-[#0b2337]">لا يوجد مندوب مسجّل</h3>
                <p className="mt-1 text-sm font-bold text-slate-700">لا توجد بيانات أهداف لتجميع المندوبين منها. يرجى تحميل بيانات المندوبين أولاً.</p>
              </div>
            ) : displayedReps.length === 0 ? (
              <div className="col-span-full tg-card p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[28px] bg-slate-100 text-slate-600 shadow-inner">
                  <UserCheck className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-[#0b2337]">لا يوجد مندوبون مطابقة للبحث</h3>
                <p className="mt-1 text-sm font-bold text-slate-700">جرّب تعديل البحث أو الفلاتر (الفرع، المشرف، القطاع).</p>
              </div>
            ) : (
              displayedReps.map((rep) => {
                const salesPct = pctOf(rep.salesAchieved, rep.salesTarget);
                const repUser = findRepUser(users, rep.repName);
                const repAvatar = repUser?.avatar || '/assets/rep-avatar.jpg';
                return (
                  <div
                    key={rep.repKey}
                    onClick={() => handleOpenRep(rep.repKey)}
                    className="rep-card tg-card p-4 sm:p-5 cursor-pointer group hover:border-blue-400 transition border-[var(--tg-line)]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={repAvatar}
                          alt={rep.repName}
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.fallback) {
                              img.dataset.fallback = '1';
                              img.src = '/assets/rep-avatar.jpg';
                            }
                          }}
                          className="w-12 h-12 rounded-2xl object-cover object-top border-2 border-blue-200 bg-slate-100 shadow-sm shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-black text-base text-[#0f172a] truncate">{rep.repName}</div>
                          <div className="text-xs text-slate-700 font-bold flex items-center gap-1.5 flex-wrap mt-0.5">
                            {rep.repUsername && (
                              <span className="font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold">{rep.repUsername}</span>
                            )}
                            {rep.branch && rep.branch !== '—' && <span>{rep.branch}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-black ${getSectorColor(rep.sector)}`}>
                              {getSectorLabel(rep.sector)}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-extrabold bg-indigo-50 text-indigo-900 border border-indigo-200">
                              مشرف: {rep.supervisor}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg shrink-0 tabular-nums ${
                        salesPct >= 100 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
                        salesPct >= 70 ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                        'bg-rose-100 text-rose-900 border border-rose-300'
                      }`}>
                        {salesPct}%
                      </span>
                    </div>

                    <div className="rep-mini grid grid-cols-2 gap-2 mb-2.5">
                      <div className="bg-slate-100/80 rounded-xl p-3 border border-slate-200">
                        <div className="text-[11px] font-extrabold text-slate-700 mb-0.5">مديونية عملائه</div>
                        <div className="text-sm font-black text-[#0f172a] tabular-nums">{fmt(rep.debt)}</div>
                      </div>
                      <div className="bg-slate-100/80 rounded-xl p-3 border border-slate-200">
                        <div className="text-[11px] font-extrabold text-slate-700 mb-0.5">متأخرات</div>
                        <div className={`text-sm font-black tabular-nums ${rep.overdue > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmt(rep.overdue)}</div>
                      </div>
                    </div>

                    <div className="rep-mini grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-blue-50/70 rounded-xl p-3 border border-blue-200/70">
                        <div className="text-[11px] font-extrabold text-blue-900 mb-0.5">مبيعات</div>
                        <div className="text-sm font-black text-blue-800 tabular-nums">{fmt(rep.salesAchieved)}</div>
                      </div>
                      <div className="bg-emerald-50/70 rounded-xl p-3 border border-emerald-200/70">
                        <div className="text-[11px] font-extrabold text-emerald-900 mb-0.5">تحصيل</div>
                        <div className="text-sm font-black text-emerald-800 tabular-nums">{fmt(rep.collectionAchieved)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--tg-line)] text-xs">
                      <span className="font-extrabold text-slate-700">عملاؤه: <strong className="text-[#0f172a] tabular-nums">{rep.customerCount}</strong></span>
                      <span className="inline-flex items-center gap-1 font-black text-blue-700 group-hover:text-blue-800">
                        فتح الملف
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {visibleRepsCount < filteredReps.length && (
            <div className="flex justify-center p-4 border-t border-[var(--tg-line)] bg-slate-50/60">
              <button
                type="button"
                onClick={() => setVisibleRepsCount((c) => c + 5)}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer shadow-sm"
              >
                عرض المزيد من المندوبين ({filteredReps.length - visibleRepsCount} متبقي)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= درج تفاصيل العميل (يمين الشاشة) ================= */}
      {selectedCustomer && (
        <CustomerProfileDrawer
          customer={allCustomers.find((c) => c.id === selectedCustomer.id) || selectedCustomer}
          isOpen
          onClose={() => setOpenCustomerId(null)}
          onNewOrder={(cust) => {
            setOpenCustomerId(null);
            if (onOpenNewOrderForCustomer) onOpenNewOrderForCustomer(cust);
          }}
        />
      )}

      {/* ================= نافذة تفاصيل المندوب ================= */}
      {selectedRep && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={`ملف المندوب ${selectedRep.repName}`}
        >
          <div
            className="fixed inset-0 bg-[#071726]/80 backdrop-blur-sm transition-opacity cursor-pointer"
            onClick={() => setOpenRepId(null)}
            aria-label="إغلاق الخلفية"
          />
          <div
            className="tg-cp relative z-10 w-full sm:max-w-3xl max-h-[92vh] bg-[#f4f7fb] rounded-[28px] shadow-[0_25px_70px_rgba(0,0,0,0.55)] border border-slate-200 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative z-10 shrink-0 bg-gradient-to-l from-[#0b2337] via-[#12385d] to-[#155a80] text-white px-4 sm:px-6 pt-4 pb-4 sm:pt-5 sm:pb-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={selectedRepUser?.avatar || '/assets/rep-avatar.jpg'}
                    alt={selectedRep.repName}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallback) {
                        img.dataset.fallback = '1';
                        img.src = '/assets/rep-avatar.jpg';
                      }
                    }}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover object-top border-2 border-white/40 bg-slate-800 shadow-md shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-black text-lg sm:text-xl text-white leading-tight truncate">{selectedRep.repName}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/15 border border-white/25 text-white">{selectedRep.branch || 'بدون فرع'}</span>
                      <span className={`px-2.5 py-0.5 rounded-lg border ${selectedRep.sector === 'home' ? 'bg-blue-500/30 border-blue-300/45 text-white' : selectedRep.sector === 'electrical' ? 'bg-violet-500/30 border-violet-300/45 text-white' : 'bg-white/15 border-white/25 text-white'}`}>
                        {getSectorLabel(selectedRep.sector)}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-amber-400/25 border border-amber-200/45 text-amber-100">مشرف: {selectedRep.supervisor}</span>
                    </div>
                    {selectedRep.repUsername && (
                      <div className="mt-1.5 text-xs font-bold text-[#dbeafe] font-mono truncate">{selectedRep.repUsername}</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenRepId(null)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition shrink-0 cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>

              {/* Quick KPIs */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">المبيعات المحققة</div>
                  <div className="font-black text-base sm:text-lg text-white tabular-nums mt-0.5">{fmt(selectedRep.salesAchieved)}</div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">التحصيل المحقق</div>
                  <div className="font-black text-base sm:text-lg text-white tabular-nums mt-0.5">{fmt(selectedRep.collectionAchieved)}</div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">نسبة البيع / التحصيل</div>
                  <div className="font-black text-base sm:text-lg text-white tabular-nums mt-0.5">{pctOf(selectedRep.salesAchieved, selectedRep.salesTarget)}% / {pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget)}%</div>
                </div>
                <div className="rounded-xl bg-[#0d2a44]/85 border border-white/20 px-3 py-2.5">
                  <div className="text-xs font-extrabold text-[#dbeafe]">العملاء / زيارات الشهر</div>
                  <div className="font-black text-base sm:text-lg text-white tabular-nums mt-0.5">{selectedRep.customerCount} / {repMonthlyVisitsCount}</div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 bg-white border-b border-slate-200 px-3 sm:px-5 pt-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-2.5 no-scrollbar">
                {[
                  { key: 'overview' as const, label: 'نظرة عامة', icon: <Activity className="w-4 h-4" /> },
                  { key: 'monthly' as const, label: 'أداء الشهور', icon: <BarChart3 className="w-4 h-4" /> },
                  { key: 'visits' as const, label: `الزيارات (${repMonthlyVisitsCount})`, icon: <MapPin className="w-4 h-4" /> },
                ].map((t) => {
                  const active = repAnalysisTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setRepAnalysisTab(t.key)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap shrink-0 transition border cursor-pointer ${
                        active
                          ? 'bg-[#12385d] text-white border-[#12385d] shadow-sm'
                          : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200 hover:text-slate-950'
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
              {/* تبويب 1: نظرة عامة */}
              {repAnalysisTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-white border border-amber-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-amber-900">مديونية العملاء</span><CreditCard className="w-4 h-4 text-amber-700" /></div>
                      <div className="font-black text-lg text-amber-950 tabular-nums">{fmt(selectedRep.debt)} <span className="text-xs font-extrabold">ج.م</span></div>
                    </div>
                    <div className="rounded-2xl bg-white border border-rose-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-rose-900">المتأخرات</span><AlertTriangle className="w-4 h-4 text-rose-700" /></div>
                      <div className={`font-black text-lg tabular-nums ${selectedRep.overdue > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>{fmt(selectedRep.overdue)} <span className="text-xs font-extrabold">ج.م</span></div>
                    </div>
                    <div className="rounded-2xl bg-white border border-blue-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-blue-900">إجمالي المبيعات</span><ShoppingCart className="w-4 h-4 text-blue-700" /></div>
                      <div className="font-black text-lg text-blue-950 tabular-nums">{fmt(selectedRep.salesAchieved)} <span className="text-xs font-extrabold">ج.م</span></div>
                    </div>
                    <div className="rounded-2xl bg-white border border-emerald-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-emerald-900">إجمالي التحصيل</span><Wallet className="w-4 h-4 text-emerald-700" /></div>
                      <div className="font-black text-lg text-emerald-950 tabular-nums">{fmt(selectedRep.collectionAchieved)} <span className="text-xs font-extrabold">ج.م</span></div>
                    </div>
                    <div className="rounded-2xl bg-white border border-teal-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-teal-900">زيارات الشهر</span><MapPin className="w-4 h-4 text-teal-700" /></div>
                      <div className="font-black text-lg text-teal-950 tabular-nums">{repMonthlyVisitsCount} <span className="text-xs font-extrabold">زيارة</span></div>
                    </div>
                    <div className="rounded-2xl bg-white border border-slate-300 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between mb-1"><span className="text-xs font-extrabold text-slate-800">عدد العملاء</span><Users className="w-4 h-4 text-slate-700" /></div>
                      <div className="font-black text-lg text-slate-950 tabular-nums">{selectedRep.customerCount} <span className="text-xs font-extrabold">عميل</span></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center"><TrendingUp className="w-4 h-4" /></span><span className="font-black text-sm text-slate-900">أداء المبيعات</span></div>
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg tabular-nums ${pctOf(selectedRep.salesAchieved, selectedRep.salesTarget) >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{pctOf(selectedRep.salesAchieved, selectedRep.salesTarget)}%</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المستهدف</span><span className="font-black tabular-nums text-slate-900">{fmt(selectedRep.salesTarget)} ج.م</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المحقق</span><span className="font-black tabular-nums text-blue-800">{fmt(selectedRep.salesAchieved)} ج.م</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المتبقي</span><span className="font-black tabular-nums text-rose-700">{fmt(Math.max(0, selectedRep.salesTarget - selectedRep.salesAchieved))} ج.م</span></div>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-blue-500 to-blue-700" style={{ width: `${Math.min(100, pctOf(selectedRep.salesAchieved, selectedRep.salesTarget))}%` }} /></div>
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center"><Wallet className="w-4 h-4" /></span><span className="font-black text-sm text-slate-900">أداء التحصيل</span></div>
                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg tabular-nums ${pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget) >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget)}%</span>
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المستهدف</span><span className="font-black tabular-nums text-slate-900">{fmt(selectedRep.collectionTarget)} ج.م</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المحقق</span><span className="font-black tabular-nums text-emerald-800">{fmt(selectedRep.collectionAchieved)} ج.م</span></div>
                        <div className="flex justify-between"><span className="font-bold text-slate-700">المتبقي</span><span className="font-black tabular-nums text-rose-700">{fmt(Math.max(0, selectedRep.collectionTarget - selectedRep.collectionAchieved))} ج.م</span></div>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-700" style={{ width: `${Math.min(100, pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget))}%` }} /></div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600" /><span className="font-black text-sm text-slate-900">عملاء عليهم مديونية</span><span className="text-xs font-extrabold text-slate-700">({repCustomersWithDebt.length})</span></div>
                    </div>
                    <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {repCustomersWithDebt.length === 0 ? (
                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center text-sm font-extrabold text-emerald-800">جميع عملاء المندوب خالصون حالياً</div>
                      ) : (
                        repCustomersWithDebt.slice(0, 6).map((c) => (
                          <div key={c.id} onClick={() => { setOpenRepId(null); setOpenCustomerId(c.id); }} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition">
                            <div className="min-w-0 flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-800 font-black flex items-center justify-center shrink-0">{c.name.charAt(0)}</div>
                              <div className="min-w-0"><div className="font-black text-sm text-slate-900 truncate">{c.name}</div><div className="text-xs font-bold text-slate-700 font-mono">{c.code}</div></div>
                            </div>
                            <div className="text-left shrink-0"><div className="font-black text-sm text-rose-700 tabular-nums">{fmt(c.balance)} ج.م</div><div className="text-xs font-bold text-slate-700">مديونية</div></div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* تبويب 2: أداء الشهور */}
              {repAnalysisTab === 'monthly' && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-2">
                    <div>
                      <div className="font-black text-base text-slate-900">تحليل الأداء الشهري</div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">مقارنة التارجت والمحقق للمبيعات والتحصيل</div>
                    </div>
                    <span className="text-xs font-black text-slate-800 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">{selectedRep.repName}</span>
                  </div>

                  {monthlyAnalysis.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-extrabold text-slate-700">لا توجد بيانات شهرية مسجلة لهذا المندوب</div>
                  ) : (
                    monthlyAnalysis.map((m) => {
                      const salesRate = pctOf(m.achSales, m.targetSales);
                      const collRate = pctOf(m.achColl, m.targetColl);
                      return (
                        <div key={m.month} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-xs font-black tabular-nums">{m.month}</span><span className="font-black text-sm text-slate-900">{m.label}</span></div>
                            <div className="flex items-center gap-2 text-xs font-black">
                              <span className={`px-2.5 py-0.5 rounded-lg tabular-nums ${salesRate >= 80 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>بيع {salesRate}%</span>
                              <span className={`px-2.5 py-0.5 rounded-lg tabular-nums ${collRate >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>تحصيل {collRate}%</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-100/70 border border-slate-200 p-3 space-y-1.5">
                              <div className="flex justify-between text-xs"><span className="font-extrabold text-slate-800">المبيعات</span><span className="font-black text-blue-800 tabular-nums">{salesRate}%</span></div>
                              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, salesRate)}%` }} /></div>
                              <div className="flex justify-between text-xs font-bold text-slate-700 tabular-nums"><span>محقق: <b className="text-blue-800">{fmt(m.achSales)}</b></span><span>تارجت: {fmt(m.targetSales)}</span></div>
                            </div>
                            <div className="rounded-xl bg-slate-100/70 border border-slate-200 p-3 space-y-1.5">
                              <div className="flex justify-between text-xs"><span className="font-extrabold text-slate-800">التحصيل</span><span className="font-black text-emerald-800 tabular-nums">{collRate}%</span></div>
                              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, collRate)}%` }} /></div>
                              <div className="flex justify-between text-xs font-bold text-slate-700 tabular-nums"><span>محقق: <b className="text-emerald-800">{fmt(m.achColl)}</b></span><span>تارجت: {fmt(m.targetColl)}</span></div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* تبويب 3: الزيارات */}
              {repAnalysisTab === 'visits' && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex items-center justify-between gap-2">
                    <div className="font-black text-base text-slate-900">سجل الزيارات الميدانية ({repVisits.length})</div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-teal-100 text-teal-800">هذا الشهر: {repMonthlyVisitsCount}</span>
                  </div>
                  <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                    {repVisits.length === 0 ? (
                      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm font-extrabold text-slate-700">لا توجد زيارات ميدانية مسجلة لهذا المندوب</div>
                    ) : (
                      repVisits.map((v: any, idx: number) => (
                        <div key={v.id || idx} className="rounded-2xl bg-white border border-slate-200 p-3.5 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <div className="font-black text-sm text-slate-900 truncate">{v.customerName || 'عميل'}</div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {v.date && <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg tabular-nums">{v.date}</span>}
                                <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-lg">{v.outcome || v.type || 'زيارة'}</span>
                              </div>
                              {v.notes && <div className="text-xs font-semibold text-slate-700 mt-1.5 line-clamp-2">{v.notes}</div>}
                            </div>
                          </div>
                          {Number(v.collectedAmount || 0) > 0 && (
                            <div className="text-left shrink-0"><div className="font-black text-sm text-emerald-700 tabular-nums">{fmt(v.collectedAmount)} ج.م</div><div className="text-xs font-bold text-slate-700">تحصيل</div></div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const repKey = repMatchKey(selectedRep.repName);
                    const cust = allCustomers.find((c) => repMatchKey(c.repName || c.salesRepName) === repKey);
                    if (cust && onOpenNewOrderForCustomer) {
                      onOpenNewOrderForCustomer(cust);
                      setOpenRepId(null);
                    } else if (repCustomers[0] && onOpenNewOrderForCustomer) {
                      onOpenNewOrderForCustomer(repCustomers[0] as any);
                      setOpenRepId(null);
                    }
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-emerald-600 to-teal-500 text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-600/20 hover:from-emerald-500 hover:to-teal-500 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus size={18} />
                  <span>إنشاء فاتورة جديدة لأحد عملاء {selectedRep.repName}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: إحالة العميل للشؤون القانونية مع اختيار السبب/الأيقونة */}
      {legalTransferCustomer && (
        <LegalTransferModal
          customer={legalTransferCustomer as Customer}
          referredByName={currentUser?.name || currentUser?.username || 'الإدارة العليا'}
          referredByRole={currentUser?.role || 'branch_manager'}
          onClose={() => setLegalTransferCustomer(null)}
          onConfirm={(reason, icon) => {
            handleTransferToLegal(legalTransferCustomer, reason, icon);
            setLegalTransferCustomer(null);
          }}
        />
      )}
    </div>
  );
};

export default SmartProfilePage;
