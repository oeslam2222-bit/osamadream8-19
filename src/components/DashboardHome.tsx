import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Bell,
  Building2,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Filter,
  MapPin,
  Plus,
  Receipt,
  Search,
  ShoppingCart,
  Target,
  TrendingUp,
  User,
  Users,
  Wallet
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { MONTH_NAMES_AR, filterCustomersByRBAC } from '../services/customerAnalyticsService';
import { isArabicNameMatch, isBranchMatch } from '../services/arabicMatchingService';
import { Customer, CustomerVisit, Invoice, TargetRecord } from '../types';

interface DashboardHomeProps {
  onNavigateToTab: (tab: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

const NAVY = '#102b4e';
const GOLD = '#c99a43';
const BLUE = '#1e5f9d';
const TARGET_BAR = '#d7e2ef';
const PIE_COLORS = [NAVY, GOLD, BLUE, '#8fa3bf'];
const GRID_STROKE = '#e3ebf3';
const TICK_FILL = '#5b6577';
const BRASS_INK = 'text-warn';
const BRASS_SOFT = 'bg-[rgba(155,112,39,.12)]';
const MASK = '••••••';

const customerSales = (c: Customer): number => {
  const monthly = c.monthlySales2026
    ? Object.values(c.monthlySales2026).reduce((acc, v) => acc + (Number(v) || 0), 0)
    : 0;
  return Math.max(c.sales2026 || 0, c.totalMonthlySales || 0, c.totalOverallSales || 0, monthly);
};

const customerCollections = (c: Customer): number => {
  const monthly = c.monthlyCollections2026
    ? Object.values(c.monthlyCollections2026).reduce((acc, v) => acc + Math.abs(Number(v) || 0), 0)
    : 0;
  return Math.max(
    Math.abs(Number(c.collections2026) || 0),
    Math.abs(Number(c.totalMonthlyCollections) || 0),
    Math.abs(Number(c.totalOverallCollections) || 0),
    monthly
  );
};

const visitMonth = (raw?: string): { year: number; month: number } | null => {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime()) && String(raw).length > 7) {
    return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
  }
  const m = String(raw).match(/(\d{4})[-/](\d{1,2})/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  return null;
};

const customerDealCategory = (customer: Customer): string | null => {
  const dealt = String(customer.dealt2026 || '').trim();
  const eligibility = String(customer.dealEligibility || '').trim();

  if (customer.hasDealtIn2026 || (dealt.includes('متعامل') && !dealt.includes('غير'))) {
    return 'متعامل';
  }
  if (eligibility.includes('غير') || eligibility.includes('موقوف')) return 'غير قابل للتعامل';
  if (eligibility.includes('قابل')) return 'قابل للتعامل';
  return null;
};

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigateToTab }) => {
  const {
    currentUser,
    users,
    branches,
    customers,
    invoices = [],
    getVisibleInvoices,
    getVisibleVisits,
    getVisibleTargets,
    isPrivacyMode
  } = useApp();

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isFieldRole = isRep || isSupervisor;

  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedSupervisor, setSelectedSupervisor] = useState('ALL');
  const [selectedRep, setSelectedRep] = useState('ALL');

  const visibleCustomers = useMemo(
    () => filterCustomersByRBAC(customers, currentUser, users),
    [customers, currentUser, users]
  );

  const availableBranches = useMemo(() => {
    const set = new Set<string>();
    visibleCustomers.forEach((c) => {
      if (c.branchName) set.add(c.branchName);
    });
    branches.forEach((b) => {
      if (b.name && !b.isMainWarehouse) set.add(b.name);
    });
    return Array.from(set);
  }, [visibleCustomers, branches]);

  const availableSupervisors = useMemo(() => {
    const fromUsers = users
      .filter((u) => u.role === 'supervisor')
      .filter((u) => selectedBranch === 'ALL' || isBranchMatch(u.branchName, selectedBranch))
      .map((u) => u.name);
    const fromCustomers = visibleCustomers
      .filter((c) => selectedBranch === 'ALL' || isBranchMatch(c.branchName, selectedBranch))
      .map((c) => c.supervisorName)
      .filter(Boolean) as string[];
    return Array.from(new Set([...fromUsers, ...fromCustomers]));
  }, [users, visibleCustomers, selectedBranch]);

  const availableReps = useMemo(() => {
    const supervisedIds =
      selectedSupervisor === 'ALL'
        ? null
        : new Set(
            users
              .filter(
                (u) =>
                  u.role === 'sales_rep' &&
                  (isArabicNameMatch(u.name, selectedSupervisor) ||
                    users.find((s) => s.id === u.supervisorId && isArabicNameMatch(s.name, selectedSupervisor)))
              )
              .map((u) => u.name)
          );
    const set = new Set<string>();
    visibleCustomers.forEach((c) => {
      if (selectedBranch !== 'ALL' && !isBranchMatch(c.branchName, selectedBranch)) return;
      if (selectedSupervisor !== 'ALL') {
        const matchSup = isArabicNameMatch(c.supervisorName || '', selectedSupervisor);
        const matchRepUnder = supervisedIds ? supervisedIds.has(c.salesRepName || c.repName || '') : false;
        if (!matchSup && !matchRepUnder) return;
      }
      const r = c.salesRepName || c.repName;
      if (r) set.add(r);
    });
    return Array.from(set);
  }, [visibleCustomers, selectedBranch, selectedSupervisor, users]);

  const scopedCustomers = useMemo(() => {
    return visibleCustomers.filter((c) => {
      if (selectedBranch !== 'ALL' && !isBranchMatch(c.branchName, selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL') {
        const matchName = isArabicNameMatch(c.supervisorName || '', selectedSupervisor);
        const supervisorUser = users.find((u) => isArabicNameMatch(u.name, selectedSupervisor) && u.role === 'supervisor');
        const repUser = users.find(
          (u) =>
            u.role === 'sales_rep' &&
            (isArabicNameMatch(u.name, c.salesRepName || '') || isArabicNameMatch(u.name, c.repName || ''))
        );
        const underSupervisor = supervisorUser && repUser?.supervisorId === supervisorUser.id;
        if (!matchName && !underSupervisor) return false;
      }
      if (selectedRep !== 'ALL') {
        const r = c.salesRepName || c.repName || '';
        if (!isArabicNameMatch(r, selectedRep)) return false;
      }
      return true;
    });
  }, [visibleCustomers, selectedBranch, selectedSupervisor, selectedRep, users]);

  const scopedRepNames = useMemo(() => {
    const set = new Set<string>();
    scopedCustomers.forEach((c) => {
      if (c.salesRepName) set.add(c.salesRepName);
      if (c.repName) set.add(c.repName);
    });
    if (selectedRep !== 'ALL') set.add(selectedRep);
    return set;
  }, [scopedCustomers, selectedRep]);

  const visits = getVisibleVisits();
  const targets = getVisibleTargets();
  const visibleInvoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices, invoices]);

  const scopedVisits = useMemo(() => {
    return visits.filter((v: CustomerVisit) => {
      if (selectedBranch !== 'ALL' && v.branchName && !isBranchMatch(v.branchName, selectedBranch)) return false;
      if (selectedSupervisor !== 'ALL' && v.supervisorName && !isArabicNameMatch(v.supervisorName, selectedSupervisor)) {
        if (v.repName && !scopedRepNames.has(v.repName)) return false;
      }
      if (selectedRep !== 'ALL' && v.repName && !isArabicNameMatch(v.repName, selectedRep)) return false;
      return true;
    });
  }, [visits, selectedBranch, selectedSupervisor, selectedRep, scopedRepNames]);

  const scopedTargets = useMemo(() => {
    return targets.filter((t: TargetRecord) => {
      if (selectedBranch !== 'ALL' && t.branch && !isBranchMatch(t.branch, selectedBranch)) return false;
      if (selectedRep !== 'ALL' && t.repName && !isArabicNameMatch(t.repName, selectedRep)) return false;
      if (selectedSupervisor !== 'ALL' && t.repName && scopedRepNames.size > 0 && !scopedRepNames.has(t.repName)) {
        return false;
      }
      return t.year === 2026 || !t.year;
    });
  }, [targets, selectedBranch, selectedRep, selectedSupervisor, scopedRepNames]);

  const stats = useMemo(() => {
    const monthlySales: number[] = Array(12).fill(0);
    const monthlyCollections: number[] = Array(12).fill(0);
    const monthlyVisits: number[] = Array(12).fill(0);
    const monthlyTargetSales: number[] = Array(12).fill(0);
    const monthlyTargetCollections: number[] = Array(12).fill(0);

    let sales = 0;
    let collections = 0;
    let debt = 0;
    let overdue = 0;
    let visitsTotal = 0;

    scopedCustomers.forEach((c) => {
      sales += customerSales(c);
      collections += customerCollections(c);
      debt += c.currentBalance ?? c.balance ?? 0;
      overdue += c.totalOverdueAndDue ?? c.overdueBalance ?? 0;
      visitsTotal += c.visitCount2026 || 0;
      if (c.monthlySales2026) {
        for (let m = 1; m <= 12; m++) monthlySales[m - 1] += Number(c.monthlySales2026[m]) || 0;
      }
      if (c.monthlyCollections2026) {
        for (let m = 1; m <= 12; m++) monthlyCollections[m - 1] += Number(c.monthlyCollections2026[m]) || 0;
      }
      (c.visitHistory || []).forEach((v) => {
        const ym = visitMonth(v.date);
        if (ym && ym.year === 2026) monthlyVisits[ym.month - 1] += 1;
      });
    });

    scopedVisits.forEach((v) => {
      const ym = visitMonth(v.date);
      if (ym && (ym.year === 2026 || !ym.year)) monthlyVisits[ym.month - 1] += 1;
    });

    const visitSumFromMonths = monthlyVisits.reduce((a, b) => a + b, 0);
    if (visitSumFromMonths > visitsTotal) visitsTotal = visitSumFromMonths;

    scopedTargets.forEach((t) => {
      const idx = Math.min(11, Math.max(0, (t.month || 1) - 1));
      monthlyTargetSales[idx] += Number(t.salesTarget) || 0;
      monthlyTargetCollections[idx] += Number(t.collectionTarget) || 0;
    });

    const targetSales = monthlyTargetSales.reduce((a, b) => a + b, 0);
    const targetCollections = monthlyTargetCollections.reduce((a, b) => a + b, 0);

    return {
      customers: scopedCustomers.length,
      sales,
      collections,
      debt,
      overdue,
      visitsTotal,
      targetSales,
      targetCollections,
      monthlySales,
      monthlyCollections,
      monthlyVisits,
      monthlyTargetSales,
      monthlyTargetCollections
    };
  }, [scopedCustomers, scopedVisits, scopedTargets]);

  const money = (n: number) => (isPrivacyMode ? MASK : formatCurrency(n));
  const compact = (n: number) =>
    isPrivacyMode
      ? MASK
      : n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000
          ? `${(n / 1_000).toFixed(0)}K`
          : String(Math.round(n));
  const num = (n: number) => (isPrivacyMode ? MASK : n.toLocaleString('en-US'));

  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const kpis = useMemo(() => {
    if (isFieldRole) {
      if (isSupervisor) {
        return [
          {
            label: 'الزيارات',
            value: num(stats.visitsTotal),
            icon: MapPin,
            tint: 'bg-blue-deep',
            color: 'text-[var(--app-navy)]'
          },
          {
            label: 'العملاء',
            value: num(stats.customers),
            icon: Users,
            tint: 'bg-blue-soft2',
            color: 'text-[var(--app-blue)]'
          },
          {
            label: 'مبيعات 2026',
            value: money(stats.sales),
            icon: TrendingUp,
            tint: 'bg-teal-soft',
            color: 'text-[var(--app-ok)]'
          },
          {
            label: 'تحصيلات 2026',
            value: money(stats.collections),
            icon: Wallet,
            tint: 'bg-amber-pale',
            color: 'text-[var(--app-gold)]'
          }
        ];
      }
      return [
        {
          label: 'الزيارات',
          value: num(stats.visitsTotal),
          icon: MapPin,
          tint: 'bg-blue-deep',
          color: 'text-[var(--app-navy)]'
        },
        {
          label: 'مبيعات 2026',
          value: money(stats.sales),
          icon: TrendingUp,
          tint: 'bg-teal-soft',
          color: 'text-[var(--app-ok)]'
        },
        {
          label: 'تحصيلات 2026',
          value: money(stats.collections),
          icon: Wallet,
          tint: 'bg-amber-pale',
          color: 'text-[var(--app-gold)]'
        },
        {
          label: 'العملاء',
          value: num(stats.customers),
          icon: Users,
          tint: 'bg-blue-soft2',
          color: 'text-[var(--app-blue)]'
        }
      ];
    }

    return [
      {
        label: 'مبيعات 2026',
        value: money(stats.sales),
        icon: TrendingUp,
        tint: 'bg-teal-soft',
        color: 'text-[var(--app-ok)]'
      },
      {
        label: 'تحصيلات 2026',
        value: money(stats.collections),
        icon: Wallet,
        tint: 'bg-amber-pale',
        color: 'text-[var(--app-gold)]'
      },
      {
        label: 'العملاء',
        value: num(stats.customers),
        icon: Users,
        tint: 'bg-blue-soft2',
        color: 'text-[var(--app-blue)]'
      },
      {
        label: 'الزيارات',
        value: num(stats.visitsTotal),
        icon: MapPin,
        tint: 'bg-blue-deep',
        color: 'text-[var(--app-navy)]'
      },
      {
        label: 'تارجت البيع 2026',
        value: money(stats.targetSales),
        icon: Target,
        tint: BRASS_SOFT,
        color: BRASS_INK
      }
    ];
  }, [isFieldRole, isSupervisor, stats, isPrivacyMode]);

  const monthChart = MONTH_NAMES_AR.map((month, i) => ({
    month: month.slice(0, 3),
    full: month,
    مبيعات: stats.monthlySales[i],
    تارجت: stats.monthlyTargetSales[i],
    زيارات: stats.monthlyVisits[i]
  }));

  const salesCollectionsChart = useMemo(() => {
    return MONTH_NAMES_AR.map((m, i) => ({
      name: m.slice(0, 4),
      full: m,
      sales: stats.monthlySales[i] || 0,
      collections: stats.monthlyCollections[i] || 0
    }));
  }, [stats]);

  const customerStatusDistribution = useMemo(() => {
    const counts = new Map<string, number>([
      ['متعامل', 0],
      ['قابل للتعامل', 0],
      ['غير قابل للتعامل', 0]
    ]);
    scopedCustomers.forEach((c) => {
      const category = customerDealCategory(c);
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [
      { name: 'متعامل', value: counts.get('متعامل') || 0, color: '#009488', count: counts.get('متعامل') || 0 },
      { name: 'قابل للتعامل', value: counts.get('قابل للتعامل') || 0, color: '#f59e0b', count: counts.get('قابل للتعامل') || 0 },
      { name: 'غير قابل للتعامل', value: counts.get('غير قابل للتعامل') || 0, color: '#ef4444', count: counts.get('غير قابل للتعامل') || 0 }
    ];
  }, [scopedCustomers]);

  const displayedCustomers = useMemo(() => {
    return scopedCustomers.slice(0, 4);
  }, [scopedCustomers]);

  const recentInvoices = useMemo(() => {
    return [...visibleInvoices].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.timestamp || a.date).getTime();
      const dateB = new Date(b.createdAt || b.timestamp || b.date).getTime();
      return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
    }).slice(0, 4);
  }, [visibleInvoices]);

  const upcomingVisits = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return scopedVisits
      .filter((visit) => {
        const date = new Date(visit.date);
        if (Number.isNaN(date.getTime()) || date < today) return false;
        return !['منفذة', 'ملغاة', 'لم تتم'].includes(visit.status || '');
      })
      .sort((a, b) => new Date(`${a.date}T${a.time || '00:00'}`).getTime() - new Date(`${b.date}T${b.time || '00:00'}`).getTime())
      .slice(0, 3);
  }, [scopedVisits]);

  const resetFilters = () => {
    setSelectedBranch('ALL');
    setSelectedSupervisor('ALL');
    setSelectedRep('ALL');
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      {/* ======================================================== */}
      {/* 1. MOBILE VIEW (واجهة المندوب - الموبايل)                */}
      {/* ======================================================== */}
      <div className="md:hidden space-y-4">
        {/* Top Rep Greeting Bar */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-3 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-[color:var(--brand-teal)] text-white flex items-center justify-center font-bold text-base shadow-xs">
                {currentUser?.name ? currentUser.name.slice(0, 1) : 'م'}
              </div>
              <span className="absolute bottom-0 left-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
            </div>
            <div>
              <div className="font-black text-slate-900 text-sm">{currentUser?.name || 'مستخدم'}</div>
              <div className="text-[11px] text-slate-600 font-semibold">
                {currentUser?.role === 'sales_rep' ? 'مندوب المبيعات' : currentUser?.role === 'supervisor' ? 'مشرف المبيعات' : 'إدارة المبيعات'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToTab('notifications')}
            className="w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 relative cursor-pointer"
            aria-label="الإشعارات"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Colorful Action Metric Cards (2x2 Grid) matching Reference Mockup */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Card 1: العملاء (Teal) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="kpi-tile kpi-tile--teal kpi-tile--clickable text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between text-right active:scale-95 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="kpi-tile__label text-xs font-bold">العملاء</span>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {scopedCustomers.length}
            </div>
          </button>

          {/* Card 2: الزيارات (Cerulean Blue) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="kpi-tile kpi-tile--blue kpi-tile--clickable text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between text-right active:scale-95 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="kpi-tile__label text-xs font-bold">الزيارات</span>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {scopedVisits.length}
            </div>
          </button>

          {/* Card 3: الفواتير (Warm Amber) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="kpi-tile kpi-tile--amber kpi-tile--clickable text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between text-right active:scale-95 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="kpi-tile__label text-xs font-bold">الفواتير</span>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {visibleInvoices.length}
            </div>
          </button>

          {/* Card 4: التحصيلات (Purple/Indigo) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="kpi-tile kpi-tile--indigo kpi-tile--clickable text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between text-right active:scale-95 cursor-pointer"
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="kpi-tile__label text-xs font-bold">التحصيلات</span>
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {money(stats.collections)}
            </div>
          </button>
        </div>

        {/* Customer List */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
              <MapPin className="w-4 h-4 text-[color:var(--brand-teal)]" />
              <span>العملاء</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('all_customers')}
              className="text-[11px] font-bold text-[color:var(--brand-teal)] hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <span>عرض الكل</span>
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {displayedCustomers.length > 0 ? displayedCustomers.map((cust) => {
              const dealCategory = customerDealCategory(cust);
              return (
                <div
                  key={cust.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60 transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 ml-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {cust.name.slice(0, 1)}
                    </div>
                    <div className="truncate min-w-0">
                      <div className="font-bold text-slate-900 text-xs truncate">{cust.name}</div>
                      <div className="text-[10px] text-slate-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <span className="truncate">{cust.address || cust.region || cust.branchName || 'لم يحدد العنوان'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {dealCategory && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                        dealCategory === 'متعامل'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : dealCategory === 'قابل للتعامل'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}>
                        {dealCategory}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onNavigateToTab('visits')}
                      className="bg-[color:var(--brand-teal)] text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer hover:bg-teal-dark-hover"
                      title="تسجيل زيارة للعميل"
                    >
                      زيارة
                    </button>
                  </div>
                </div>
              );
            }) : <p className="py-5 text-center text-xs text-slate-500">لا يوجد عملاء في النطاق الحالي</p>}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. DESKTOP VIEW (لوحة الإدارة - الكمبيوتر)               */}
      {/* ======================================================== */}
      <div className="hidden md:block space-y-6">
        {/* Top Search & Filter Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث عن عميل أو رقم فاتورة..."
              className="w-full h-10 pl-4 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[color:var(--brand-teal)] transition"
            />
          </div>

          <div className="flex items-center gap-3">
            {!isRep && (
              <div className="flex items-center gap-2 text-xs">
                <select
                  aria-label="الفرع"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-700 text-xs"
                >
                  <option value="ALL">كل الفروع</option>
                  {availableBranches.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
              <div className="w-8 h-8 rounded-full bg-[color:var(--brand-teal)] text-white flex items-center justify-center font-bold text-xs">
                {currentUser?.name ? currentUser.name.slice(0, 1) : 'م'}
              </div>
              <div className="text-right">
                <div className="text-xs font-black text-slate-900">{currentUser?.name || 'أحمد محمد'}</div>
                <div className="text-[10px] text-slate-600 font-semibold">
                  {currentUser?.role === 'admin' ? 'مدير النظام' : currentUser?.role === 'branch_manager' ? 'مدير الفرع' : 'مشرف'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Metric Cards in a Row matching Desktop Reference Mockup */}
        <div className="grid grid-cols-3 gap-4">
          {/* Card 1: إجمالي المبيعات */}
          <div className="kpi-tile kpi-tile--teal rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="kpi-tile__label text-xs font-bold">إجمالي المبيعات</span>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {money(stats.sales)}
            </div>
            <div className="kpi-tile__caption text-[10px] font-semibold">حسب بيانات العملاء</div>
          </div>

          {/* Card 2: إجمالي التحصيلات */}
          <div className="kpi-tile kpi-tile--blue rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="kpi-tile__label text-xs font-bold">إجمالي التحصيلات</span>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {money(stats.collections)}
            </div>
            <div className="kpi-tile__caption text-[10px] font-semibold">حسب بيانات العملاء</div>
          </div>

          {/* Card 3: العملاء */}
          <div className="kpi-tile kpi-tile--amber rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-2">
            <div className="flex items-center justify-between">
              <span className="kpi-tile__label text-xs font-bold">العملاء</span>
            </div>
            <div className="kpi-tile__value text-2xl font-black tabular-nums tracking-tight">
              {scopedCustomers.length}
            </div>
            <div className="kpi-tile__caption text-[10px] font-semibold">من إجمالي قاعدة العملاء</div>
          </div>
        </div>

        {/* Charts Split Row: Line Chart (Sales & Collections) + Donut (Customer Status) */}
        <div className="grid grid-cols-12 gap-5">
          {/* Dual Line Chart: المبيعات والتحصيلات */}
          <div className="col-span-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900 text-sm">المبيعات والتحصيلات</h3>
                <p className="text-[11px] text-slate-500">مقارنة حركة المبيعات مقابل التحصيل الفعلي</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-bold">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-main" />
                  <span>المبيعات</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-main" />
                  <span>التحصيلات</span>
                </span>
              </div>
            </div>

            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={salesCollectionsChart}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                  barGap={4}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => compact(Number(v))} />
                  <Tooltip
                    formatter={(val: any, name: any) => [money(Number(val)), name === 'sales' ? 'المبيعات' : 'التحصيلات']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ''}
                  />
                  <Bar dataKey="sales" name="المبيعات" fill="#009488" radius={[4, 4, 0, 0]} barSize={14} />
                  <Bar dataKey="collections" name="التحصيلات" fill="#3882f6" radius={[4, 4, 0, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart: توزيع العملاء */}
          <div className="col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
            <div>
              <h3 className="font-black text-slate-900 text-sm">توزيع العملاء</h3>
              <p className="text-[11px] text-slate-500">تصنيف التعامل للعملاء المسجلين</p>
            </div>

            <div className="relative w-full h-40 flex items-center justify-center" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={customerStatusDistribution}
                    dataKey="value"
                    innerRadius={46}
                    outerRadius={68}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {customerStatusDistribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-black text-slate-900">{scopedCustomers.length}</span>
                <span className="text-[10px] text-slate-500 font-bold">عميل</span>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
              {customerStatusDistribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-bold">{item.name}</span>
                  </span>
                  <span className="font-black tabular-nums">{item.count} عميل</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Split Row: آخر الفواتير + الزيارات القادمة */}
        <div className="grid grid-cols-12 gap-5">
          {/* Table: آخر الفواتير */}
          <div className="col-span-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm">آخر الفواتير</h3>
              <button
                type="button"
                onClick={() => onNavigateToTab('invoices')}
                className="text-[11px] font-bold text-[color:var(--brand-teal)] hover:underline cursor-pointer"
              >
                عرض الكل
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                    <th className="pb-2">رقم الفاتورة</th>
                    <th className="pb-2">العميل</th>
                    <th className="pb-2">التاريخ</th>
                    <th className="pb-2 text-left">المبلغ</th>
                    <th className="pb-2 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentInvoices.length > 0 ? recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 font-mono font-bold text-slate-600">{invoice.invoiceNumber}</td>
                      <td className="py-2.5 font-bold text-slate-900">{invoice.customerName}</td>
                      <td className="py-2.5 text-slate-500 tabular-nums">{invoice.date}</td>
                      <td className="py-2.5 font-black text-slate-900 tabular-nums text-left">
                        {formatCurrency(Number(invoice.estimatedGrandTotal) || 0)}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-50 text-slate-700 border border-slate-200">
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-500">لا توجد فواتير مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* List: الزيارات القادمة */}
          <div className="col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm">الزيارات القادمة</h3>
              <button
                type="button"
                onClick={() => onNavigateToTab('visits')}
                className="text-[11px] font-bold text-[color:var(--brand-teal)] hover:underline cursor-pointer"
              >
                عرض الكل
              </button>
            </div>

            <div className="space-y-3">
              {upcomingVisits.length > 0 ? upcomingVisits.map((visit) => {
                const visitCustomer = customers.find((customer) =>
                  customer.id === visit.customerId || customer.code === visit.customerCode
                );
                return (
                <div key={visit.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/70 space-y-1">
                  <div className="font-bold text-slate-900 text-xs">
                    {visit.customerName || visitCustomer?.name || 'عميل غير محدد'}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{visit.date}{visit.time ? ` - ${visit.time}` : ''}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[color:var(--brand-teal)]">
                      <MapPin className="w-3 h-3" />
                      <span>{visit.branchName || visitCustomer?.region || visitCustomer?.address || 'لم يحدد الموقع'}</span>
                    </span>
                  </div>
                </div>
                );
              }) : <p className="py-5 text-center text-xs text-slate-500">لا توجد زيارات قادمة</p>}
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('visits')}
              className="w-full py-2 bg-[color:var(--brand-teal)] hover:bg-teal-dark-hover text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل زيارة جديدة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
