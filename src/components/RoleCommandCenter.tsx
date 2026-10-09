import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Coins,
  Compass,
  FileText,
  Flame,
  Gauge,
  Info,
  Layers,
  MapPin,
  Navigation,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Store,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { LucideIcon } from 'lucide-react';
import type {
  CollectionForecastRecord,
  Customer,
  CustomerVisit,
  Invoice,
  TargetRecord,
} from '../types';

interface RoleCommandCenterProps {
  onNavigateToTab?: (tab: string) => void;
  onOpenNewOrder?: () => void;
}

interface KpiCard {
  id: string;
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  rate?: number;
  rateLabel?: string;
}

interface RegionalRow {
  region: string;
  customers: number;
  sales: number;
  balance: number;
  visits: number;
}

interface ForecastGroup {
  key: string;
  weekIndex: number;
  repId: string;
  repName: string;
  branchName: string;
  customers: number;
  collectionTotal: number;
  salesTotal: number;
  customerIds: string[];
}

interface Toast {
  message: string;
  kind: 'success' | 'error' | 'info';
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const todayKey = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

const monthKey = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
};

const ORDER_REVIEW_STATUSES = [
  'قيد مراجعة المشرف',
  'معلقة بانتظار اعتماد الفرع',
  'قيد المراجعة',
];

const progressColor = (rate: number) =>
  rate >= 90 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-rose-500';

const progressTextColor = (rate: number) =>
  rate >= 90 ? 'text-emerald-700' : rate >= 60 ? 'text-amber-700' : 'text-rose-700';

export const RoleCommandCenter: React.FC<RoleCommandCenterProps> = ({
  onNavigateToTab,
  onOpenNewOrder,
}) => {
  const {
    currentUser,
    isOffline,
    branches,
    visits,
    invoices,
    customers,
    users,
    targets,
    forecasts,
    getVisibleInvoices,
    getVisibleVisits,
    getVisibleCustomers,
    getVisibleTargets,
    reviewVisit,
    approveOrder,
    rejectOrder,
    forwardOrderToManager,
    approveForecastWeek,
  } = useApp();

  const [queueTab, setQueueTab] = useState<'orders' | 'visits' | 'forecasts'>('orders');
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const today = useMemo(() => todayKey(), []);
  const currentMonth = useMemo(() => monthKey(), []);
  const currentMonthNum = Number(currentMonth.split('-')[1]);
  const currentYear = Number(currentMonth.split('-')[0]);
  const currentMonthName = ARABIC_MONTHS[currentMonthNum - 1] || '';

  const visibleInvoices = useMemo(
    () => (getVisibleInvoices ? getVisibleInvoices() : invoices),
    [invoices, getVisibleInvoices]
  );
  const visibleVisits = useMemo(
    () => (getVisibleVisits ? getVisibleVisits() : visits),
    [visits, getVisibleVisits]
  );
  const visibleCustomers = useMemo(
    () => (getVisibleCustomers ? getVisibleCustomers() : customers),
    [customers, getVisibleCustomers]
  );
  const visibleTargets = useMemo(
    () => (getVisibleTargets ? getVisibleTargets() : targets),
    [targets, getVisibleTargets]
  );

  const showToast = (message: string, kind: Toast['kind'] = 'info') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3500);
  };

  // ===== KPIs =====
  const kpis = useMemo<KpiCard[]>(() => {
    const monthSales = visibleInvoices
      .filter((i) => (i.date || '').startsWith(currentMonth))
      .filter((i) => i.status !== 'مرفوضة / ملغاة' && i.status !== 'ملغاة')
      .reduce((s, i) => s + (i.estimatedGrandTotal || 0), 0);

    const monthTargets = visibleTargets.filter(
      (t) => t.year === currentYear && t.month === currentMonthNum
    );
    const salesTarget = monthTargets.reduce((s, t) => s + (t.salesTarget || 0), 0);
    const collectionTarget = monthTargets.reduce((s, t) => s + (t.collectionTarget || 0), 0);

    const monthCollections = visibleVisits
      .filter((v) => (v.date || '').startsWith(currentMonth))
      .reduce((s, v) => s + (v.collectedAmount || 0), 0);

    const todayVisits = visibleVisits.filter((v) => v.date === today).length;
    const doneToday = visibleVisits.filter(
      (v) => v.date === today && (v.status === 'منفذة' || v.status === 'لم تتم')
    ).length;
    const scheduledUpcoming = visibleVisits.filter(
      (v) => v.status === 'مجدولة' && v.date >= today
    ).length;

    const pendingOrders = visibleInvoices.filter((i) =>
      ORDER_REVIEW_STATUSES.includes(i.status || '')
    ).length;
    const pendingVisitReviews = visibleVisits.filter(
      (v) => v.reviewStatus === 'pending' && (v.status === 'منفذة' || v.status === 'لم تتم')
    ).length;
    const pendingForecasts = (forecasts || []).filter(
      (f) => f.status === 'submitted' && f.monthKey === currentMonth
    ).length;

    const salesRate = salesTarget > 0 ? Math.round((monthSales / salesTarget) * 100) : 0;
    const collectionRate =
      collectionTarget > 0 ? Math.round((monthCollections / collectionTarget) * 100) : 0;

    return [
      {
        id: 'sales',
        label: `مبيعات ${currentMonthName}`,
        value: formatCurrency(monthSales),
        sub: `من هدف ${formatCurrency(salesTarget)}`,
        icon: BarChart3,
        accent: 'text-emerald-700',
        iconBg: 'bg-emerald-100 text-emerald-700',
        rate: salesRate,
        rateLabel: `${salesRate}%`,
      },
      {
        id: 'collections',
        label: `تحصيلات ${currentMonthName}`,
        value: formatCurrency(monthCollections),
        sub: `من هدف ${formatCurrency(collectionTarget)}`,
        icon: Coins,
        accent: 'text-blue-700',
        iconBg: 'bg-blue-100 text-blue-700',
        rate: collectionRate,
        rateLabel: `${collectionRate}%`,
      },
      {
        id: 'visits',
        label: 'زيارات اليوم',
        value: String(todayVisits),
        sub: `${doneToday} منفذة • ${scheduledUpcoming} مجدولة قادمة`,
        icon: CalendarCheck,
        accent: 'text-rose-700',
        iconBg: 'bg-rose-100 text-rose-700',
      },
      {
        id: 'approvals',
        label: 'اعتمادات بانتظار',
        value: String(pendingOrders + pendingVisitReviews + pendingForecasts),
        sub: `${pendingOrders} طلبيات • ${pendingVisitReviews} زيارات • ${pendingForecasts} توقعات`,
        icon: ShieldCheck,
        accent: 'text-amber-700',
        iconBg: 'bg-amber-100 text-amber-700',
      },
    ];
  }, [
    visibleInvoices, visibleVisits, visibleTargets, forecasts,
    currentMonth, currentMonthNum, currentYear, currentMonthName, today,
  ]);

  // ===== تحليلات المناطق =====
  const regionalAnalytics = useMemo<RegionalRow[]>(() => {
    const map = new Map<string, RegionalRow>();
    visibleCustomers.forEach((c) => {
      const region = c.governorate || c.region || c.district || c.branchName || 'غير محدد';
      const row = map.get(region) || { region, customers: 0, sales: 0, balance: 0, visits: 0 };
      row.customers += 1;
      row.sales += Number(c.totalSpent ?? c.totalOverallSales ?? 0);
      row.balance += Number(c.currentBalance ?? c.balance ?? 0);
      map.set(region, row);
    });
    visibleVisits.forEach((v) => {
      const cust = visibleCustomers.find((c) => c.id === v.customerId);
      const region = cust?.governorate || cust?.region || cust?.district || cust?.branchName || 'غير محدد';
      const row = map.get(region) || { region, customers: 0, sales: 0, balance: 0, visits: 0 };
      row.visits += 1;
      map.set(region, row);
    });
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 6);
  }, [visibleCustomers, visibleVisits]);

  // ===== أعلى المديونيات =====
  const topDebts = useMemo(() => {
    return [...visibleCustomers]
      .map((c) => ({ customer: c, balance: Number(c.currentBalance ?? c.balance ?? 0) }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [visibleCustomers]);

  // ===== طلبيات بانتظار الاعتماد =====
  const pendingOrders = useMemo(() => {
    return visibleInvoices
      .filter((i) => ORDER_REVIEW_STATUSES.includes(i.status || ''))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, showAllOrders ? 20 : 8);
  }, [visibleInvoices, showAllOrders]);

  const pendingOrdersTotal = useMemo(
    () => pendingOrders.reduce((s, i) => s + (i.estimatedGrandTotal || 0), 0),
    [pendingOrders]
  );

  // ===== زيارات بانتظار المراجعة =====
  const pendingVisits = useMemo(() => {
    return visibleVisits
      .filter((v) => v.reviewStatus === 'pending' && (v.status === 'منفذة' || v.status === 'لم تتم'))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, showAllVisits ? 20 : 8);
  }, [visibleVisits, showAllVisits]);

  // ===== توقعات بانتظار الاعتماد (مجمعة بالأسبوع والمندوب) =====
  const forecastGroups = useMemo<ForecastGroup[]>(() => {
    const submitted = (forecasts || []).filter(
      (f) => f.status === 'submitted' && f.monthKey === currentMonth
    );
    const map = new Map<string, ForecastGroup>();
    submitted.forEach((f) => {
      const key = `${f.weekIndex}::${f.repId}`;
      const group = map.get(key) || {
        key,
        weekIndex: f.weekIndex,
        repId: f.repId,
        repName: f.repName,
        branchName: f.branchName,
        customers: 0,
        collectionTotal: 0,
        salesTotal: 0,
        customerIds: [],
      };
      group.customers += 1;
      group.collectionTotal += Number(f.collectionForecast || 0);
      group.salesTotal += Number(f.salesForecast || 0);
      if (!group.customerIds.includes(f.customerId)) group.customerIds.push(f.customerId);
      map.set(key, group);
    });
    return Array.from(map.values()).sort((a, b) => b.collectionTotal - a.collectionTotal);
  }, [forecasts, currentMonth]);

  // ===== handlers =====
  const handleApproveOrder = (inv: Invoice) => {
    const res = approveOrder(inv.id);
    showToast(res.message, res.success ? 'success' : 'error');
  };
  const handleRejectOrder = (inv: Invoice) => {
    const res = rejectOrder(inv.id, 'رفض الاعتماد من لوحة القيادة');
    showToast(res.message, res.success ? 'success' : 'error');
  };
  const handleForwardOrder = (inv: Invoice) => {
    const res = forwardOrderToManager(inv.id, 'تحويل للاعتماد الإداري من لوحة القيادة');
    showToast(res.message, res.success ? 'success' : 'error');
  };
  const handleApproveVisit = (visit: CustomerVisit) => {
    const res = reviewVisit(visit.id, 'approved');
    showToast(res.message, res.success ? 'success' : 'error');
  };
  const handleNeedsFixVisit = (visit: CustomerVisit) => {
    const res = reviewVisit(visit.id, 'needs_fix', 'يرجى مراجعة بيانات الزيارة وتحديثها');
    showToast(res.message, res.success ? 'success' : 'error');
  };
  const handleApproveForecast = async (group: ForecastGroup) => {
    setBusyId(group.key);
    try {
      const count = await approveForecastWeek(currentMonth, group.weekIndex, group.repId);
      showToast(
        count > 0
          ? `تم اعتماد توقع أسبوع ${group.weekIndex} للمندوب ${group.repName} (${count} سجل)`
          : 'لا توجد سجلات مُرشحة للاعتماد',
        count > 0 ? 'success' : 'info'
      );
    } catch {
      showToast('تعذر اعتماد التوقع', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const roleLabel =
    currentUser?.role === 'admin'
      ? 'الإدارة العامة'
      : currentUser?.role === 'developer'
      ? 'المطور العام'
      : currentUser?.role === 'branch_manager'
      ? 'مدير الفرع'
      : 'مشرف المناديب';

  const sectionTitle = (text: string, icon?: LucideIcon) => {
    const Icon = icon;
    return (
      <h2 className="text-[13px] font-black text-slate-700 px-1 mb-2 flex items-center gap-1.5">
        <span className="w-1 h-3.5 rounded-full bg-amber-400 inline-block" />
        {Icon && <Icon className="w-4 h-4 text-amber-500" />}
        {text}
      </h2>
    );
  };

  const toastStyles: Record<Toast['kind'], string> = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-slate-800 text-white',
  };

  const isSupervisor = currentUser?.role === 'supervisor';

  return (
    <div className="space-y-4">
      {/* ===== الترويسة ===== */}
      <div className="bg-gradient-to-l from-slate-900 to-slate-800 rounded-3xl border border-slate-700 p-4 text-white shadow-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-lg shrink-0 shadow">
              {currentUser?.name?.charAt(0) || 'ق'}
            </span>
            <div className="min-w-0">
              <h1 className="font-black text-base truncate">{currentUser?.name || 'لوحة القيادة'}</h1>
              <p className="text-[11px] text-slate-300 font-semibold mt-0.5 truncate">
                {roleLabel} • {currentUser?.branchName || 'كل الفروع'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isOffline && (
              <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap">
                <AlertTriangle className="w-3 h-3" />
                أوفلاين
              </span>
            )}
            {kpis[3].value !== '0' && (
              <span className="flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-400/40 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap">
                <BellRing className="w-3 h-3" />
                {kpis[3].value} اعتماد
              </span>
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
          نظرة شاملة على المبيعات والتحصيلات والزيارات والاعتمادات — اعتمد واتخذ القرار من مكان واحد.
        </p>
      </div>

      {/* ===== مؤشرات الأداء KPI ===== */}
      <section>
        {sectionTitle('مؤشرات الأداء الرئيسية', Gauge)}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500">{kpi.label}</span>
                  <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${kpi.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                </div>
                <div className={`mt-1.5 font-mono text-lg font-black truncate ${kpi.accent}`} title={kpi.value}>
                  {kpi.value}
                </div>
                <div className="text-[10px] text-slate-500 font-semibold truncate">{kpi.sub}</div>
                {typeof kpi.rate === 'number' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-[10px] font-black mb-1">
                      <span className="text-slate-500">الإنجاز</span>
                      <span className={progressTextColor(kpi.rate)}>{kpi.rateLabel}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${progressColor(kpi.rate)}`}
                        style={{ width: `${Math.min(100, kpi.rate)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== التحليلات: المناطق + المديونيات ===== */}
      <section>
        {sectionTitle('التحليلات الجغرافية والمديونيات', MapPin)}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {/* المناطق */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-amber-500" />
                أداء المناطق
              </span>
              <span className="text-[10px] font-bold text-slate-400">{regionalAnalytics.length} مناطق</span>
            </div>
            {regionalAnalytics.length === 0 ? (
              <div className="text-[11px] text-slate-400 text-center py-4">لا توجد بيانات مناطق</div>
            ) : (
              regionalAnalytics.map((r) => (
                <div key={r.region} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 truncate">
                      <Navigation className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      {r.region}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 shrink-0">
                      {r.customers} عميل • {r.visits} زيارة
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <div className="text-[9px] font-bold text-slate-500">مبيعات المنطقة</div>
                      <div className="font-mono text-[11px] font-black text-emerald-700 truncate" title={formatCurrency(r.sales)}>
                        {formatCurrency(r.sales)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-500">مديونيات المنطقة</div>
                      <div className="font-mono text-[11px] font-black text-rose-700 truncate" title={formatCurrency(r.balance)}>
                        {formatCurrency(r.balance)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* أعلى المديونيات */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                أعلى العملاء مديونية
              </span>
              <button
                type="button"
                onClick={() => onNavigateToTab?.('all_customers')}
                className="text-[10px] font-black text-amber-600 underline underline-offset-2 cursor-pointer"
              >
                الكل ←
              </button>
            </div>
            {topDebts.length === 0 ? (
              <div className="text-[11px] text-slate-400 text-center py-4">لا توجد مديونيات</div>
            ) : (
              <div className="space-y-1.5">
                {topDebts.map(({ customer, balance }, idx) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-2.5 py-2 border border-slate-100"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                          idx === 0
                            ? 'bg-rose-500 text-white'
                            : idx === 1
                            ? 'bg-amber-500 text-white'
                            : idx === 2
                            ? 'bg-orange-400 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-slate-800 truncate">{customer.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {customer.code || 'بدون كود'} • {customer.branchName || ''}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[11px] font-black text-rose-700 shrink-0" title={formatCurrency(balance)}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== مركز الاعتمادات ===== */}
      <section>
        {sectionTitle('مركز الاعتمادات والمراجعات', ShieldCheck)}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* التبويبات */}
          <div className="flex border-b border-slate-200 overflow-x-auto" role="tablist">
            {(
              [
                { id: 'orders', label: 'طلبيات', icon: Receipt, count: visibleInvoices.filter((i) => ORDER_REVIEW_STATUSES.includes(i.status || '')).length },
                { id: 'visits', label: 'زيارات', icon: CalendarCheck, count: visibleVisits.filter((v) => v.reviewStatus === 'pending' && (v.status === 'منفذة' || v.status === 'لم تتم')).length },
                { id: 'forecasts', label: 'توقعات', icon: TrendingUp, count: forecastGroups.length },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = queueTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setQueueTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-black whitespace-nowrap cursor-pointer transition border-b-2 ${
                    active
                      ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`min-w-[20px] h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center ${
                      active ? 'bg-amber-500 text-white' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-3">
            {/* ===== طلبيات ===== */}
            {queueTab === 'orders' && (
              <div className="space-y-2">
                {pendingOrders.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                    <div className="text-[12px] font-black text-slate-600">كل الطلبيات معتمدة</div>
                    <p className="text-[10px] text-slate-400 mt-1">لا توجد طلبيات بانتظار المراجعة</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                      <span>{pendingOrders.length} طلبيات • إجمالي {formatCurrency(pendingOrdersTotal)}</span>
                      <span>مرتبة بالأقدم أولاً</span>
                    </div>
                    {pendingOrders.map((inv) => (
                      <div
                        key={inv.id}
                        className="bg-slate-50 rounded-xl border border-slate-100 p-3"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-black text-slate-800 truncate">
                              {inv.customerName || 'عميل غير محدد'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono">{inv.invoiceNumber || inv.id}</span>
                              <span>•</span>
                              <span>{inv.repName || ''}</span>
                              <span>•</span>
                              <span>{inv.date || ''}</span>
                              <span>•</span>
                              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold">
                                {inv.status}
                              </span>
                            </div>
                          </div>
                          <div className="font-mono text-[13px] font-black text-slate-800 shrink-0" title={formatCurrency(inv.estimatedGrandTotal || 0)}>
                            {formatCurrency(inv.estimatedGrandTotal || 0)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleApproveOrder(inv)}
                            className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            اعتماد
                          </button>
                          <button
                            type="button"
                            onClick={() => handleForwardOrder(inv)}
                            className="inline-flex items-center gap-1 bg-blue-500 hover:bg-blue-400 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                            تحويل للإدارة
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectOrder(inv)}
                            className="inline-flex items-center gap-1 bg-rose-500 hover:bg-rose-400 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                            رفض
                          </button>
                        </div>
                      </div>
                    ))}
                    {visibleInvoices.filter((i) => ORDER_REVIEW_STATUSES.includes(i.status || '')).length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowAllOrders((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl py-2 text-[11px] font-black text-slate-600 cursor-pointer transition"
                      >
                        {showAllOrders ? (
                          <>عرض أقل <ChevronUp className="w-3.5 h-3.5" /></>
                        ) : (
                          <>عرض كل الطلبيات ({visibleInvoices.filter((i) => ORDER_REVIEW_STATUSES.includes(i.status || '')).length}) <ChevronDown className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ===== زيارات ===== */}
            {queueTab === 'visits' && (
              <div className="space-y-2">
                {!isSupervisor && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-2.5 text-[11px] font-bold flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    اعتماد الزيارات متاح للمشرف على الفريق فقط — هذه القائمة للاطلاع على زيارات مندوبيك بانتظار المراجعة.
                  </div>
                )}
                {pendingVisits.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                    <div className="text-[12px] font-black text-slate-600">لا توجد زيارات بانتظار المراجعة</div>
                    <p className="text-[10px] text-slate-400 mt-1">الزيارات المنفذة تظهر هنا لاعتمادها</p>
                  </div>
                ) : (
                  <>
                    {pendingVisits.map((v) => (
                      <div key={v.id} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-black text-slate-800 truncate">
                              {v.customerName || 'عميل غير محدد'}
                            </div>
                            <div className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>{v.repName || ''}</span>
                              <span>•</span>
                              <span>{v.date || ''}</span>
                              {v.type && <span>• {v.type}</span>}
                              {v.status && (
                                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md font-bold">
                                  {v.status}
                                </span>
                              )}
                            </div>
                          </div>
                          {v.collectedAmount ? (
                            <span className="font-mono text-[12px] font-black text-emerald-600 shrink-0">
                              {formatCurrency(v.collectedAmount)}
                            </span>
                          ) : null}
                        </div>
                        {isSupervisor && (
                          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleApproveVisit(v)}
                              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              اعتماد
                            </button>
                            <button
                              type="button"
                              onClick={() => handleNeedsFixVisit(v)}
                              className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              يحتاج تعديل
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {visibleVisits.filter((v) => v.reviewStatus === 'pending' && (v.status === 'منفذة' || v.status === 'لم تتم')).length > 8 && (
                      <button
                        type="button"
                        onClick={() => setShowAllVisits((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl py-2 text-[11px] font-black text-slate-600 cursor-pointer transition"
                      >
                        {showAllVisits ? (
                          <>عرض أقل <ChevronUp className="w-3.5 h-3.5" /></>
                        ) : (
                          <>عرض كل الزيارات <ChevronDown className="w-3.5 h-3.5" /></>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ===== توقعات ===== */}
            {queueTab === 'forecasts' && (
              <div className="space-y-2">
                {forecastGroups.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                    <div className="text-[12px] font-black text-slate-600">لا توجد توقعات بانتظار الاعتماد</div>
                    <p className="text-[10px] text-slate-400 mt-1">التوقعات الأسبوعية المُرسلة من المناديب تظهر هنا</p>
                  </div>
                ) : (
                  forecastGroups.map((group) => (
                    <div key={group.key} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-black text-slate-800 truncate">
                            أسبوع {group.weekIndex} • {group.repName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{group.branchName || ''}</span>
                            <span>•</span>
                            <span>{group.customers} عميل</span>
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <div className="font-mono text-[12px] font-black text-purple-700" title={formatCurrency(group.collectionTotal)}>
                            {formatCurrency(group.collectionTotal)}
                          </div>
                          <div className="text-[9px] font-bold text-slate-400">تحصيل متوقع</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-slate-500">
                          متوقع بيعه: <span className="font-mono text-slate-700">{formatCurrency(group.salesTotal)}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleApproveForecast(group)}
                          disabled={busyId === group.key}
                          className="inline-flex items-center gap-1 bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white text-[11px] font-black px-3 py-1.5 rounded-lg cursor-pointer active:scale-95 transition"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          {busyId === group.key ? 'جارٍ الاعتماد...' : 'اعتماد الأسبوع'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===== التقارير السريعة ===== */}
      <section>
        {sectionTitle('التقارير والاستعلامات', FileText)}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {(
            [
              { id: 'targets', label: 'تارجت المبيعات', icon: Target, accent: 'bg-lime-500' },
              { id: 'forecast', label: 'توقعات التحصيل', icon: TrendingUp, accent: 'bg-orange-500' },
              { id: 'visits', label: 'زيارات العملاء', icon: CalendarCheck, accent: 'bg-rose-500' },
              { id: 'invoices', label: 'الفواتير والطلبيات', icon: Receipt, accent: 'bg-amber-500' },
              { id: 'inventory', label: 'المخزون والاعتمادات', icon: Layers, accent: 'bg-sky-500' },
              { id: 'all_customers', label: 'العملاء والتحليل', icon: Users, accent: 'bg-blue-500' },
            ] as const
          ).map((tile) => {
            const Icon = tile.icon;
            return (
              <button
                key={tile.id}
                type="button"
                onClick={() => onNavigateToTab?.(tile.id)}
                className="group flex flex-col items-center justify-center gap-1.5 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[92px] transition-all duration-150 active:scale-95 cursor-pointer"
              >
                <span className={`w-10 h-10 ${tile.accent} text-white rounded-full flex items-center justify-center shadow-md group-active:scale-90 transition`}>
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <span className="text-[11px] font-bold text-slate-800 text-center leading-tight">{tile.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== تلميح ===== */}
      <p className="text-center text-[10px] text-slate-400 font-semibold px-4">
        <Store className="w-3 h-3 inline-block ml-1" />
        نفس بيانات السيرفر — الأرقام واحدة على الموبايل والتاب واللاب
      </p>

      {/* ===== Toast ===== */}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 ${toastStyles[toast.kind]} rounded-xl px-4 py-2.5 text-[12px] font-bold shadow-lg flex items-center gap-2 max-w-[92vw]`}
          role="status"
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : toast.kind === 'error' ? (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          ) : (
            <Info className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default RoleCommandCenter;
