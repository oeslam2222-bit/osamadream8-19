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
import { Filter } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { MONTH_NAMES_AR, filterCustomersByRBAC } from '../services/customerAnalyticsService';
import { isArabicNameMatch, isBranchMatch } from '../services/arabicMatchingService';
import { Customer, CustomerVisit, TargetRecord } from '../types';

interface DashboardHomeProps {
  onNavigateToTab: (tab: string) => void;
  onViewInvoice?: (invoice: unknown) => void;
}

const NAVY = '#102b4e';
const GOLD = '#c99a43';
const BLUE = '#1e5f9d';
const TARGET_BAR = '#d7e2ef';
const PIE_COLORS = [NAVY, GOLD, BLUE, '#8fa3bf'];
const GRID_STROKE = '#e3ebf3';
const TICK_FILL = '#5b6577';
const BRASS_INK = 'text-[#8a6420]';
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

export const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigateToTab }) => {
  const {
    currentUser,
    users,
    branches,
    customers,
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

  const stripKpis: Array<{ label: string; value: string; tone?: 'brass' }> = isFieldRole
    ? isSupervisor
      ? [
          { label: 'الزيارات', value: num(stats.visitsTotal) },
          { label: 'العملاء', value: num(stats.customers) },
          { label: 'مبيعات 2026', value: money(stats.sales) },
          { label: 'تحصيلات 2026', value: money(stats.collections) }
        ]
      : [
          { label: 'الزيارات', value: num(stats.visitsTotal) },
          { label: 'مبيعات 2026', value: money(stats.sales) },
          { label: 'تحصيلات 2026', value: money(stats.collections) },
          { label: 'العملاء', value: num(stats.customers) }
        ]
    : [
        { label: 'مبيعات 2026', value: money(stats.sales) },
        { label: 'تحصيلات 2026', value: money(stats.collections) },
        { label: 'تارجت البيع', value: money(stats.targetSales), tone: 'brass' },
        { label: 'العملاء', value: num(stats.customers) },
        { label: 'الزيارات', value: num(stats.visitsTotal) }
      ];

  const monthChart = MONTH_NAMES_AR.map((month, i) => ({
    month: month.slice(0, 3),
    full: month,
    مبيعات: stats.monthlySales[i],
    تارجت: stats.monthlyTargetSales[i],
    زيارات: stats.monthlyVisits[i]
  }));

  const donutData = [
    { name: 'مبيعات', value: stats.sales },
    { name: 'تحصيلات', value: stats.collections },
    { name: 'تارجت', value: stats.targetSales }
  ].filter((d) => d.value > 0);

  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);
  const peakVisit = Math.max(...stats.monthlyVisits, 0);

  const resetFilters = () => {
    setSelectedBranch('ALL');
    setSelectedSupervisor('ALL');
    setSelectedRep('ALL');
  };

  return (
    <div className="space-y-4 sm:space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--app-ink)]">لوحة التحكم</h1>
          <p className="text-xs sm:text-sm text-[var(--app-muted)] mt-0.5">
            أرقام العملاء والتارجت والزيارات
          </p>
        </div>
        <div className="hidden sm:block rounded-xl border border-[var(--app-line)] bg-white px-3.5 py-2 text-sm text-[var(--app-muted)]">
          {today}
        </div>
      </header>

      {!isRep && (
        <section className="rounded-2xl bg-white border border-[var(--app-line)] p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-[var(--app-muted)]">
            <Filter className="w-3.5 h-3.5" />
            <span>فلترة الأرقام</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(isAdminOrDev || currentUser?.role === 'branch_manager') && (
              <select
                aria-label="الفرع"
                value={isAdminOrDev ? selectedBranch : currentUser?.branchName || 'ALL'}
                disabled={!isAdminOrDev}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setSelectedSupervisor('ALL');
                  setSelectedRep('ALL');
                }}
                className="w-full rounded-[var(--app-btn-radius)] border border-[var(--app-line)] bg-[#f4f7fa] px-3 py-2.5 text-xs font-bold text-[var(--app-ink)]"
              >
                <option value="ALL">كل الفروع</option>
                {availableBranches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
            {!isSupervisor && (
              <select
                aria-label="المشرف"
                value={selectedSupervisor}
                onChange={(e) => {
                  setSelectedSupervisor(e.target.value);
                  setSelectedRep('ALL');
                }}
                className="w-full rounded-[var(--app-btn-radius)] border border-[var(--app-line)] bg-[#f4f7fa] px-3 py-2.5 text-xs font-bold text-[var(--app-ink)]"
              >
                <option value="ALL">كل المشرفين</option>
                {availableSupervisors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="المندوب"
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
              className="w-full rounded-[var(--app-btn-radius)] border border-[var(--app-line)] bg-[#f4f7fa] px-3 py-2.5 text-xs font-bold text-[var(--app-ink)]"
            >
              <option value="ALL">كل المناديب</option>
              {availableReps.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {(selectedBranch !== 'ALL' || selectedSupervisor !== 'ALL' || selectedRep !== 'ALL') && (
            <button
              type="button"
              onClick={resetFilters}
              className="app-link text-[11px]"
            >
              إلغاء الفلاتر
            </button>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.slice(0, isFieldRole ? 4 : 4).map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="min-w-0 rounded-2xl bg-white border border-[var(--app-line)] p-3.5 sm:p-4 shadow-sm flex flex-col gap-3"
            >
              <div className={`w-10 h-10 shrink-0 rounded-xl ${k.tint} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-[13px] text-[var(--app-muted)]">{k.label}</div>
                <div className="text-base sm:text-xl font-extrabold tabular-nums text-[var(--app-ink)] truncate">{k.value}</div>
              </div>
            </div>
          );
        })}
      </section>

      {!isFieldRole && kpis[4] && (
        <div className="rounded-2xl bg-white border border-[var(--app-line)] p-3.5 shadow-sm flex items-center gap-3">
          <div className={`w-10 h-10 shrink-0 rounded-xl ${BRASS_SOFT} flex items-center justify-center`}>
            <Target className={`w-5 h-5 ${BRASS_INK}`} />
          </div>
          <div className="min-w-0">
            <div className="text-xs text-[var(--app-muted)]">تارجت البيع 2026</div>
            <div className="text-lg font-extrabold tabular-nums text-[var(--app-ink)] truncate">{kpis[4].value}</div>
          </div>
          <div className="mr-auto text-left">
            <div className="text-xs text-[var(--app-muted)]">المديونية</div>
            <div className="text-sm font-extrabold tabular-nums text-[var(--app-ink)]">{money(stats.debt)}</div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0 rounded-2xl bg-white border border-[var(--app-line)] p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm sm:text-base font-black text-[var(--app-ink)]">التارجت والمبيعات بالشهور</h2>
            <span className="text-[11px] text-[var(--app-muted)]">2026</span>
          </div>
          <div className="h-52 sm:h-60 min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthChart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="month" reversed tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TICK_FILL }} />
                <YAxis
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fontSize: 10, fill: TICK_FILL }}
                  tickFormatter={(v) => (isPrivacyMode ? '' : compact(Number(v)))}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16,43,78,0.05)' }}
                  formatter={(value, name) => [money(Number(value)), String(name)]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ''}
                />
                <Bar dataKey="تارجت" fill={TARGET_BAR} radius={[6, 6, 0, 0]} maxBarSize={18} />
                <Bar dataKey="مبيعات" fill={NAVY} radius={[6, 6, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl bg-white border border-[var(--app-line)] p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm sm:text-base font-black text-[var(--app-ink)] mb-3">توزيع الأرقام</h2>
          {donutData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-sm text-[var(--app-muted)]">لا توجد أرقام بعد</div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="relative w-36 h-36" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donutData.map((d, i) => (
                        <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-extrabold tabular-nums text-[var(--app-ink)]">{compact(donutTotal)}</span>
                  <span className="text-[10px] text-[var(--app-muted)]">الإجمالي</span>
                </div>
              </div>
              <ul className="w-full space-y-1.5">
                {donutData.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-[12px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-[var(--app-ink)] truncate flex-1">{d.name}</span>
                    <span className="font-extrabold tabular-nums text-[var(--app-ink)]">
                      {donutTotal > 0 ? Math.round((d.value / donutTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-[var(--app-line)] p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-black text-[var(--app-ink)]">إجمالي الزيارات بالشهور</h2>
          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="app-link text-[12px]"
          >
            الزيارات
          </button>
        </div>
        <div className="h-44 sm:h-52 min-w-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthChart} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="month" reversed tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: TICK_FILL }} />
              <YAxis
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
                tick={{ fontSize: 10, fill: TICK_FILL }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(16,43,78,0.05)' }}
                formatter={(value) => [num(Number(value)), 'زيارات']}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ''}
              />
              <Bar dataKey="زيارات" radius={[8, 8, 0, 0]} maxBarSize={36}>
                {monthChart.map((d) => (
                  <Cell key={d.full} fill={d.زيارات > 0 && d.زيارات === peakVisit ? GOLD : '#b9c7e2'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl bg-white border border-[var(--app-line)] p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm sm:text-base font-black text-[var(--app-ink)]">أرقام الشهور</h2>
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="app-link text-[12px]"
          >
            العملاء
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-right text-sm">
            <thead>
              <tr className="bg-[var(--app-navy)] text-[#edf5fc] text-[12px] font-bold">
                <th className="px-3 py-2.5">الشهر</th>
                <th className="px-3 py-2.5">مبيعات</th>
                <th className="px-3 py-2.5">تارجت</th>
                {!isFieldRole && <th className="px-3 py-2.5">تحصيل</th>}
                <th className="px-3 py-2.5">زيارات</th>
              </tr>
            </thead>
            <tbody>
              {monthChart.map((row) => (
                <tr key={row.full} className="border-b border-[var(--app-line)]">
                  <td className="px-3 py-2.5 font-bold text-[var(--app-ink)]">{row.full}</td>
                  <td className="px-3 py-2.5 font-extrabold tabular-nums text-[var(--app-ink)]">{money(row.مبيعات)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--app-muted)]">{money(row.تارجت)}</td>
                  {!isFieldRole && <td className="px-3 py-2.5 tabular-nums text-[var(--app-ink)]">{money(stats.monthlyCollections[MONTH_NAMES_AR.indexOf(row.full)])}</td>}
                  <td className="px-3 py-2.5 font-extrabold tabular-nums text-[var(--app-ink)]">{num(row.زيارات)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default DashboardHome;
