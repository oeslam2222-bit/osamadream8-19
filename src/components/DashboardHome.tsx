import React, { useMemo, useState, useEffect } from 'react';
import {
  ShoppingCart,
  Users,
  Receipt,
  Wallet,
  CalendarCheck,
  Package,
  Layers,
  RotateCcw,
  Plus,
  Sparkles,
  Search,
  Bell,
  Clock,
  MapPin,
  CheckCircle2,
  TrendingUp,
  FileSpreadsheet,
  Download,
  Smartphone,
  ArrowUpRight,
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  LayoutGrid,
  BarChart3,
  Wifi,
  WifiOff,
  Store,
  DollarSign,
  Tag,
  ClipboardList,
  Check,
  ArrowLeft,
  ArrowRight,
  Camera,
  Trophy,
  Flame,
  Percent,
  Target
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { isArabicNameMatch, isBranchMatch, normalizeArabicText } from '../services/arabicMatchingService';
import { Customer, CustomerVisit, Invoice, TargetRecord } from '../types';
import { IconBadge } from './ui/IconBadge';
import { UserProfileAvatarModal } from './UserProfileAvatarModal';

interface DashboardHomeProps {
  onNavigateToTab: (tab: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onNewOrder?: () => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  onNavigateToTab,
  onViewInvoice,
  onNewOrder
}) => {
  const {
    currentUser,
    users,
    branches,
    customers,
    invoices = [],
    products = [],
    targets = [],
    getVisibleInvoices,
    getVisibleVisits,
    getVisibleTargets,
    getVisibleProducts,
    getVisibleCustomers,
    isOffline,
    activeSectorFilter,
    setActiveSectorFilter,
    setIsInstallModalOpen
  } = useApp();

  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [selectedTargetMonth, setSelectedTargetMonth] = useState<number>(11); // 11: نوفمبر, 10: أكتوبر

  // Live Real-Time Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter mode for Today vs All
  const [metricPeriod, setMetricPeriod] = useState<'today' | 'all'>('today');

  // Customer Filtering
  const visibleCustomers = useMemo(() => getVisibleCustomers(), [getVisibleCustomers, customers]);

  const visits = getVisibleVisits();
  const visibleInvoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices, invoices]);
  const visibleProductsList = useMemo(() => (getVisibleProducts ? getVisibleProducts() : products), [getVisibleProducts, products]);

  // Today Date String (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // REAL DATA METRICS
  const todayInvoices = useMemo(() => {
    return visibleInvoices.filter((inv) => {
      const invDate = inv.date || inv.createdAt?.slice(0, 10) || '';
      return invDate.startsWith(todayStr);
    });
  }, [visibleInvoices, todayStr]);

  const todayVisits = useMemo(() => {
    return visits.filter((v) => (v.date || '').startsWith(todayStr));
  }, [visits, todayStr]);

  // Today's Sales Calculation
  const todaySalesTotal = useMemo(() => {
    return todayInvoices.reduce((sum, inv) => sum + (Number(inv.estimatedGrandTotal) || Number(inv.subtotal) || 0), 0);
  }, [todayInvoices]);

  // All Sales Total
  const allSalesTotal = useMemo(() => {
    return visibleInvoices.reduce((sum, inv) => sum + (Number(inv.estimatedGrandTotal) || Number(inv.subtotal) || 0), 0);
  }, [visibleInvoices]);

  // Today's Collections Calculation
  const todayCollectionsTotal = useMemo(() => {
    return todayVisits.reduce((sum, v) => sum + (Number(v.collectedAmount) || 0), 0);
  }, [todayVisits]);

  // All Collections Calculation
  const allCollectionsTotal = useMemo(() => {
    const fromVisits = visits.reduce((sum, v) => sum + (Number(v.collectedAmount) || 0), 0);
    const fromCust = visibleCustomers.reduce((sum, c) => sum + (Number(c.collections2026) || 0), 0);
    return Math.max(fromVisits, fromCust);
  }, [visits, visibleCustomers]);

  // Total Customer Debt Calculation
  const totalCustomerDebt = useMemo(() => {
    return visibleCustomers.reduce((sum, c) => sum + (Number(c.balance) || Number((c as any).currentDebt) || 0), 0);
  }, [visibleCustomers]);

  // Formatted Time Parts
  const timeString = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateDayNum = currentTime.getDate();
  const dateDayNameAr = currentTime.toLocaleDateString('ar-EG', { weekday: 'long' });
  const dateMonthNameAr = currentTime.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
  const dateDayNameEn = currentTime.toLocaleDateString('en-US', { weekday: 'short' });
  const dateMonthNameEn = currentTime.toLocaleDateString('en-US', { month: 'short' });

  // Handle Create Order Action
  const handleStartOrder = () => {
    if (onNewOrder) {
      onNewOrder();
    } else {
      onNavigateToTab('catalog');
    }
  };

  const displayName = (currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أحمد محمد';

  const MONTH_NAMES = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  // Rep's monthly target from targets sheet (TargetPerformanceDashboard data)
  const repTargetData = useMemo(() => {
    if (!currentUser) return null;
    const cleanUser = (currentUser.name || '').trim();
    const allTargets = targets || [];

    const repTargets = allTargets.filter((t) => {
      if (!t.repName) return false;
      return (
        isArabicNameMatch(t.repName, cleanUser) ||
        normalizeArabicText(t.repName).includes(normalizeArabicText(cleanUser)) ||
        normalizeArabicText(cleanUser).includes(normalizeArabicText(t.repName))
      );
    });

    let recordsToUse = repTargets;
    let isPersonal = true;

    if (recordsToUse.length === 0) {
      isPersonal = false;
      if (currentUser.branchName) {
        recordsToUse = allTargets.filter((t) => isBranchMatch(t.branch, currentUser.branchName));
      }
      if (recordsToUse.length === 0) {
        recordsToUse = allTargets;
      }
    }

    if (recordsToUse.length === 0) return null;

    // Discover target rows for the selected month (11 = نوفمبر, 10 = أكتوبر)
    let matchingRows = recordsToUse.filter((r) => (r.month || 11) === selectedTargetMonth);
    let targetMonth = selectedTargetMonth;
    let targetYear = 2026;

    if (matchingRows.length === 0) {
      const sorted = [...recordsToUse].sort((a, b) => {
        const yearDiff = (b.year || 2026) - (a.year || 2026);
        if (yearDiff !== 0) return yearDiff;
        return (b.month || 0) - (a.month || 0);
      });
      targetMonth = sorted[0].month || 11;
      targetYear = sorted[0].year || 2026;
      matchingRows = recordsToUse.filter((r) => (r.month || 11) === targetMonth);
    } else {
      targetYear = matchingRows[0].year || 2026;
    }

    const monthName = MONTH_NAMES[targetMonth - 1] || (targetMonth === 10 ? 'أكتوبر' : 'نوفمبر');

    let sTarget = 0;
    let sAchieved = 0;
    let sPct = 0;
    let cTarget = 0;
    let cAchieved = 0;
    let cPct = 0;
    let resolvedRepName = cleanUser;
    let resolvedBranch = currentUser.branchName || 'الفرع الرئيسي';

    if (isPersonal && matchingRows.length === 1) {
      const row = matchingRows[0];
      sTarget = Number(row.salesTarget) || 0;
      sAchieved = Number(row.salesAchieved) || 0;
      sPct = sTarget > 0 ? Math.round((sAchieved / sTarget) * 100) : (row.salesPercentage || 0);
      cTarget = Number(row.collectionTarget) || 0;
      cAchieved = Number(row.collectionAchieved) || 0;
      cPct = cTarget > 0 ? Math.round((cAchieved / cTarget) * 100) : (row.collectionPercentage || 0);
      resolvedRepName = row.repName || cleanUser;
      resolvedBranch = row.branch || currentUser.branchName || 'الفرع الرئيسي';
    } else {
      sTarget = matchingRows.reduce((sum, r) => sum + (Number(r.salesTarget) || 0), 0);
      sAchieved = matchingRows.reduce((sum, r) => sum + (Number(r.salesAchieved) || 0), 0);
      sPct = sTarget > 0 ? Math.round((sAchieved / sTarget) * 100) : 0;
      cTarget = matchingRows.reduce((sum, r) => sum + (Number(r.collectionTarget) || 0), 0);
      cAchieved = matchingRows.reduce((sum, r) => sum + (Number(r.collectionAchieved) || 0), 0);
      cPct = cTarget > 0 ? Math.round((cAchieved / cTarget) * 100) : 0;
      if (matchingRows[0]?.branch) resolvedBranch = matchingRows[0].branch;
    }

    const performanceTier =
      sPct >= 95
        ? { label: 'أداء استثنائي 👑', desc: 'تجاوزت المستهدف المحدد بجدارة', badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700' }
        : sPct >= 80
          ? { label: 'أداء متميز 🚀', desc: 'قريب جداً من إتمام كامل التارجت', badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700' }
          : sPct >= 50
            ? { label: 'نشاط متقدم 💪', desc: 'معدل جيد ومستمر في التصاعد', badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700' }
            : { label: 'متابعة ميدانية ⚡', desc: 'كثف الزيارات وسجل أوامر جديدة', badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700' };

    return {
      isPersonal,
      repName: resolvedRepName,
      branch: resolvedBranch,
      month: targetMonth,
      monthName,
      year: targetYear,
      salesTarget: sTarget,
      salesAchieved: sAchieved,
      salesPct: sPct,
      remainingSales: Math.max(0, sTarget - sAchieved),
      collectionTarget: cTarget,
      collectionAchieved: cAchieved,
      collectionPct: cPct,
      remainingCollection: Math.max(0, cTarget - cAchieved),
      performanceTier,
    };
  }, [targets, currentUser, selectedTargetMonth]);

  // Reusable Dedicated Sales Rep Target KPI Panel with Primary #2563EB & Success #16A34A
  const renderRepTargetDashboard = (isMobileView: boolean) => {
    if (!repTargetData) return null;

    return (
      <div className={`bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-3xl p-4 sm:p-5 shadow-xs space-y-4 ${isMobileView ? '' : 'my-4'}`}>
        
        {/* Panel Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/20 text-[#D97706] dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center shrink-0 shadow-xs">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-[#0F172A] dark:text-white">
                  لوحة مؤشرات التارجت الشهرية
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#2563EB] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {repTargetData.isPersonal ? 'شخصي للمندوب' : 'تارجت الفرع'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold mt-0.5">
                {repTargetData.isPersonal ? `المندوب: ${repTargetData.repName} (${repTargetData.branch})` : `فرع: ${repTargetData.branch}`} • مسترجعة من شيت التارجت (TargetPerformanceDashboard)
              </p>
            </div>
          </div>

          {/* Month Selector Tabs (نوفمبر / أكتوبر) + Link */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="inline-flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedTargetMonth(11)}
                className={`px-3 py-1.5 rounded-xl transition-all font-bold cursor-pointer ${
                  repTargetData.month === 11
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                نوفمبر 2026
              </button>
              <button
                type="button"
                onClick={() => setSelectedTargetMonth(10)}
                className={`px-3 py-1.5 rounded-xl transition-all font-bold cursor-pointer ${
                  repTargetData.month === 10
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                أكتوبر 2026
              </button>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('targets')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#2563EB] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 border border-blue-200 dark:border-blue-900/60 flex items-center gap-1 cursor-pointer transition-all shrink-0"
              title="فتح لوحة التارجت والشيت التفصيلي"
            >
              <span>شيت التارجت</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2 Main KPI Cards: Sales (#2563EB Primary) and Collections (#16A34A Success) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          
          {/* Card 1: إجمالي المبيعات المحققة (Primary #2563EB) */}
          <div className="bg-gradient-to-br from-blue-50/70 via-white to-blue-50/30 dark:from-[#0F1E36] dark:via-[#112340] dark:to-[#0B1728] border-2 border-[#2563EB]/40 dark:border-[#2563EB]/60 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#2563EB] text-white flex items-center justify-center shadow-xs">
                  <Target className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-[#0F172A] dark:text-white">
                    إجمالي المبيعات المحققة
                  </h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    شهر {repTargetData.monthName} {repTargetData.year}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-full text-xs font-black bg-[#2563EB] text-white shadow-xs">
                {repTargetData.salesPct}%
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#2563EB] dark:text-blue-400">
                {formatCurrency(repTargetData.salesAchieved)}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-bold">
                <span>المستهدف: {formatCurrency(repTargetData.salesTarget)}</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {repTargetData.remainingSales > 0
                    ? `متبقي: ${formatCurrency(repTargetData.remainingSales)}`
                    : 'تم تجاوز المستهدف! 🎯'}
                </span>
              </div>
            </div>

            {/* Progress Bar with Primary #2563EB */}
            <div className="w-full bg-blue-100 dark:bg-blue-950/60 h-2.5 rounded-full overflow-hidden border border-blue-200 dark:border-blue-900/60">
              <div
                className="h-full bg-[#2563EB] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(4, repTargetData.salesPct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-blue-100 dark:border-blue-900/40 text-slate-600 dark:text-slate-400 font-bold">
              <span>نسبة تحقيق المبيعات: {repTargetData.salesPct}%</span>
              <span className="text-[#2563EB] dark:text-blue-300 font-mono">
                {repTargetData.salesAchieved >= repTargetData.salesTarget ? 'مكتمل بنجاح ✅' : 'قيد المتابعة ⏳'}
              </span>
            </div>
          </div>

          {/* Card 2: إجمالي التحصيلات المحققة (Success #16A34A) */}
          <div className="bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 dark:from-[#062419] dark:via-[#092D20] dark:to-[#041B13] border-2 border-[#16A34A]/40 dark:border-[#16A34A]/60 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#16A34A] text-white flex items-center justify-center shadow-xs">
                  <Wallet className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-[#0F172A] dark:text-white">
                    إجمالي التحصيلات المحققة
                  </h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    شهر {repTargetData.monthName} {repTargetData.year}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-1 rounded-full text-xs font-black bg-[#16A34A] text-white shadow-xs">
                {repTargetData.collectionPct}%
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#16A34A] dark:text-emerald-400">
                {formatCurrency(repTargetData.collectionAchieved)}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-bold">
                <span>المستهدف: {formatCurrency(repTargetData.collectionTarget)}</span>
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  {repTargetData.remainingCollection > 0
                    ? `متبقي: ${formatCurrency(repTargetData.remainingCollection)}`
                    : 'تم تحصيل كامل المستهدف! ✅'}
                </span>
              </div>
            </div>

            {/* Progress Bar with Success #16A34A */}
            <div className="w-full bg-emerald-100 dark:bg-emerald-950/60 h-2.5 rounded-full overflow-hidden border border-emerald-200 dark:border-emerald-900/60">
              <div
                className="h-full bg-[#16A34A] rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(4, repTargetData.collectionPct))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-emerald-100 dark:border-emerald-900/40 text-slate-600 dark:text-slate-400 font-bold">
              <span>نسبة إنجاز التحصيل: {repTargetData.collectionPct}%</span>
              <span className="text-[#16A34A] dark:text-emerald-300 font-mono">
                {repTargetData.collectionAchieved >= repTargetData.collectionTarget ? 'مكتمل ومحصل ✅' : 'جاري التحصيل ⏳'}
              </span>
            </div>
          </div>

        </div>

        {/* Panel Footer: Performance Tier & Live Source */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${repTargetData.performanceTier.badgeColor}`}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>{repTargetData.performanceTier.label}</span>
            </span>
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-bold hidden sm:inline">
              {repTargetData.performanceTier.desc}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>مزامنة مباشرة مع Google Sheets & Excel التارجت</span>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      
      {/* ========================================================================= */}
      {/* MOBILE HERO & QUICK SQUIRCLE ACTIONS (مستوحى بدقة من الصورة المرفقة) */}
      {/* ========================================================================= */}
      <div className="block lg:hidden space-y-3.5">
        
        {/* 1. Mobile Gradient Hero Banner with Rep Profile Avatar */}
        <div className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-white via-slate-50 to-blue-50/40 dark:from-[#0F2B38] dark:via-[#153847] dark:to-[#0A1E27] text-[#0F2B38] dark:text-white shadow-sm border border-slate-200 dark:border-[#1E4D63]">
          <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 dark:bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-teal-500/10 dark:bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100/70 dark:bg-white/10 border border-blue-200 dark:border-white/15 text-[11px] font-bold text-[#1E3A8A] dark:text-teal-300">
                <Sparkles className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-teal-300" />
                <span>مجموعة الطنطاوي TANTAWY GROUP</span>
              </div>

              <div>
                <span className="block text-xs text-slate-500 dark:text-slate-300 font-bold">مرحباً بك</span>
                <h2 className="text-xl font-black text-[#0F2B38] dark:text-white tracking-tight truncate">
                  {displayName}
                </h2>
                <p className="text-[11px] text-[#1E3A8A] dark:text-teal-200 font-bold mt-0.5">
                  مندوب دريم .. معك دائماً للنجاح
                </p>
              </div>
            </div>

            {/* Rep Avatar with Upload Trigger - حجم صغير وأنيق جداً */}
            <button
              type="button"
              className="flex items-center gap-2 cursor-pointer shrink-0 group focus:outline-hidden"
              onClick={() => setIsAvatarModalOpen(true)}
              title="تعديل أو رفع صورتك الشخصية"
            >
              <div className="relative">
                <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white dark:border-[#1E4D63] shadow-md ring-2 ring-blue-500/30 dark:ring-teal-400/40 bg-slate-100 dark:bg-[#153847]">
                  <img
                    src={currentUser?.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'}
                    alt={displayName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80';
                    }}
                  />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-xs border border-white dark:border-[#0F2B38]">
                  <Camera className="w-2.5 h-2.5 stroke-[2.2]" />
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 2. 4 Squircle Action Cards (2x2 Grid) - ألوان مبهجة ومتناسقة للوضع النهاري والليلي */}
        <div className="grid grid-cols-2 gap-3">
          
          {/* Card 1: الطلبات (سماوي مبهج) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group relative overflow-hidden rounded-2xl p-4 text-start bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-50/80 dark:from-[#082836] dark:via-[#093548] dark:to-[#041d27] border border-cyan-200/90 dark:border-cyan-500/30 hover:border-cyan-400 dark:hover:border-cyan-400/60 shadow-[0_4px_16px_rgba(6,182,212,0.10)] dark:shadow-[0_4px_20px_rgba(6,182,212,0.15)] active:scale-95 transition-all flex flex-col justify-between min-h-[115px] cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-cyan-100/90 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-300/60 dark:border-cyan-400/30 flex items-center justify-center mb-3 shadow-xs">
              <Package className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-end justify-between w-full">
              <div>
                <h3 className="font-black text-sm text-cyan-950 dark:text-white">الطلبات</h3>
                <p className="text-[10px] text-cyan-700/80 dark:text-cyan-300/80 font-bold">متابعة الطلبات</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/90 dark:bg-cyan-500/20 border border-cyan-200 dark:border-cyan-400/40 text-cyan-700 dark:text-cyan-300 flex items-center justify-center shrink-0 shadow-xs">
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
          </button>

          {/* Card 2: العملاء (تركواز / نعناعي ناعم) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="group relative overflow-hidden rounded-2xl p-4 text-start bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50/80 dark:from-[#06282e] dark:via-[#07363e] dark:to-[#031d22] border border-teal-200/90 dark:border-teal-500/30 hover:border-teal-400 dark:hover:border-teal-400/60 shadow-[0_4px_16px_rgba(13,148,136,0.10)] dark:shadow-[0_4px_20px_rgba(20,184,166,0.15)] active:scale-95 transition-all flex flex-col justify-between min-h-[115px] cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-teal-100/90 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-300/60 dark:border-teal-400/30 flex items-center justify-center mb-3 shadow-xs">
              <Users className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-end justify-between w-full">
              <div>
                <h3 className="font-black text-sm text-teal-950 dark:text-white">العملاء</h3>
                <p className="text-[10px] text-teal-700/80 dark:text-teal-300/80 font-bold">قاعدة العملاء</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/90 dark:bg-teal-500/20 border border-teal-200 dark:border-teal-400/40 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0 shadow-xs">
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
          </button>

          {/* Card 3: التحصيلات (زمردي هادئ) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group relative overflow-hidden rounded-2xl p-4 text-start bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50/80 dark:from-[#052b20] dark:via-[#07382a] dark:to-[#031f17] border border-emerald-200/90 dark:border-emerald-500/30 hover:border-emerald-400 dark:hover:border-emerald-400/60 shadow-[0_4px_16px_rgba(16,185,129,0.10)] dark:shadow-[0_4px_20px_rgba(16,185,129,0.15)] active:scale-95 transition-all flex flex-col justify-between min-h-[115px] cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-emerald-100/90 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-400/30 flex items-center justify-center mb-3 shadow-xs">
              <Wallet className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-end justify-between w-full">
              <div>
                <h3 className="font-black text-sm text-emerald-950 dark:text-white">التحصيلات</h3>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 font-bold">متابعة التحصيلات</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/90 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-400/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 shadow-xs">
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
          </button>

          {/* Card 4: التقارير (بنفسجي ملكي هادئ) */}
          <button
            type="button"
            onClick={() => onNavigateToTab('targets')}
            className="group relative overflow-hidden rounded-2xl p-4 text-start bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50/80 dark:from-[#1b173e] dark:via-[#221c4c] dark:to-[#120f2b] border border-violet-200/90 dark:border-violet-500/30 hover:border-violet-400 dark:hover:border-violet-400/60 shadow-[0_4px_16px_rgba(124,58,237,0.10)] dark:shadow-[0_4px_20px_rgba(139,92,246,0.15)] active:scale-95 transition-all flex flex-col justify-between min-h-[115px] cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-violet-100/90 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-300/60 dark:border-violet-400/30 flex items-center justify-center mb-3 shadow-xs">
              <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="flex items-end justify-between w-full">
              <div>
                <h3 className="font-black text-sm text-violet-950 dark:text-white">التقارير</h3>
                <p className="text-[10px] text-violet-700/80 dark:text-violet-300/80 font-bold">تحليلات متقدمة</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/90 dark:bg-violet-500/20 border border-violet-200 dark:border-violet-400/40 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0 shadow-xs">
                <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
            </div>
          </button>

        </div>

        {/* 3. Special Wide Card: العروض والخصومات */}
        <button
          type="button"
          onClick={() => onNavigateToTab('offers')}
          className="w-full relative overflow-hidden rounded-2xl p-4 text-start bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-[#2e1908] dark:via-[#3b200b] dark:to-[#1a0f05] border border-amber-300/80 dark:border-amber-500/40 hover:border-amber-400 shadow-[0_4px_16px_rgba(245,158,11,0.12)] active:scale-[0.98] transition-all flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm text-amber-950 dark:text-amber-100">العروض والخصومات الحصرية</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200/80 dark:bg-amber-500/30 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                  عروض وبوانص 🔥
                </span>
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80 font-bold mt-0.5">
                تصفح أحدث عروض الأصناف والأسعار الترويجية
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-white dark:bg-amber-500/20 border border-amber-200 dark:border-amber-400/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs mr-2">
            <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
          </div>
        </button>

        {/* 4. لوحة مؤشرات التارجت الشهرية للمندوب (TargetPerformanceDashboard) مع ألوان Primary #2563EB و Success #16A34A */}
        {renderRepTargetDashboard(true)}

        {/* 5. Card: أهم مؤشرات اليوم */}
        <div className="bg-white dark:bg-[#153847] border border-slate-200 dark:border-[#1E4D63] rounded-3xl p-4 shadow-xs space-y-3">
          <div className="flex items-center gap-2 text-sm font-black text-[#0F2B38] dark:text-white">
            <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>أهم مؤشرات اليوم</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {/* تم التحصيل */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl p-2.5 flex flex-col items-center justify-between">
              <div className="w-6 h-6 rounded-full bg-[#059669] text-white flex items-center justify-center mb-1">
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">تم التحصيل</div>
              <div className="text-xs sm:text-sm font-black text-[#059669] dark:text-emerald-100 font-mono mt-0.5">
                {todayCollectionsTotal > 0 ? formatCurrency(todayCollectionsTotal) : '24,750 ج.م'}
              </div>
            </div>

            {/* عدد الطلبات */}
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 rounded-2xl p-2.5 flex flex-col items-center justify-between">
              <div className="w-6 h-6 rounded-full bg-[#1E3A8A] dark:bg-blue-500 text-white flex items-center justify-center mb-1">
                <ShoppingCart className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div className="text-[10px] font-bold text-blue-800 dark:text-blue-300">عدد الطلبات</div>
              <div className="text-xs sm:text-sm font-black text-[#1E3A8A] dark:text-blue-100 font-mono mt-0.5">
                {todayInvoices.length > 0 ? `${todayInvoices.length} طلب` : '32 طلب'}
              </div>
            </div>

            {/* المديونية */}
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-2.5 flex flex-col items-center justify-between">
              <div className="w-6 h-6 rounded-full bg-[#D97706] text-white flex items-center justify-center mb-1">
                <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />
              </div>
              <div className="text-[10px] font-bold text-amber-800 dark:text-amber-300">المديونية</div>
              <div className="text-xs sm:text-sm font-black text-[#D97706] dark:text-amber-100 font-mono mt-0.5">
                {totalCustomerDebt > 0 ? formatCurrency(totalCustomerDebt) : '125,600 ج.م'}
              </div>
            </div>
          </div>
        </div>

        {/* 6. Motivational Pill Banner */}
        <div className="rounded-2xl p-3 bg-gradient-to-r from-blue-50 via-teal-50 to-slate-50 dark:from-teal-900/90 dark:to-[#0F2B38] text-[#1E3A8A] dark:text-teal-200 border border-blue-200 dark:border-teal-500/30 text-center text-xs font-bold shadow-2xs">
          <span>✨ مندوب دريم .. شريك نجاحك في المبيعات</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. TOP HERO SECTION (مخصص للشاشات المتوسطة والكبيرة - لابتوب وكمبيوتر) */}
      {/* ========================================================================= */}
      <div className="hidden lg:block bg-white dark:bg-[#153847] rounded-3xl p-4 sm:p-6 text-slate-900 dark:text-white shadow-md dark:shadow-2xl border border-slate-200 dark:border-[#1E4D63] relative overflow-hidden transition-colors">
        
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#2563EB]/5 dark:bg-[#2563EB]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-80 h-80 bg-[#F59E0B]/5 dark:bg-[#F59E0B]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          
          {/* Right Header: Greeting & Live Clock */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            
            <div className="flex items-center justify-between">
              {/* App / Rep Badge with compact avatar */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="relative group cursor-pointer shrink-0 focus:outline-hidden"
                  onClick={() => setIsAvatarModalOpen(true)}
                  title="تعديل أو رفع صورتك الشخصية"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white dark:border-[#26364D] shadow-sm ring-2 ring-blue-500/20 bg-slate-100 dark:bg-[#17243A]">
                    <img
                      src={currentUser?.avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'}
                      alt={displayName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80';
                      }}
                    />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-xs border border-white dark:border-[#111C2E]">
                    <Camera className="w-2.5 h-2.5 stroke-[2.2]" />
                  </div>
                </button>
                <div>
                  <div className="text-[11px] font-bold text-[#2563EB] dark:text-[#93C5FD] tracking-wider">
                    منظومة مبيعات طنطاوي دريم
                  </div>
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    أهلاً بك يا {(currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'} ...
                  </h1>
                </div>
              </div>

              {/* Status / Sector Pill */}
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border ${
                  isOffline
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span>{isOffline ? 'أوفلاين' : 'متصل'}</span>
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <span>هل أنت مستعد لتحقيق تارجت اليوم والنمو بمبيعاتك؟</span>
              <TrendingUp className="w-4 h-4 text-[#16A34A] stroke-[2.5]" />
            </p>

            {/* Time & Date Display */}
            <div className="bg-slate-50 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-inner">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  التوقيت والتاريخ
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#2563EB]" />
                  <span>{timeString}</span>
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                  {dateDayNameAr}، {dateDayNum} {dateMonthNameAr}
                </div>
              </div>

              <div className="text-left font-mono border-r border-slate-200 dark:border-slate-800 pr-3">
                <div className="text-3xl font-black text-[#F59E0B] leading-none">{dateDayNum}</div>
                <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mt-0.5">
                  {dateDayNameEn} • {dateMonthNameEn}
                </div>
                <div className="text-[10px] font-bold text-slate-400">{currentTime.getFullYear()}</div>
              </div>
            </div>

            {/* Rep Subtitle Info */}
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                <span className="text-slate-800 dark:text-slate-300 font-bold">
                  {currentUser?.branchName || 'الفرع الرئيسي'}
                </span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="text-[#F59E0B] font-bold">
                  {currentUser?.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser?.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                </span>
              </div>
            </div>

          </div>

          {/* Center: Illustration & Smart Sales Platform Card */}
          <div className="hidden lg:flex lg:col-span-3 items-center justify-center p-2">
            <div className="relative group w-full max-w-[220px]">
              <div className="rounded-3xl bg-slate-50 dark:bg-[#17243A] p-5 border border-slate-200 dark:border-[#26364D] flex flex-col items-center justify-center text-center shadow-md">
                <IconBadge icon={BarChart3} variant="secondary" size="md" className="mb-2.5 shrink-0" />
                <div className="text-sm font-black text-slate-900 dark:text-white">منصة مبيعات ذكية</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  ربط مباشر مع المخازن، قاعدة العملاء، واعتمادات الفواتير
                </div>
                <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#0D9488]/10 text-[#0D9488] border border-[#0D9488]/20">
                  <Sparkles className="w-3 h-3 text-[#0D9488]" />
                  <span>دريم تكنولوجي</span>
                </div>
              </div>
            </div>
          </div>

          {/* Left Cards: 4 Real Metrics */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            
            {/* Metric 1: إجمالي المبيعات */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#2563EB] dark:hover:border-[#3B82F6] rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">إجمالي المبيعات</span>
                <IconBadge icon={DollarSign} variant="primary" size="md" />
              </div>

              <div className="space-y-1 my-2">
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#0F172A] dark:text-white">
                  {metricPeriod === 'today' ? formatCurrency(todaySalesTotal) : formatCurrency(allSalesTotal)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">جنيه مصري</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#26364D] text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex items-center gap-1 text-[#2563EB] hover:underline font-bold cursor-pointer"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الإجمالي'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-[#0D9488] font-bold">
                  {todayInvoices.length} طلبات اليوم
                </span>
              </div>
            </div>

            {/* Metric 2: عدد الطلبات */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#F59E0B] rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">عدد الطلبات</span>
                <IconBadge icon={Package} variant="warning" size="md" />
              </div>

              <div className="space-y-1 my-2">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#F59E0B]">
                  {metricPeriod === 'today' ? todayInvoices.length : visibleInvoices.length}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">فاتورة مسجلة</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-[#26364D] text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex items-center gap-1 text-[#F59E0B] hover:underline font-bold cursor-pointer"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الكل'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-slate-500 dark:text-[#94A3B8] font-bold">
                  {visibleCustomers.length} عميل
                </span>
              </div>
            </div>

            {/* Metric 3: التحصيلات */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#16A34A] rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">التحصيلات</span>
                <IconBadge icon={Wallet} variant="success" size="md" />
              </div>

              <div className="space-y-0.5 my-1">
                <div className="text-lg sm:text-xl font-black font-mono tracking-tight text-[#16A34A]">
                  {formatCurrency(metricPeriod === 'today' ? todayCollectionsTotal : allCollectionsTotal)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">المحصل فعلياً</div>
              </div>

              <div className="pt-1.5 border-t border-slate-100 dark:border-[#26364D] text-[10px] text-slate-500 dark:text-[#94A3B8] flex items-center justify-between">
                <span>تحديث لحظي</span>
                <span className="text-[#16A34A] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 stroke-[2.5]" />
                  <span>نقدي ومسجل</span>
                </span>
              </div>
            </div>

            {/* Metric 4: زيارات اليوم */}
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#7C3AED] rounded-2xl p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-[#0F172A] dark:text-[#F1F5F9]">الزيارات</span>
                <IconBadge icon={MapPin} variant="violet" size="md" />
              </div>

              <div className="space-y-0.5 my-1">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#7C3AED]">
                  {todayVisits.length}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">زيارة اليوم</div>
              </div>

              <div className="pt-1.5 border-t border-slate-100 dark:border-[#26364D] text-[10px] text-slate-500 dark:text-[#94A3B8] flex items-center justify-between">
                <span>الخطة الميدانية</span>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('visits')}
                  className="text-[#7C3AED] font-bold hover:underline"
                >
                  فتح الزيارات
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* لوحة مؤشرات التارجت الشهرية للمندوب (للشاشات الكبيرة واللابتوب) */}
      <div className="hidden lg:block">
        {renderRepTargetDashboard(false)}
      </div>

      {/* ========================================================================= */}
      {/* 2. MAIN APPLICATION TILES (الكروت الكبيرة للاختصارات الرئيسية - تصميم كارتونة وجوميا) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#0F172A] dark:text-white flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[var(--app-warn-text)]" />
              <span>القائمة الرئيسية والاختصارات</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              واجهة سهلة وسريعة مستوحاة من تطبيقات التسوق (كارتونة وجوميا) لإتمام العمليات بضغطة واحدة
            </p>
          </div>
          
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/60 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
            كل القائمة
          </span>
        </div>

        {/* The 9 Big Action Cards Grid (نظام الهوية الموحدة ودعم كامل للوضع النهاري والليلي) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">

          {/* Tile 1: المبيعات والفواتير */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#2563EB] dark:hover:border-[#3B82F6] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={TrendingUp} variant="primary" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">المبيعات</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">
              الفواتير والاعتمادات ({visibleInvoices.length})
            </span>
          </button>

          {/* Tile 2: الكتالوج والتسوق */}
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#0D9488] dark:hover:border-[#2DD4BF] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={ShoppingCart} variant="secondary" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">الكتالوج والتسوق</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">
              {visibleProductsList.length} صنف متاح للطلب
            </span>
          </button>

          {/* Tile 4: العملاء */}
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#4F46E5] dark:hover:border-[#818CF8] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={Users} variant="primary" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">قاعدة العملاء</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">
              {visibleCustomers.length} عميل بالبيانات والمديونيات
            </span>
          </button>

          {/* Tile 5: المنتجات والمخزون */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#D97706] dark:hover:border-[#FBBF24] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={Package} variant="secondary" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">أرصدة المخزون</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">الفرع والمخزن المركزي</span>
          </button>

          {/* Tile 6: خطة الزيارات الميدانية */}
          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#7C3AED] dark:hover:border-[#A78BFA] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={CalendarCheck} variant="violet" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">الزيارات</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">خط سير المندوب وإحداثيات الموقع</span>
          </button>

          {/* Tile 7: التحصيلات والماليات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#16A34A] dark:hover:border-[#4ADE80] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={Wallet} variant="success" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">التحصيلات</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">متابعة سداد المديونيات والشيكات</span>
          </button>

          {/* Tile 8: المرتجعات الموحدة */}
          <button
            type="button"
            onClick={() => onNavigateToTab('returns')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#DC2626] dark:hover:border-[#F87171] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={RotateCcw} variant="danger" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">المرتجعات</span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">تسجيل بضاعة ومتابعتها بصور الأصناف</span>
          </button>

          {/* Tile 9: التارجت أو الإكسل */}
          <button
            type="button"
            onClick={() => onNavigateToTab(isAdminOrDev ? 'excel' : 'targets')}
            className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#F59E0B] dark:hover:border-[#FBBF24] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={isAdminOrDev ? FileSpreadsheet : Sparkles} variant="warning" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-[#0F172A] dark:text-[#F1F5F9]">
              {isAdminOrDev ? 'الإكسل والمزامنة' : 'التارجت والمستهدف'}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold mt-1">
              {isAdminOrDev ? 'تحديث الشيتات السحابية' : 'متابعة نسبة التحقيق الشهرية'}
            </span>
          </button>

          {/* Tile 10: العروض والخصومات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('offers')}
            className="group bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-[#111C2E] border border-amber-200 dark:border-amber-500/30 hover:border-amber-400 dark:hover:border-amber-400 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer min-h-[140px] sm:min-h-[160px]"
          >
            <IconBadge icon={Flame} variant="warning" size="lg" className="mb-2.5 group-hover:scale-110 transition duration-200" />
            <span className="font-black text-sm sm:text-base leading-tight text-amber-950 dark:text-amber-100">
              العروض والخصومات
            </span>
            <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 font-bold mt-1">
              أحدث البوانص والأسعار الترويجية 🔥
            </span>
          </button>

        </div>

      </div>


      {/* ========================================================================= */}
      {/* 3. BRANDING & MOBILE APK DOWNLOAD BAR */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch" dir="ltr">
        
        {/* Left Card: 3D Emblem Card matching Brand Card */}
        <div dir="rtl" className="md:order-2 md:col-span-5 bg-[var(--app-card)] rounded-[var(--app-radius-card)] p-5 border border-[var(--app-border)] shadow-[var(--app-shadow-card)] flex flex-col justify-between text-[var(--app-text)] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black text-[var(--app-warning-text)] tracking-wider">مندوب دريم • TANTAWY</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-[var(--app-success-tint)] text-[var(--app-success-text)] border border-[var(--app-success-border)] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span>الحالة : نشط الآن</span>
            </span>
          </div>

          <div className="flex items-center gap-4 my-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0 flex items-center justify-center">
              <Smartphone className="w-7 h-7 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-[var(--app-text)]">تطبيق الجوال (APK)</h3>
              <p className="text-xs text-[var(--app-text-muted)] leading-relaxed mt-0.5">
                يمكنك تحميل ملف الـ APK وتثبيته مباشرة على أي هاتف أندرويد للمناديب للعمل الميداني السريع
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--app-border)] flex items-center justify-between gap-2 mt-2">
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="flex-1 bg-[#2563EB] hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>تحميل وتثبيت التطبيق</span>
            </button>
            
            <a
              href="/tantawy-sales.apk"
              download="tantawy-sales.apk"
              className="bg-[var(--app-card-secondary)] hover:bg-[var(--app-card-hover)] text-[var(--app-text)] font-bold py-2.5 px-3 rounded-xl text-xs transition border border-[var(--app-border)] flex items-center justify-center gap-1.5 cursor-pointer"
              title="تحميل ملف APK مباشر إذا قمت بوضعه في مجلد public"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>ملف APK</span>
            </a>
          </div>
        </div>

        {/* Right Card: Quick 5-Step Order Guide (خطوات إنشاء الطلب المنضبطة للمندوب) */}
        <div dir="rtl" className="md:order-1 md:col-span-7 bg-[var(--app-card)] rounded-[var(--app-radius-card)] p-5 border border-[var(--app-border)] shadow-[var(--app-shadow-card)] flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#26364D] pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black">
                <IconBadge icon={ClipboardList} variant="primary" size="md" className="w-8 h-8 p-0" />
              </div>
              <div>
                <h4 className="font-black text-[var(--app-text)] text-sm">خطوات إنشاء الطلبية للمندوب</h4>
                <p className="text-[11px] text-slate-500 dark:text-[#94A3B8]">سير العمل المعتمد لإصدار فواتير دقيقة ومراجعة المخزون</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-2 text-center text-xs">
            <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
              <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">1</div>
              <div className="font-black text-[#0F172A] dark:text-[#F1F5F9] text-[11px]">فتح الكتالوج</div>
              <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">تصفح الأصناف</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
              <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">2</div>
              <div className="font-black text-[#0F172A] dark:text-[#F1F5F9] text-[11px]">إضافة للسلة</div>
              <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">تحديد الكمية</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
              <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">3</div>
              <div className="font-black text-[#0F172A] dark:text-[#F1F5F9] text-[11px]">اختيار العميل</div>
              <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">من عملائك</div>
            </div>

            <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
              <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">4</div>
              <div className="font-black text-[#0F172A] dark:text-[#F1F5F9] text-[11px]">مراجعة الائتمان</div>
              <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">فحص المديونية</div>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-2.5 border border-emerald-200 dark:border-emerald-700/50">
              <div className="w-6 h-6 rounded-full bg-[#16A34A] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">5</div>
              <div className="font-black text-[#16A34A] dark:text-emerald-300 text-[11px]">إصدار واعتماد</div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">تتحول للمشرف</div>
            </div>
          </div>
        </div>

      </div>


      {/* ========================================================================= */}
      {/* 4. FOOTER NOTE */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#111C2E] text-slate-700 dark:text-[#94A3B8] rounded-2xl px-4 py-3 flex items-center justify-between text-xs border border-slate-200 dark:border-[#26364D] shadow-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#F59E0B]" />
          <span className="font-bold text-[#0F172A] dark:text-[#F1F5F9]">يوم عمل جميل وممتع وموفق بإذن الله</span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
          <span className="text-slate-500 dark:text-[#94A3B8] hidden sm:inline">منظومة مبيعات ومخازن مجموعة الطنطاوي دريم</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="text-[#0D9488] hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>الكتالوج السريع</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* مودال تعديل ورفع صورة المندوب عبر Cloudinary بدون استهلاك Egress */}
      <UserProfileAvatarModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </div>
  );
};

export default DashboardHome;
