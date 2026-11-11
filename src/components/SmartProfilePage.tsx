import React, { useEffect, useMemo, useState } from 'react';
import {
  Users, Search, Building2, Wallet, ShoppingCart, TrendingUp,
  ChevronRight, ChevronLeft, X, Clock, MapPin, CreditCard,
  AlertTriangle, CheckCircle2, FileText, BarChart3, RefreshCw,
  Plus, Activity, Filter, UserCheck,
  ArrowUpRight, Image as ImageIcon, CalendarCheck, Check, ExternalLink,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { inferTargetSector } from '../services/targetService';
import { normalizeArabicText } from '../services/arabicMatchingService';
import type { Customer, TargetRecord, User } from '../types';
import { formatCurrency } from '../services/invoiceService';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

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

interface SmartProfilePageProps {
  onOpenNewOrderForCustomer?: (customer: Customer) => void;
}

export const SmartProfilePage: React.FC<SmartProfilePageProps> = ({
  onOpenNewOrderForCustomer,
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

  /* ---------- حالة الصفحة ---------- */
  const [activeTab, setActiveTab] = useState<'customers' | 'reps'>('customers');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<'all' | 'home' | 'electrical'>('all');
  const [selectedBranch, setSelectedBranch] = useState('الكل');
  const [selectedSupervisor, setSelectedSupervisor] = useState('الكل');
  const [selectedEligibility, setSelectedEligibility] = useState<'all' | 'eligible' | 'ineligible'>('all');
  const [visibleCustomersCount, setVisibleCustomersCount] = useState(12);
  const [visibleRepsCount, setVisibleRepsCount] = useState(5);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [openRepId, setOpenRepId] = useState<string | null>(null);
  const [repAnalysisTab, setRepAnalysisTab] = useState<'overview' | 'monthly' | 'customers' | 'visits'>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setVisibleCustomersCount(12);
    setVisibleRepsCount(5);
    setOpenCustomerId(null);
    setOpenRepId(null);
  }, [searchQuery, selectedSector, selectedBranch, selectedSupervisor, selectedEligibility, activeTab]);

  /* ---------- البيانات ---------- */
  const allTargets = useMemo(() => getVisibleTargets(), [targets, currentUser, users, customers, getVisibleTargets]);
  const allCustomers = useMemo(() => getVisibleCustomers(), [customers, currentUser, getVisibleCustomers]);
  const allInvoices = useMemo(() => getVisibleInvoices(), [targets, currentUser, getVisibleInvoices]);

  /* ---------- تجميع بيانات المندوبين ---------- */
  type RepProfile = {
    repName: string;
    repId: string;
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

  const repsMap = useMemo(() => {
    const map = new Map<string, RepProfile>();
    const now = new Date();
    const latestYear = now.getFullYear();
    const latestMonth = now.getMonth() + 1;

    for (const t of allTargets) {
      const repName = t.repName || 'غير محدد';
      const repId = t.id || repName;
      const branch = t.branch || '—';
      const sector = inferTargetSector(t, users) || undefined;

      let supervisor = 'بدون مشرف';
      const user = users.find((u) => u?.name && u.name === repName) || users.find((u) => u?.username && u.username === repName);
      if (user?.supervisorName) supervisor = user.supervisorName;
      else if (user?.supervisorId) {
        const sup = users.find((u) => u.id === user.supervisorId);
        if (sup) supervisor = sup.name;
      }

      let existing = map.get(repId);
      if (!existing) {
        existing = {
          repName, repId, branch, sector, supervisor,
          salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0,
          customerCount: 0, debt: 0, overdue: 0,
          monthlySales: {}, monthlyCollection: {},
        };
        map.set(repId, existing);
      }

      const y = String(t.year);
      const m = String(t.month).padStart(2, '0');
      const monthKey = `${y}-${m}`;
      existing.monthlySales[monthKey] = (existing.monthlySales[monthKey] || 0) + Number(t.salesAchieved || 0);
      existing.monthlyCollection[monthKey] = (existing.monthlyCollection[monthKey] || 0) + Number(t.collectionAchieved || 0);

      existing.salesTarget += Number(t.salesTarget || 0);
      existing.salesAchieved += Number(t.salesAchieved || 0);
      existing.collectionTarget += Number(t.collectionTarget || 0);
      existing.collectionAchieved += Number(t.collectionAchieved || 0);
    }

    for (const c of allCustomers) {
      const repId = c.repId || c.salesRepId || c.repName || c.salesRepName || 'غير محدد';
      const repName = c.salesRepName || c.repName || repId;
      const branch = c.branchName || '—';
      const sector = c.sector || undefined;

      let supervisor = 'بدون مشرف';
      const user = users.find((u) => u?.name && u.name === repName) || users.find((u) => u?.username && u.username === repName);
      if (user?.supervisorName) supervisor = user.supervisorName;
      else if (user?.supervisorId) {
        const sup = users.find((u) => u.id === user.supervisorId);
        if (sup) supervisor = sup.name;
      }

      const balance = Number(c.currentBalance ?? c.balance ?? 0);
      const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);

      let existing = map.get(repId);
      if (!existing) {
        existing = {
          repName, repId, branch, sector, supervisor,
          salesTarget: 0, salesAchieved: 0, collectionTarget: 0, collectionAchieved: 0,
          customerCount: 0, debt: 0, overdue: 0,
          monthlySales: {}, monthlyCollection: {},
        };
        map.set(repId, existing);
      }
      existing.customerCount += 1;
      existing.debt += balance;
      existing.overdue += overdue;
    }

    return Array.from(map.values()).sort((a, b) => b.salesAchieved - a.salesAchieved);
  }, [allTargets, allCustomers, users]);

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
      const matchesSearch = !q || rep.repName.toLowerCase().includes(q) || rep.repId.toLowerCase().includes(q) || rep.branch.toLowerCase().includes(q);
      const matchesBranch = selectedBranch === 'الكل' || rep.branch === selectedBranch;
      const matchesSupervisor = selectedSupervisor === 'الكل' || rep.supervisor === selectedSupervisor;
      const matchesSector = selectedSector === 'all' || !rep.sector || rep.sector === 'all' || rep.sector === 'both' || rep.sector === selectedSector;
      return matchesSearch && matchesBranch && matchesSupervisor && matchesSector;
    });
  }, [repsMap, searchQuery, selectedBranch, selectedSupervisor, selectedSector]);

  const displayedReps = useMemo(() => filteredReps.slice(0, visibleRepsCount), [filteredReps, visibleRepsCount]);

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
    address?: string;
    branchName: string;
    storePhotos: string[];
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

  const customersMap = useMemo(() => {
    const map = new Map<string, CustomerProfile>();
    const invoiceByCustomer = new Map<string, { sales: number; collection: number }>();

    for (const inv of allInvoices) {
      const key = inv.customerId || inv.customerName || 'غير محدد';
      let cur = invoiceByCustomer.get(key) || { sales: 0, collection: 0 };
      cur.sales += Number(inv.estimatedGrandTotal || 0);
      if (inv.paymentMethod === 'نقدي (كاش)') cur.collection += Number(inv.estimatedGrandTotal || 0);
      invoiceByCustomer.set(key, cur);
    }

    for (const c of allCustomers) {
      const balance = Number(c.currentBalance ?? c.balance ?? 0);
      const overdue = Number(c.overdueBalance ?? c.totalOverdueAndDue ?? 0);
      const creditLimit = Number(c.creditLimit ?? 0);
      const inv = invoiceByCustomer.get(c.id) || invoiceByCustomer.get(c.code) || invoiceByCustomer.get(c.name) || { sales: 0, collection: 0 };

      let supervisor = 'بدون مشرف';
      const repName = c.salesRepName || c.repName || 'غير محدد';
      const user = users.find((u) => u?.name && u.name === repName) || users.find((u) => u?.username && u.username === repName);
      if (user?.supervisorName) supervisor = user.supervisorName;
      else if (user?.supervisorId) {
        const sup = users.find((u) => u.id === user.supervisorId);
        if (sup) supervisor = sup.name;
      }

      // تصنيف العميل المعتمد من عمود قابل /غير
      const rawDeal = (c.dealEligibility || (c as any).deal_eligibility || (c as any).dealClassification || (c as any).eligibilityStatusLabel || '').trim();
      const isEligible = rawDeal ? (!rawDeal.includes('غير') && !rawDeal.includes('موقوف') && !rawDeal.includes('ممتنع')) : true;
      const eligibilityLabel = rawDeal || (isEligible ? 'قابل للتعامل' : 'غير قابل للتعامل');

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
        totalSales: inv.sales,
        totalCollections: inv.collection,
        tier: c.tier || 'عادي',
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
        address: c.address || c.region || '',
        storePhotos: Array.isArray(c.storePhotos) ? c.storePhotos : [],
      });
    }

    return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
  }, [allCustomers, allInvoices, users]);

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
  const handleOpenRep = (id: string) => setOpenRepId((prev) => (prev === id ? null : id));

  const selectedCustomer = useMemo(() => {
    if (!openCustomerId) return null;
    const raw = allCustomers.find((c) => c.id === openCustomerId);
    const mapped = customersMap.find((c) => c.id === openCustomerId);
    if (!raw && !mapped) return null;
    return { ...(raw || {}), ...(mapped || {}) };
  }, [allCustomers, customersMap, openCustomerId]);

  const selectedRep = useMemo(() => repsMap.find((r) => r.repId === openRepId), [repsMap, openRepId]);

  const repCustomers = useMemo(() => {
    if (!selectedRep) return [];
    return filteredCustomers.filter(
      (c) => c.repName === selectedRep.repName || c.repName === selectedRep.repId
    );
  }, [selectedRep, filteredCustomers]);

  const repCustomersWithDebt = useMemo(() => {
    return repCustomers.filter((c) => c.balance > 0 || c.overdue > 0);
  }, [repCustomers]);

  const repVisits = useMemo(() => {
    if (!selectedRep) return [];
    const all = getVisibleVisits ? getVisibleVisits() : (ctxVisits || []);
    const rName = normalizeArabicText(selectedRep.repName);
    return all.filter((v: any) => {
      if (v.repId && (v.repId === selectedRep.repId || v.repId === selectedRep.repName)) return true;
      if (v.repName && normalizeArabicText(v.repName) === rName) return true;
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
    const repTargets = allTargets.filter(
      (t) => t.repName === selectedRep.repName || t.id === selectedRep.repId
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
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              رئيسية <span className="mx-1 text-[#7fc0ff]">›</span> بروفايلات العملاء والمندوبين
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                {activeTab === 'customers' ? <Users className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  {activeTab === 'customers' ? 'بروفايلات العملاء' : 'بروفايلات المندوبين'}
                </h1>
                <p className="text-xs text-[#c3d9ec] mt-0.5">
                  {activeTab === 'customers'
                    ? 'عرض كل العملاء مع تفاصيل المديونية والتحصيل والمبيعات لكل عميل.'
                    : 'عرض كل المندوبين مع أهدافهم وتحقيقهم وتفاصيل عملائهم.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                activeTab === 'customers'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <Users size={16} />
              العملاء
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reps')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                activeTab === 'reps'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                  : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
              }`}
            >
              <UserCheck size={16} />
              المندوبون
            </button>
            <button
              type="button"
              disabled={isRefreshing}
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-black border border-white/20 bg-white/10 text-white hover:bg-white/20 transition shadow-xs cursor-pointer disabled:opacity-50"
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
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم العميل أو الكود أو الهاتف..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-[var(--tg-line)] rounded-xl text-sm font-bold text-[#0b2337] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition"
                />
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">القطاع</span>
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
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">الفرع</span>
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

              <div className="flex flex-col justify-center bg-[#eef5fd] dark:bg-slate-800 border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-none mb-1">المشرف / المندوب</span>
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="bg-transparent font-black text-[#0b2337] dark:text-white text-sm focus:outline-none cursor-pointer w-full"
                >
                  {supervisorOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] dark:bg-slate-800 border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 leading-none mb-1">تصنيف الشيت (قابل / غير)</span>
                <select
                  value={selectedEligibility}
                  onChange={(e) => setSelectedEligibility(e.target.value as any)}
                  className="bg-transparent font-black text-[#0b2337] dark:text-white text-sm focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">كل التصنيفات</option>
                  <option value="eligible">قابل للتعامل</option>
                  <option value="ineligible">غير قابل للتعامل</option>
                </select>
              </div>
            </div>
          </section>

          {/* كروت العملاء (بروفايل) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedCustomers.length === 0 ? (
              <div className="col-span-full tg-card p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[28px] bg-slate-100 text-slate-400 shadow-inner">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-[#0b2337]">لا يوجد عملاء مطابقة للبحث</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">جرّب تعديل البحث أو الفلاتر.</p>
              </div>
            ) : (
              displayedCustomers.map((cust) => {
                const exceeded = cust.creditLimit > 0 && (cust.balance + cust.overdue) > cust.creditLimit;
                return (
                  <div
                    key={cust.id}
                    onClick={() => handleOpenCustomer(cust.id)}
                    className="tg-card p-4 sm:p-5 cursor-pointer group hover:border-blue-300 hover:shadow-[0_18px_40px_rgba(9,30,66,0.14)] hover:-translate-y-1 transition-all border-[var(--tg-line)] relative overflow-hidden"
                  >
                    <span className={`absolute top-0 inset-x-0 h-1 ${
                      cust.sector === 'home'
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-400'
                        : cust.sector === 'electrical'
                          ? 'bg-gradient-to-r from-purple-500 to-violet-400'
                          : 'bg-gradient-to-r from-slate-400 to-slate-300'
                    }`} />
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className={`w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center font-black text-lg shadow-md ring-2 ${
                            cust.sector === 'home'
                              ? 'bg-gradient-to-br from-blue-600 to-indigo-500 text-white ring-blue-200'
                              : cust.sector === 'electrical'
                                ? 'bg-gradient-to-br from-purple-600 to-violet-500 text-white ring-purple-200'
                                : 'bg-gradient-to-br from-slate-700 to-slate-500 text-white ring-slate-200'
                          }`}>
                            {cust.storePhotos && cust.storePhotos.length > 0 ? (
                              <img src={cust.storePhotos[0]} alt={cust.name} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <span>{cust.name.charAt(0)}</span>
                            )}
                          </div>
                          {cust.storePhotos && cust.storePhotos.length > 1 && (
                            <span className="absolute -bottom-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white">
                              +{cust.storePhotos.length - 1}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-sm text-[#0b2337] truncate">{cust.name}</div>
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 flex-wrap">
                            <span className="font-mono">{cust.code}</span>
                            {cust.phone && cust.phone !== '—' && <span>• {cust.phone}</span>}
                          </div>
                          {cust.branch && cust.branch !== '—' && (
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{cust.branch}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {/* تصنيف الشيت (قابل / غير) */}
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs ${
                          (cust as any).isEligible
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                        }`}>
                          {(cust as any).dealEligibility || 'قابل للتعامل'}
                        </span>
                        <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full ${
                          exceeded
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : cust.balance > 0
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {exceeded ? 'تجاوز الحد' : cust.balance > 0 ? 'عليه مستحق' : 'خالص'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">مديونية</div>
                        <div className="text-xs font-black text-[#0b2337] tabular-nums">{fmt(cust.balance)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">متأخرات</div>
                        <div className={`text-xs font-bold ${exceeded ? 'text-rose-700' : 'text-emerald-700'} tabular-nums`}>{fmt(cust.overdue)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">مبيعات</div>
                        <div className="text-xs font-black text-blue-700 tabular-nums">{fmt(cust.totalSales)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">تحصيل</div>
                        <div className="text-xs font-black text-emerald-700 tabular-nums">{fmt(cust.totalCollections)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--tg-line)] text-xs">
                      <span className="font-bold text-slate-600">الفئة:</span>
                      <span className={`font-black ${cust.tier === 'مميز' ? 'text-blue-700' : cust.tier === 'راقي' ? 'text-emerald-700' : cust.tier === 'متوسط' ? 'text-amber-700' : 'text-slate-700'}`}>
                        {cust.tier}
                      </span>
                    </div>
                  </div>
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
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* فلاتر المندوبين */}
          <section className="tg-card p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم المندوب أو الكود أو الفرع..."
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-[var(--tg-line)] rounded-xl text-sm font-bold text-[#0b2337] placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition"
                />
              </div>

              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[140px]">
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">القطاع</span>
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
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">الفرع</span>
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
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">المشرف</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayedReps.length === 0 ? (
              <div className="col-span-full tg-card p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[28px] bg-slate-100 text-slate-400 shadow-inner">
                  <UserCheck className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-[#0b2337]">لا يوجد مندوبون مطابقة للبحث</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">جرّب تعديل البحث أو الفلاتر.</p>
              </div>
            ) : (
              displayedReps.map((rep) => {
                const salesPct = pctOf(rep.salesAchieved, rep.salesTarget);
                const collPct = pctOf(rep.collectionAchieved, rep.collectionTarget);
                return (
                  <div
                    key={rep.repId}
                    onClick={() => handleOpenRep(rep.repId)}
                    className="tg-card p-4 sm:p-5 cursor-pointer group hover:border-blue-300/60 transition border-[var(--tg-line)]"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black shadow-sm">
                          {rep.repName.charAt(0)}
                        </div>
                        <div>
                          <div className="font-black text-sm text-[#0b2337] truncate">{rep.repName}</div>
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 flex-wrap">
                            <span className="font-mono">{rep.repId}</span>
                            {rep.branch && <span>• {rep.branch}</span>}
                          </div>
                          <span className={`text-[10px] ${getSectorColor(rep.sector)}`}>
                            {getSectorLabel(rep.sector)}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        salesPct >= 100 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        salesPct >= 70 ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                        'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {salesPct}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">مديونية عملاءه</div>
                        <div className="text-xs font-black text-[#0b2337] tabular-nums">{fmt(rep.debt)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">متأخرات</div>
                        <div className={`text-xs font-bold ${rep.overdue > 0 ? 'text-rose-700' : 'text-emerald-700'} tabular-nums`}>{fmt(rep.overdue)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">مبيعات</div>
                        <div className="text-xs font-black text-blue-700 tabular-nums">{fmt(rep.salesAchieved)}</div>
                      </div>
                      <div className="bg-slate-50 rounded-xl p-3 border border-[var(--tg-line)]">
                        <div className="text-[10px] font-bold text-slate-500 mb-0.5">تحصيل</div>
                        <div className="text-xs font-black text-emerald-700 tabular-nums">{fmt(rep.collectionAchieved)}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--tg-line)] text-xs">
                      <span className="font-bold text-slate-600">عملاءه:</span>
                      <span className="font-black text-sm text-[#0b2337]">{rep.customerCount}</span>
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

      {/* ================= درج تفاصيل المندوب (يمين الشاشة) ================= */}
      {selectedRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" onClick={() => setOpenRepId(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={(e) => e.stopPropagation()} />
          <div className="w-full sm:max-w-[560px] max-h-[90vh] bg-white rounded-[28px] shadow-2xl border border-[var(--tg-line)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 bg-[var(--tg-navy-700)] text-white p-4 sm:p-5 sticky top-0 z-10 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-black text-sm">{selectedRep.repName}</div>
                  <div className="text-[10px] text-[#a9c8e4] font-medium">
                    {selectedRep.branch} • {getSectorLabel(selectedRep.sector)} • مشرف: {selectedRep.supervisor}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setRepAnalysisTab('overview')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    repAnalysisTab === 'overview'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  نظرة عامة
                </button>
                <button
                  type="button"
                  onClick={() => setRepAnalysisTab('monthly')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    repAnalysisTab === 'monthly'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  أداء الشهور
                </button>
                <button
                  type="button"
                  onClick={() => setRepAnalysisTab('customers')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    repAnalysisTab === 'customers'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  العملاء ({repCustomers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRepAnalysisTab('visits')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                    repAnalysisTab === 'visits'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  زيارات الشهر ({repMonthlyVisitsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setOpenRepId(null)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1">
              {/* تبويب 1: نظرة عامة */}
              {repAnalysisTab === 'overview' && (
                <div className="space-y-4">
                  {/* كروت المؤشرات الستة */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="tg-stat tg-stat--amber p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-amber-800 block">مديونية عملاءه</span>
                      <span className="font-black text-sm text-amber-700 tabular-nums">{fmt(selectedRep.debt)} ج.م</span>
                    </div>
                    <div className="tg-stat tg-stat--red p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-rose-800 block">المتأخرات</span>
                      <span className={`font-black text-sm ${selectedRep.overdue > 0 ? 'text-rose-700' : 'text-emerald-700'} tabular-nums`}>
                        {fmt(selectedRep.overdue)} ج.م
                      </span>
                    </div>
                    <div className="tg-stat tg-stat--emerald p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-emerald-800 block">إجمالي التحصيل</span>
                      <span className="font-black text-sm text-emerald-700 tabular-nums">{fmt(selectedRep.collectionAchieved)} ج.م</span>
                    </div>
                    <div className="tg-stat tg-stat--blue p-3 rounded-2xl">
                      <span className="text-[10px] font-bold text-blue-800 block">إجمالي المبيعات</span>
                      <span className="font-black text-sm text-blue-700 tabular-nums">{fmt(selectedRep.salesAchieved)} ج.م</span>
                    </div>
                    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3">
                      <span className="text-[10px] font-bold text-teal-800 block">زيارات الشهر الحالي</span>
                      <span className="font-black text-sm text-teal-700 tabular-nums">{repMonthlyVisitsCount} زيارة</span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                      <span className="text-[10px] font-bold text-slate-700 block">عدد العملاء التابعين</span>
                      <span className="font-black text-sm text-slate-800 tabular-nums">{selectedRep.customerCount} عميل</span>
                    </div>
                  </div>

                  {/* مقارنة الأهداف الإجمالية */}
                  <div className="tg-card p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600">هدف المبيعات الإجمالي</span>
                      <span className="font-black text-blue-900">{fmt(selectedRep.salesTarget)} ج.م</span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">نسبة تحقيق المبيعات</span>
                        <span className={`font-black ${pctOf(selectedRep.salesAchieved, selectedRep.salesTarget) >= 100 ? 'text-emerald-700' : 'text-blue-700'}`}>
                          {pctOf(selectedRep.salesAchieved, selectedRep.salesTarget)}% ({fmt(selectedRep.salesAchieved)} ج.م)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, pctOf(selectedRep.salesAchieved, selectedRep.salesTarget))}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-600">هدف التحصيل الإجمالي</span>
                        <span className="font-black text-emerald-900">{fmt(selectedRep.collectionTarget)} ج.م</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500">نسبة تحقيق التحصيل</span>
                        <span className={`font-black ${pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget) >= 100 ? 'text-emerald-700' : 'text-emerald-600'}`}>
                          {pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget)}% ({fmt(selectedRep.collectionAchieved)} ج.م)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, pctOf(selectedRep.collectionAchieved, selectedRep.collectionTarget))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* عملاء عليهم مديونية سريعة */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-[#0b2337]">عملاء عليهم مديونية ({repCustomersWithDebt.length})</span>
                      <button
                        type="button"
                        onClick={() => setRepAnalysisTab('customers')}
                        className="text-[11px] font-bold text-blue-600 hover:underline"
                      >
                        عرض كل العملاء ↗
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                      {repCustomersWithDebt.length === 0 ? (
                        <div className="tg-card p-4 text-center text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                          جميع عملاء هذا المندوب خالصون ولا توجد مديونيات متأخرة!
                        </div>
                      ) : (
                        repCustomersWithDebt.slice(0, 5).map((c) => (
                          <div
                            key={c.id}
                            onClick={() => { setOpenRepId(null); setOpenCustomerId(c.id); }}
                            className="tg-card p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-black text-xs text-[#0b2337] truncate">{c.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{c.code}</div>
                            </div>
                            <div className="text-left shrink-0">
                              <div className="text-xs font-black text-rose-700 tabular-nums">{fmt(c.balance)} ج.م</div>
                              <div className="text-[9px] text-slate-400">اضغط لفتح الملف</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* تبويب 2: أداء الشهور وتحليل التارجت والمحقق */}
              {repAnalysisTab === 'monthly' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-bold mb-1">
                    <span>تحليل الأداء الشهري لعام 2026</span>
                    <span>المندوب: {selectedRep.repName}</span>
                  </div>

                  {monthlyAnalysis.length === 0 ? (
                    <div className="tg-card p-6 text-center text-xs font-bold text-slate-500">
                      لا توجد أهداف أو مبيعات مسجلة في شيت التارجت لهذا المندوب
                    </div>
                  ) : (
                    monthlyAnalysis.map((m) => {
                      const salesRate = pctOf(m.achSales, m.targetSales);
                      const collRate = pctOf(m.achColl, m.targetColl);

                      return (
                        <div key={m.month} className="tg-card p-3.5 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="font-black text-sm text-[#0b2337] flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-600" />
                              شهر {m.label} ({m.month})
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">2026</span>
                          </div>

                          {/* البيع */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-600 font-bold">
                                مبيعات: <strong className="text-blue-700">{fmt(m.achSales)}</strong> / تارجت: {fmt(m.targetSales)} ج.م
                              </span>
                              <span className={`font-black ${salesRate >= 100 ? 'text-emerald-700' : 'text-blue-700'}`}>
                                {salesRate}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-600 rounded-full"
                                style={{ width: `${Math.min(100, salesRate)}%` }}
                              />
                            </div>
                          </div>

                          {/* التحصيل */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="text-slate-600 font-bold">
                                تحصيل: <strong className="text-emerald-700">{fmt(m.achColl)}</strong> / تارجت: {fmt(m.targetColl)} ج.م
                              </span>
                              <span className={`font-black ${collRate >= 100 ? 'text-emerald-700' : 'text-emerald-600'}`}>
                                {collRate}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(100, collRate)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* تبويب 3: قائمة عملاء المندوب */}
              {repAnalysisTab === 'customers' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
                    <span>جميع العملاء التابعين للمندوب ({repCustomers.length})</span>
                    <span className="text-amber-700">{repCustomersWithDebt.length} عليهم مديونية</span>
                  </div>

                  <div className="space-y-2 max-h-[440px] overflow-y-auto">
                    {repCustomers.length === 0 ? (
                      <div className="tg-card p-6 text-center text-xs font-bold text-slate-500">
                        لا يوجد عملاء مسجلين تحت هذا المندوب
                      </div>
                    ) : (
                      repCustomers.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => { setOpenRepId(null); setOpenCustomerId(c.id); }}
                          className="tg-card p-3 flex items-center justify-between gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-black text-xs text-[#0b2337] group-hover:text-blue-700 truncate">{c.name}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{c.code}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {c.branch} {c.phone ? `• ${c.phone}` : ''}
                            </div>
                          </div>
                          <div className="text-left shrink-0">
                            <div className={`text-xs font-black tabular-nums ${c.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {fmt(c.balance)} ج.م
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {c.balance > 0 ? 'مديونية' : 'خالص'}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* تبويب 4: زيارات المندوب */}
              {repAnalysisTab === 'visits' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 mb-1">
                    <span>سجل الزيارات الميدانية للمندوب ({repVisits.length})</span>
                    <span className="text-teal-700">هذا الشهر: {repMonthlyVisitsCount}</span>
                  </div>

                  <div className="space-y-2 max-h-[440px] overflow-y-auto">
                    {repVisits.length === 0 ? (
                      <div className="tg-card p-6 text-center text-xs font-bold text-slate-500">
                        لا توجد زيارات ميدانية مسجلة لهذا المندوب
                      </div>
                    ) : (
                      repVisits.map((v: any, idx: number) => (
                        <div key={v.id || idx} className="tg-card p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="font-black text-xs text-[#0b2337]">{v.customerName || 'عميل'}</span>
                              <span className="text-[10px] font-bold text-slate-400">{v.date}</span>
                              <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {v.outcome || v.type || 'زيارة'}
                              </span>
                            </div>
                            {v.notes && (
                              <div className="text-[10px] text-slate-400 truncate">
                                {v.notes}
                              </div>
                            )}
                          </div>
                          {Number(v.collectedAmount || 0) > 0 && (
                            <div className="text-left shrink-0">
                              <div className="text-xs font-black text-emerald-700 tabular-nums">{fmt(v.collectedAmount)} ج.م</div>
                              <div className="text-[9px] text-slate-400">تحصيل</div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* زر إنشاء فاتورة سريعة لأحد عملاء المندوب */}
              <div className="mt-4 pt-4 border-t border-[var(--tg-line)]">
                <button
                  type="button"
                  onClick={() => {
                    const cust = allCustomers.find((c) => c.repName === selectedRep.repName || c.repId === selectedRep.repId);
                    if (cust && onOpenNewOrderForCustomer) {
                      onOpenNewOrderForCustomer(cust);
                      setOpenRepId(null);
                    } else if (repCustomers[0] && onOpenNewOrderForCustomer) {
                      onOpenNewOrderForCustomer(repCustomers[0] as any);
                      setOpenRepId(null);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-500 transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus size={16} />
                  فاتورة جديدة لأحد عملاء {selectedRep.repName}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartProfilePage;
