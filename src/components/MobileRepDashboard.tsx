import {
  BookOpen,
  Boxes,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Coins,
  FileText,
  LayoutDashboard,
  Layers,
  MapPin,
  MapPinned,
  RotateCcw,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
  Bell,
  BellRing,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  Flame,
  ShieldCheck,
  ShieldAlert,
  MessageSquare,
  X,
  Plus,
  User,
  UserCheck,
  Building2,
  Receipt,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import type { LucideIcon } from 'lucide-react';
import type { Customer } from '../types';

interface MobileRepDashboardProps {
  onNavigate: (tab: string) => void;
  onNewInvoice: () => void;
}

interface RepTile {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  accent: string;
  ring: string;
  action: () => void;
}

interface RepAlert {
  id: string;
  kind: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  detail: string;
  icon: LucideIcon;
  actionLabel?: string;
  action?: () => void;
}

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

const isMyRecord = (repId?: string, repName?: string, currentUserId?: string, currentUserName?: string): boolean => {
  if (!currentUserId && !currentUserName) return true;
  if (repId && currentUserId && repId === currentUserId) return true;
  if (repName && currentUserName && repName === currentUserName) return true;
  return false;
};

const ARABIC_MONTHS = ['يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export const MobileRepDashboard: React.FC<MobileRepDashboardProps> = ({
  onNavigate,
  onNewInvoice,
}) => {
  const {
    currentUser,
    isOffline,
    visits,
    invoices,
    customers,
    users,
    targets,
    forecasts,
    getVisibleTargets,
    getVisibleInvoices,
    getVisibleVisits,
    getVisibleCustomers,
  } = useApp();

  const [showMore, setShowMore] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const today = useMemo(() => todayKey(), []);
  const currentMonth = useMemo(() => monthKey(), []);
  const currentMonthNum = Number(currentMonth.split('-')[1]);
  const currentMonthName = ARABIC_MONTHS[currentMonthNum - 1] || '';

  // ===== بيانات المندوب الخاصة =====
  const myVisits = useMemo(() => {
    const list = getVisibleVisits ? getVisibleVisits() : visits;
    return list.filter((v) =>
      isMyRecord(v.repId, v.repName, currentUser?.id, currentUser?.name)
    );
  }, [visits, getVisibleVisits, currentUser?.id, currentUser?.name]);

  const myInvoices = useMemo(() => {
    const list = getVisibleInvoices ? getVisibleInvoices() : invoices;
    return list.filter((i) =>
      isMyRecord(i.repId, i.repName, currentUser?.id, currentUser?.name)
    );
  }, [invoices, getVisibleInvoices, currentUser?.id, currentUser?.name]);

  const myCustomers = useMemo(() => {
    const list = getVisibleCustomers ? getVisibleCustomers() : customers;
    return list.filter((c) =>
      isMyRecord(c.repId, c.salesRepName, currentUser?.id, currentUser?.name)
    );
  }, [customers, getVisibleCustomers, currentUser?.id, currentUser?.name]);

  const myTargets = useMemo(() => {
    const list = getVisibleTargets ? getVisibleTargets() : targets;
    return list.filter((t) =>
      isMyRecord(undefined, t.repName, undefined, currentUser?.name)
    );
  }, [targets, getVisibleTargets, currentUser?.name]);

  const myForecasts = useMemo(() => {
    return (forecasts || []).filter((f) =>
      isMyRecord(f.repId, f.repName, currentUser?.id, currentUser?.name)
    );
  }, [forecasts, currentUser?.id, currentUser?.name]);

  // ===== ملخص اليوم =====
  const stats = useMemo(() => {
    const myVisitsToday = myVisits.filter((v) => v.date === today).length;
    const pendingReview = myInvoices.filter(
      (i) =>
        i.status === 'قيد مراجعة المشرف' ||
        i.status === 'معلقة بانتظار اعتماد الفرع' ||
        i.status === 'قيد المراجعة'
    ).length;
    const delivered = myInvoices.filter(
      (i) => i.status === 'تم التسليم' || i.status === 'إغلاق الطلبية'
    ).length;
    const collectedToday = myVisits
      .filter((v) => v.date === today && v.collectedAmount)
      .reduce((sum, v) => sum + (v.collectedAmount || 0), 0);
    return { myVisitsToday, myInvoices: myInvoices.length, pendingReview, delivered, collectedToday };
  }, [myVisits, myInvoices, today]);

  // ===== التارجت والمتبقي =====
  const targetSummary = useMemo(() => {
    const monthTargets = myTargets.filter((t) => t.year === Number(currentMonth.split('-')[0]) && t.month === currentMonthNum);
    const salesTarget = monthTargets.reduce((s, t) => s + (t.salesTarget || 0), 0);
    const salesAchieved = monthTargets.reduce((s, t) => s + (t.salesAchieved || 0), 0);
    const collectionTarget = monthTargets.reduce((s, t) => s + (t.collectionTarget || 0), 0);
    const collectionAchieved = monthTargets.reduce((s, t) => s + (t.collectionAchieved || 0), 0);
    const remainingSales = Math.max(0, salesTarget - salesAchieved);
    const remainingCollection = Math.max(0, collectionTarget - collectionAchieved);
    const salesRate = salesTarget > 0 ? Math.round((salesAchieved / salesTarget) * 100) : 0;
    const collectionRate = collectionTarget > 0 ? Math.round((collectionAchieved / collectionTarget) * 100) : 0;
    return { salesTarget, salesAchieved, collectionTarget, collectionAchieved, remainingSales, remainingCollection, salesRate, collectionRate };
  }, [myTargets, currentMonth, currentMonthNum]);

  // ===== المتوقع تحصيله من المندوب (التوقعات الأسبوعية المرسلة/المعتمدة) =====
  const expectedCollection = useMemo(() => {
    const monthForecasts = myForecasts.filter(
      (f) => f.monthKey === currentMonth && f.weekIndex > 0 && (f.status === 'submitted' || f.status === 'approved')
    );
    const total = monthForecasts.reduce((s, f) => s + (f.collectionForecast || 0), 0);
    const salesTotal = monthForecasts.reduce((s, f) => s + (f.salesForecast || 0), 0);
    const customersCount = new Set(monthForecasts.map((f) => f.customerId)).size;
    return { total, salesTotal, customersCount, records: monthForecasts.length };
  }, [myForecasts, currentMonth]);

  // ===== المستحقات والمديونيات =====
  const duesSummary = useMemo(() => {
    let totalBalance = 0;
    let totalOverdue = 0;
    let overLimitCount = 0;
    let highestDebt: Customer | null = null;
    myCustomers.forEach((c) => {
      const bal = Number(c.currentBalance ?? c.balance ?? 0);
      const overdue = Number(c.overdueBalance ?? c.totalOverdue ?? 0);
      totalBalance += bal;
      totalOverdue += overdue;
      const limit = Number(c.creditLimit ?? 0);
      if (limit > 0 && bal > limit) overLimitCount += 1;
      if (!highestDebt || bal > Number(highestDebt.currentBalance ?? highestDebt.balance ?? 0)) {
        highestDebt = c;
      }
    });
    return { totalBalance, totalOverdue, overLimitCount, highestDebt };
  }, [myCustomers]);

  // ===== أوامر البيع =====
  const salesOrdersSummary = useMemo(() => {
    const pending = myInvoices.filter(
      (i) =>
        i.status === 'قيد مراجعة المشرف' ||
        i.status === 'معلقة بانتظار اعتماد الفرع' ||
        i.status === 'قيد المراجعة'
    );
    const inDelivery = myInvoices.filter((i) => i.status === 'قيد التوصيل');
    const delivered = myInvoices.filter(
      (i) => i.status === 'تم التسليم' || i.status === 'إغلاق الطلبية'
    );
    const returned = myInvoices.filter((i) => i.status === 'مرتجع' || i.status === 'مرتجع جزئي');
    const monthSales = myInvoices
      .filter((i) => (i.date || '').startsWith(currentMonth))
      .filter((i) => i.status !== 'مرفوضة / ملغاة' && i.status !== 'ملغاة')
      .reduce((s, i) => s + (i.estimatedGrandTotal || 0), 0);
    return {
      pendingCount: pending.length,
      pendingValue: pending.reduce((s, i) => s + (i.estimatedGrandTotal || 0), 0),
      inDeliveryCount: inDelivery.length,
      deliveredCount: delivered.length,
      deliveredValue: delivered.reduce((s, i) => s + (i.estimatedGrandTotal || 0), 0),
      returnedCount: returned.length,
      monthSales,
    };
  }, [myInvoices, currentMonth]);

  // ===== توقع البيع الشهري =====
  const monthlySalesForecast = useMemo(() => {
    const monthForecasts = myForecasts.filter(
      (f) => f.monthKey === currentMonth && f.weekIndex > 0 && (f.status === 'submitted' || f.status === 'approved')
    );
    const total = monthForecasts.reduce((s, f) => s + (f.salesForecast || 0), 0);
    const gap = targetSummary.salesTarget > 0 ? targetSummary.salesTarget - total : 0;
    return { total, gap, rate: targetSummary.salesTarget > 0 ? Math.round((total / targetSummary.salesTarget) * 100) : 0 };
  }, [myForecasts, currentMonth, targetSummary.salesTarget]);

  // ===== الزيارات للعمل عليها (مجدولة + غير منفذة + موعد قادم) =====
  const visitsToWork = useMemo(() => {
    const upcoming = myVisits
      .filter((v) => {
        const isScheduled = v.status === 'مجدولة' && (!v.checkOutTime || v.date >= today);
        const isFuture = v.date > today && v.status !== 'ملغاة';
        return isScheduled || isFuture;
      })
      .sort((a, b) => (a.date === b.date ? (a.time || '').localeCompare(b.time || '') : a.date.localeCompare(b.date)))
      .slice(0, 8);
    return upcoming;
  }, [myVisits, today]);

  // ===== رسائل تحفظية (تحذيرات) =====
  const alerts = useMemo<RepAlert[]>(() => {
    const list: RepAlert[] = [];
    // عملاء تجاوزوا حد الائتمان
    if (duesSummary.overLimitCount > 0) {
      list.push({
        id: 'over-limit',
        kind: 'danger',
        title: `${duesSummary.overLimitCount} عميل تجاوز حد الائتمان`,
        detail: 'راجع كشف حسابهم قبل إنشاء طلبيات جديدة',
        icon: ShieldAlert,
        actionLabel: 'عرض العملاء',
        action: () => onNavigate('all_customers'),
      });
    }
    // متأخرات عالية
    if (duesSummary.totalOverdue > 0) {
      list.push({
        id: 'overdue',
        kind: 'warning',
        title: `متأخرات بقيمة ${formatCurrency(duesSummary.totalOverdue)}`,
        detail: 'حاول التحصيل في زيارات اليوم قبل البيع',
        icon: AlertTriangle,
        actionLabel: 'أعلى المديونيات',
        action: () => onNavigate('all_customers'),
      });
    }
    // طلبيات بانتظار اعتماد
    if (stats.pendingReview > 0) {
      list.push({
        id: 'pending-approval',
        kind: 'info',
        title: `${stats.pendingReview} طلبيات بانتظار الاعتماد`,
        detail: 'المشرف ومدير الفرع يراجعون طلبياتك الآن',
        icon: Clock,
        actionLabel: 'متابعة الطلبيات',
        action: () => onNavigate('invoices'),
      });
    }
    // مرتجعات بانتظار المشرف
    const pendingReturns = myVisits.filter(
      (v) => v.isReturn && (!v.returnStatus || v.returnStatus === 'بانتظار المشرف')
    );
    if (pendingReturns.length > 0) {
      list.push({
        id: 'pending-returns',
        kind: 'warning',
        title: `${pendingReturns.length} مرتجع بانتظار المشرف`,
        detail: 'المرتجعات محتجزة لحين اعتماد المشرف وتحويلها للمخزن',
        icon: RotateCcw,
        actionLabel: 'عرض المرتجعات',
        action: () => onNavigate('visits'),
      });
    }
    // تحصيل اليوم
    if (stats.collectedToday > 0) {
      list.push({
        id: 'collected-today',
        kind: 'success',
        title: `تحصيل اليوم: ${formatCurrency(stats.collectedToday)}`,
        detail: 'أحسنت! استمر في تحصيل المستحقات',
        icon: CheckCircle2,
      });
    }
    // فجوة التارجت
    if (targetSummary.remainingSales > 0 && targetSummary.salesRate < 60) {
      list.push({
        id: 'target-gap',
        kind: 'warning',
        title: `متبقي للبيع: ${formatCurrency(targetSummary.remainingSales)}`,
        detail: `إنجاز البيع ${targetSummary.salesRate}% فقط — ركّز على العملاء الأعلى مبيعاً`,
        icon: Target,
        actionLabel: 'التارجت',
        action: () => onNavigate('targets'),
      });
    }
    return list;
  }, [duesSummary, stats, myVisits, targetSummary, onNavigate]);

  const visibleAlerts = useMemo(
    () => alerts.filter((a) => !dismissedAlerts.has(a.id)),
    [alerts, dismissedAlerts]
  );

  const dismissAlert = (id: string) => {
    setDismissedAlerts((prev) => new Set(prev).add(id));
  };

  // ===== تحليلات بالمنطقة (المحافظة / المنطقة) =====
  const regionAnalytics = useMemo(() => {
    const map = new Map<string, { region: string; customers: number; sales: number; balance: number; visits: number }>();
    myCustomers.forEach((c) => {
      const region = c.governorate || c.region || c.district || 'غير محدد';
      const row = map.get(region) || { region, customers: 0, sales: 0, balance: 0, visits: 0 };
      row.customers += 1;
      row.balance += Number(c.currentBalance ?? c.balance ?? 0);
      row.sales += Number(c.totalSpent ?? c.totalOverallSales ?? 0);
      map.set(region, row);
    });
    myVisits.forEach((v) => {
      const cust = myCustomers.find((c) => c.id === v.customerId);
      const region = cust?.governorate || cust?.region || cust?.district || 'غير محدد';
      const row = map.get(region) || { region, customers: 0, sales: 0, balance: 0, visits: 0 };
      row.visits += 1;
      map.set(region, row);
    });
    return Array.from(map.values()).sort((a, b) => b.balance - a.balance).slice(0, 6);
  }, [myCustomers, myVisits]);

  // ===== أعلى المديونيات =====
  const topDebts = useMemo(() => {
    return [...myCustomers]
      .map((c) => ({ customer: c, balance: Number(c.currentBalance ?? c.balance ?? 0) }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);
  }, [myCustomers]);

  // ===== tiles =====
  const fieldTiles: RepTile[] = [
    { id: 'customers', label: 'العملاء', hint: 'قائمة عملاء المندوب', icon: Users, accent: 'bg-blue-500', ring: 'group-active:border-blue-300', action: () => onNavigate('all_customers') },
    { id: 'catalog', label: 'الكتالوج', hint: 'الأصناف والأسعار', icon: Boxes, accent: 'bg-cyan-500', ring: 'group-active:border-cyan-300', action: () => onNavigate('catalog') },
    { id: 'new-invoice', label: 'فاتورة مبيعات', hint: 'طلبية جديدة', icon: ShoppingCart, accent: 'bg-emerald-500', ring: 'group-active:border-emerald-300', action: onNewInvoice },
    { id: 'visits', label: 'الزيارات', hint: 'خط السير و GPS', icon: MapPin, accent: 'bg-rose-500', ring: 'group-active:border-rose-300', action: () => onNavigate('visits') },
    { id: 'returns', label: 'المرتجعات', hint: 'مرتجع فاتورة', icon: RotateCcw, accent: 'bg-amber-500', ring: 'group-active:border-amber-300', action: () => onNavigate('invoices') },
  ];

  const moneyTiles: RepTile[] = [
    { id: 'collections', label: 'التحصيلات', hint: 'سند قبض / تحصيل', icon: Coins, accent: 'bg-purple-500', ring: 'group-active:border-purple-300', action: () => onNavigate('visits') },
    { id: 'statement', label: 'كشف حساب العميل', hint: 'المديونيات وسقف الائتمان', icon: Wallet, accent: 'bg-indigo-500', ring: 'group-active:border-indigo-300', action: () => onNavigate('all_customers') },
    { id: 'debts', label: 'المديونيات', hint: 'أعلى العملاء ديناً', icon: FileText, accent: 'bg-pink-500', ring: 'group-active:border-pink-300', action: () => onNavigate('all_customers') },
  ];

  const reportTiles: RepTile[] = [
    { id: 'sales-report', label: 'تقرير المبيعات', hint: 'متابعة طلبياتي', icon: LayoutDashboard, accent: 'bg-teal-500', ring: 'group-active:border-teal-300', action: () => onNavigate('dashboard') },
    { id: 'forecast', label: 'توقعات التحصيل', hint: 'المتوقع تحصيله', icon: TrendingUp, accent: 'bg-orange-500', ring: 'group-active:border-orange-300', action: () => onNavigate('forecast') },
    { id: 'targets', label: 'هدفي والتارجت', hint: 'المبيعات والتحصيل', icon: Target, accent: 'bg-lime-500', ring: 'group-active:border-lime-300', action: () => onNavigate('targets') },
  ];

  const moreTiles: RepTile[] = [
    { id: 'inventory', label: 'المخزون', hint: 'الأرصدة المتاحة', icon: Layers, accent: 'bg-sky-500', ring: 'group-active:border-sky-300', action: () => onNavigate('inventory') },
    { id: 'guide', label: 'دليل دورة العمل', hint: 'طريقة التشغيل', icon: BookOpen, accent: 'bg-slate-500', ring: 'group-active:border-slate-300', action: () => onNavigate('guide') },
  ];

  const renderTile = (tile: RepTile) => {
    const Icon = tile.icon;
    return (
      <button
        key={tile.id}
        type="button"
        onClick={tile.action}
        className={`group flex flex-col items-center justify-center gap-1.5 p-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm min-h-[104px] transition-all duration-150 active:scale-95 cursor-pointer ${tile.ring}`}
      >
        <span className={`w-11 h-11 ${tile.accent} text-white rounded-full flex items-center justify-center shadow-md`}>
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <span className="text-[12px] font-bold text-slate-800 text-center leading-tight">{tile.label}</span>
        <span className="text-[10px] font-medium text-slate-400 text-center leading-tight -mt-0.5">{tile.hint}</span>
      </button>
    );
  };

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

  const alertStyles: Record<RepAlert['kind'], string> = {
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };

  const alertIconStyles: Record<RepAlert['kind'], string> = {
    danger: 'bg-rose-500 text-white',
    warning: 'bg-amber-500 text-white',
    info: 'bg-sky-500 text-white',
    success: 'bg-emerald-500 text-white',
  };

  const progressColor = (rate: number) =>
    rate >= 90 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="space-y-4">
      {/* ===== ترويسة المندوب ===== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={currentUser?.avatar || '/pwa-192x192.png'}
              alt={currentUser?.name || 'المندوب'}
              className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-400 shadow-sm shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-black text-slate-900 text-base truncate">{currentUser?.name || 'المندوب'}</h1>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5 truncate">
                {currentUser?.branchName || 'كل الفروع'} • المندوب الميداني
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isOffline && (
              <span className="flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-300 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap">
                <WifiOff className="w-3 h-3" />
                أوفلاين
              </span>
            )}
            {visibleAlerts.length > 0 && (
              <span className="flex items-center gap-1 bg-rose-100 text-rose-700 border border-rose-300 text-[10px] font-black px-2 py-1 rounded-lg whitespace-nowrap">
                <BellRing className="w-3 h-3" />
                {visibleAlerts.length}
              </span>
            )}
          </div>
        </div>

        {/* ملخص اليوم */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-rose-500">{stats.myVisitsToday}</div>
            <div className="text-[10px] font-bold text-slate-500">زيارات اليوم</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-blue-500">{stats.myInvoices}</div>
            <div className="text-[10px] font-bold text-slate-500">طلبياتي</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
            <div className="text-lg font-black text-amber-500">{stats.pendingReview}</div>
            <div className="text-[10px] font-bold text-slate-500">قيد المراجعة</div>
          </div>
        </div>
      </div>

      {/* ===== نظام الإشعارات البسيط ===== */}
      {visibleAlerts.length > 0 && (
        <section>
          {sectionTitle('إشعارات وتنبيهات فورية', Bell)}
          <div className="space-y-2">
            {(showAllAlerts ? visibleAlerts : visibleAlerts.slice(0, 3)).map((alert) => {
              const Icon = alert.icon;
              return (
                <div
                  key={alert.id}
                  className={`rounded-2xl border p-3 flex items-start gap-2.5 ${alertStyles[alert.kind]}`}
                >
                  <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${alertIconStyles[alert.kind]}`}>
                    <Icon className="w-4 h-4" size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-black leading-tight">{alert.title}</div>
                    <div className="text-[11px] font-medium opacity-80 mt-0.5 leading-snug">{alert.detail}</div>
                    {alert.actionLabel && alert.action && (
                      <button
                        type="button"
                        onClick={alert.action}
                        className="mt-1.5 text-[11px] font-black underline underline-offset-2 cursor-pointer"
                      >
                        {alert.actionLabel} ←
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissAlert(alert.id)}
                    className="p-1 rounded-lg hover:bg-black/5 transition cursor-pointer shrink-0"
                    title="إخفاء التنبيه"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {visibleAlerts.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllAlerts((v) => !v)}
                className="w-full flex items-center justify-center gap-1.5 bg-white rounded-xl border border-slate-200 py-2 text-[11px] font-black text-slate-600 cursor-pointer active:scale-[0.99] transition"
              >
                {showAllAlerts ? (
                  <>
                    عرض أقل <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    عرض كل التنبيهات ({visibleAlerts.length}) <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ===== التارجت والمتبقي ===== */}
      <section>
        {sectionTitle(`التارجت والمتبقي — ${currentMonthName}`, Target)}
        <div className="grid grid-cols-2 gap-2.5">
          {/* هدف البيع */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">هدف البيع</span>
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Target className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-1.5 font-mono text-base font-black text-emerald-800 truncate" title={formatCurrency(targetSummary.salesTarget)}>
              {formatCurrency(targetSummary.salesTarget)}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">
              المحقق: <span className="font-mono text-slate-700">{formatCurrency(targetSummary.salesAchieved)}</span>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] font-black mb-1">
                <span className="text-slate-500">الإنجاز</span>
                <span className={targetSummary.salesRate >= 90 ? 'text-emerald-700' : targetSummary.salesRate >= 60 ? 'text-amber-700' : 'text-rose-700'}>
                  {targetSummary.salesRate}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${progressColor(targetSummary.salesRate)}`} style={{ width: `${Math.min(100, targetSummary.salesRate)}%` }} />
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500">
              المتبقي للبيع: <span className="font-mono text-rose-600">{formatCurrency(targetSummary.remainingSales)}</span>
            </div>
          </div>

          {/* هدف التحصيل */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">هدف التحصيل</span>
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Coins className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-1.5 font-mono text-base font-black text-blue-800 truncate" title={formatCurrency(targetSummary.collectionTarget)}>
              {formatCurrency(targetSummary.collectionTarget)}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">
              المحقق: <span className="font-mono text-slate-700">{formatCurrency(targetSummary.collectionAchieved)}</span>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] font-black mb-1">
                <span className="text-slate-500">الإنجاز</span>
                <span className={targetSummary.collectionRate >= 90 ? 'text-blue-700' : targetSummary.collectionRate >= 60 ? 'text-amber-700' : 'text-rose-700'}>
                  {targetSummary.collectionRate}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${targetSummary.collectionRate >= 90 ? 'bg-blue-600' : targetSummary.collectionRate >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, targetSummary.collectionRate)}%` }} />
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] font-bold text-slate-500">
              المتبقي للتحصيل: <span className="font-mono text-rose-600">{formatCurrency(targetSummary.remainingCollection)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== المتوقع تحصيله من المندوب + توقع البيع الشهري ===== */}
      <section>
        {sectionTitle('المتوقع تحصيله وتوقع البيع الشهري', TrendingUp)}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-3 text-white shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-purple-100">المتوقع تحصيله</span>
              <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-1.5 font-mono text-lg font-black truncate" title={formatCurrency(expectedCollection.total)}>
              {formatCurrency(expectedCollection.total)}
            </div>
            <div className="text-[10px] text-purple-100 font-semibold mt-1">
              من {expectedCollection.customersCount} عميل • {expectedCollection.records} توقع أسبوعي
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 text-[10px] font-bold text-purple-100">
              متوقع بيعه: <span className="font-mono">{formatCurrency(expectedCollection.salesTotal)}</span>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-3 text-white shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-orange-100">توقع البيع الشهري</span>
              <span className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="mt-1.5 font-mono text-lg font-black truncate" title={formatCurrency(monthlySalesForecast.total)}>
              {formatCurrency(monthlySalesForecast.total)}
            </div>
            <div className="text-[10px] text-orange-100 font-semibold mt-1">
              نسبة التغطية: {monthlySalesForecast.rate}% من هدف البيع
            </div>
            <div className="mt-2 pt-2 border-t border-white/20 text-[10px] font-bold text-orange-100">
              الفجوة: <span className="font-mono">{formatCurrency(monthlySalesForecast.gap)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== المستحقات والمديونيات ===== */}
      <section>
        {sectionTitle('المستحقات والمديونيات', Wallet)}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-1.5">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="font-mono text-sm font-black text-amber-800 truncate" title={formatCurrency(duesSummary.totalBalance)}>
              {formatCurrency(duesSummary.totalBalance)}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">إجمالي المديونيات</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-1.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="font-mono text-sm font-black text-rose-800 truncate" title={formatCurrency(duesSummary.totalOverdue)}>
              {formatCurrency(duesSummary.totalOverdue)}
            </div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">المتأخرات</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 text-center">
            <div className="w-8 h-8 mx-auto rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-1.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="font-mono text-sm font-black text-indigo-800">{duesSummary.overLimitCount}</div>
            <div className="text-[10px] font-bold text-slate-500 mt-0.5">تجاوز حد الائتمان</div>
          </div>
        </div>

        {/* أعلى المديونيات */}
        {topDebts.length > 0 && (
          <div className="mt-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                أعلى العملاء مديونية
              </span>
              <button
                type="button"
                onClick={() => onNavigate('all_customers')}
                className="text-[10px] font-black text-amber-600 underline underline-offset-2 cursor-pointer"
              >
                الكل ←
              </button>
            </div>
            <div className="space-y-1.5">
              {topDebts.map(({ customer, balance }, idx) => (
                <div key={customer.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-xl px-2.5 py-2 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                      idx === 0 ? 'bg-rose-500 text-white' : idx === 1 ? 'bg-amber-500 text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-800 truncate">{customer.name}</div>
                      <div className="text-[9px] text-slate-400 font-mono">{customer.code || 'بدون كود'}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] font-black text-rose-700 shrink-0" title={formatCurrency(balance)}>
                    {formatCurrency(balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== أوامر البيع ===== */}
      <section>
        {sectionTitle('أوامر البيع ودورة الطلبيات', Receipt)}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 text-center">
            <div className="text-base font-black text-amber-600">{salesOrdersSummary.pendingCount}</div>
            <div className="text-[9px] font-bold text-slate-500 leading-tight">بانتظار الاعتماد</div>
            <div className="text-[9px] font-mono text-slate-400 truncate" title={formatCurrency(salesOrdersSummary.pendingValue)}>
              {formatCurrency(salesOrdersSummary.pendingValue)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 text-center">
            <div className="text-base font-black text-cyan-600">{salesOrdersSummary.inDeliveryCount}</div>
            <div className="text-[9px] font-bold text-slate-500 leading-tight">قيد التوصيل</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 text-center">
            <div className="text-base font-black text-emerald-600">{salesOrdersSummary.deliveredCount}</div>
            <div className="text-[9px] font-bold text-slate-500 leading-tight">تم التسليم</div>
            <div className="text-[9px] font-mono text-slate-400 truncate" title={formatCurrency(salesOrdersSummary.deliveredValue)}>
              {formatCurrency(salesOrdersSummary.deliveredValue)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2.5 text-center">
            <div className="text-base font-black text-purple-600">{salesOrdersSummary.returnedCount}</div>
            <div className="text-[9px] font-bold text-slate-500 leading-tight">مرتجعات</div>
          </div>
        </div>
        <div className="mt-2 bg-slate-900 rounded-2xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400">مبيعات {currentMonthName} المسجلة</div>
            <div className="font-mono text-base font-black text-amber-300" title={formatCurrency(salesOrdersSummary.monthSales)}>
              {formatCurrency(salesOrdersSummary.monthSales)}
            </div>
          </div>
          <span className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </span>
        </div>
      </section>

      {/* ===== الزيارات للعمل عليها ===== */}
      <section>
        {sectionTitle('زيارات مجدولة للعمل عليها', CalendarCheck)}
        {visitsToWork.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center">
            <CalendarCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-[12px] font-black text-slate-600">لا توجد زيارات مجدولة قادمة</div>
            <p className="text-[10px] text-slate-400 mt-1">خط سيرك فارغ — جدول زياراتك من صفحة الزيارات</p>
            <button
              type="button"
              onClick={() => onNavigate('visits')}
              className="mt-3 inline-flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] px-4 py-2 rounded-xl cursor-pointer active:scale-95 transition"
            >
              جدولة زيارة جديدة <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visitsToWork.map((v) => {
              const isToday = v.date === today;
              const isTomorrow = v.date === (() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onNavigate('visits')}
                  className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-3 flex items-center gap-3 text-right cursor-pointer active:scale-[0.99] transition hover:border-amber-300"
                >
                  <span className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${
                    isToday ? 'bg-rose-500 text-white' : isTomorrow ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <span className="text-[9px] font-black leading-none">
                      {isToday ? 'اليوم' : isTomorrow ? 'غداً' : v.date.slice(8, 10)}
                    </span>
                    <span className="text-[8px] font-bold leading-none mt-0.5">
                      {isToday || isTomorrow ? v.date.slice(5, 7) + '/' + v.date.slice(0, 4) : v.date.slice(5, 7)}
                    </span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-black text-slate-800 truncate">{v.customerName || 'عميل غير محدد'}</div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {v.time && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{v.time}</span>}
                      {v.type && <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">{v.type}</span>}
                      {v.outcome && <span className="text-slate-400">• {v.outcome}</span>}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    {v.collectedAmount ? (
                      <span className="font-mono text-[11px] font-black text-emerald-600 block">{formatCurrency(v.collectedAmount)}</span>
                    ) : null}
                    <span className="text-[9px] font-bold text-slate-400">{v.status || 'مجدولة'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== تحليلات بالمنطقة ===== */}
      {regionAnalytics.length > 0 && (
        <section>
          {sectionTitle('تحليلات المناطق', MapPinned)}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
            {regionAnalytics.map((r) => (
              <div key={r.region} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
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
            ))}
          </div>
        </section>
      )}

      {/* ===== رسائل تحفظية للمندوب والمشرف ومدير الفرع ===== */}
      <section>
        {sectionTitle('رسائل تحفظية وتوجيهية', MessageSquare)}
        <div className="space-y-2">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-3.5 text-white border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                <User className="w-4 h-4" />
              </span>
              <span className="text-[12px] font-black">للمندوب الميداني</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>سجّل التحصيل فوراً عند الاستلام — كل زيارة تُنقص رصيد العميل تلقائياً</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>لا تُنشئ طلبيات لعميل تجاوز حد الائتمان دون موافقة المشرف</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>أرسل توقعك الأسبوعي قبل نهاية الفترة ليظهر للمشرف للاعتماد</span>
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-2xl p-3.5 text-white border border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <UserCheck className="w-4 h-4" />
              </span>
              <span className="text-[12px] font-black">للمشرف على الفريق</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-blue-100 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>اعتمد الطلبيات المعلقة خلال ساعات العمل لمنع توقف دورة الصرف</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>راجع المرتجعات المحتجزة وحوّلها لأمين المخزن لاسترداد الأرصدة</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>تابع مندوبيك المتعثرين في التحصيل من لوحة الزيارات الميدانية</span>
              </li>
            </ul>
          </div>

          <div className="bg-gradient-to-r from-purple-900 to-purple-800 rounded-2xl p-3.5 text-white border border-purple-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </span>
              <span className="text-[12px] font-black">لمدير الفرع</span>
            </div>
            <ul className="space-y-1.5 text-[11px] text-purple-100 leading-relaxed">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>اعتمد الطلبيات المعلقة بانتظار الفرع لإغلاق دورة الطلب</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>رصد مديونيات الفرع وتوزيعها على المناطق لمعرفة الأولويات</span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>قارن أداء المناطق شهرياً من لوحة الإدارة والتحليلات</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== العمليات الميدانية اليومية ===== */}
      <section>
        {sectionTitle('العمليات الميدانية اليومية')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {fieldTiles.map(renderTile)}
        </div>
      </section>

      {/* ===== التحصيلات والماليات ===== */}
      <section>
        {sectionTitle('التحصيلات والماليات')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {moneyTiles.map(renderTile)}
        </div>
      </section>

      {/* ===== التقارير السريعة ===== */}
      <section>
        {sectionTitle('التقارير السريعة للمندوب')}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
          {reportTiles.map(renderTile)}
        </div>
      </section>

      {/* ===== المزيد ===== */}
      <section>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="w-full flex items-center justify-between bg-white rounded-2xl border border-slate-200 shadow-sm px-4 py-3 mb-2 cursor-pointer active:scale-[0.99] transition-transform"
        >
          <span className="text-[13px] font-black text-slate-700 flex items-center gap-1.5">
            <span className="w-1 h-3.5 rounded-full bg-slate-400 inline-block" />
            المزيد
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        </button>
        {showMore && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
            {moreTiles.map(renderTile)}
          </div>
        )}
      </section>

      {/* تلميح التثبيت */}
      <p className="text-center text-[10px] text-slate-400 font-semibold px-4">
        <Store className="w-3 h-3 inline-block ml-1" />
        نفس بيانات السيرفر — الصفحات والأرقام واحدة على الموبايل والكمبيوتر
      </p>
    </div>
  );
};

export default MobileRepDashboard;
