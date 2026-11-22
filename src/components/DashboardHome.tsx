import React, { useMemo, useState, useEffect } from 'react';
import {
  ShoppingCart, Users, Receipt, Wallet, CalendarCheck, Package, Layers,
  RotateCcw, Plus, Sparkles, Search, Bell, MapPin, CheckCircle2, TrendingUp,
  FileSpreadsheet, Download, Smartphone, ArrowUpRight, ShieldCheck,
  ChevronLeft, ChevronDown, LayoutGrid, BarChart3, Wifi, WifiOff, Store,
  DollarSign, Tag, ClipboardList, ArrowLeft, ArrowRight, Camera, Trophy, Flame, Percent,
  Target
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCompactCurrency, formatCurrency } from '../services/invoiceService';
import { isArabicNameMatch, isBranchMatch, normalizeArabicText } from '../services/arabicMatchingService';
import { Customer, CustomerVisit, Invoice, TargetRecord } from '../types';
import { IconBadge } from './ui/IconBadge';
import { UserProfileAvatarModal } from './UserProfileAvatarModal';
import { LiveClock } from './LiveClock';
import { KPICard } from './KPICard';
import { MiniGauge } from './ui/PerformanceGauge';
import { TargetGaugeSummary } from './home/TargetGaugeSummary';
import { useSnapshotCache } from '../hooks/useSnapshotCache';
import { formatSnapshotTime } from '../services/dashboardSnapshot';

interface DashboardHomeProps {
  onNavigateToTab: (tab: string) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onNewOrder?: () => void;
}

type ActionTile = {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType<LucideProps>;
  variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'violet';
  target: string;
};

type DashboardSectionId = 'overview' | 'target' | 'shortcuts' | 'guide';

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
    canManageSectorGate,
    effectiveSectorFilter,
    setIsInstallModalOpen
  } = useApp();

  const isRep = currentUser?.role === 'sales_rep';
  const isSupervisor = currentUser?.role === 'supervisor';
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [selectedTargetMonth, setSelectedTargetMonth] = useState<number>(11); // 11: نوفمبر, 10: أكتوبر

  // Filter mode for Today vs All
  const [metricPeriod, setMetricPeriod] = useState<'today' | 'all'>('today');

  // Which dashboard section is visible: primary KPIs stay on top, everything
  // else lives in tabs so the screen opens calm instead of crowded.
  const [activeSection, setActiveSection] = useState<DashboardSectionId>('overview');

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
    const allTargets = getVisibleTargets();

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
  }, [getVisibleTargets, currentUser, selectedTargetMonth]);

  // آخر لقطة صحيحة لأرقام التارجت — بتتحفظ محليًا وبتتعرض لو مفيش داتا جديدة أو النت قطع
  const targetSnapshotKey = `target:${currentUser?.id || 'anon'}:${selectedTargetMonth}`;
  const {
    data: cachedTargetData,
    stale: targetIsStale,
    savedAt: targetSavedAt,
  } = useSnapshotCache(targetSnapshotKey, repTargetData);
  const repTargetView = repTargetData ?? cachedTargetData;

  // Reusable Dedicated Sales Rep Target KPI Panel with Primary #2563EB & Success #16A34A
  const renderRepTargetDashboard = (isMobileView: boolean) => {
    const repTargetData = repTargetView;
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
                <h3 className="font-black text-sm sm:text-base text-[var(--app-text)] dark:text-white">
                  لوحة مؤشرات التارجت الشهرية
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-[#2563EB] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {repTargetData.isPersonal ? 'شخصي للمندوب' : 'تارجت الفرع'}
                </span>
                {targetIsStale && (
                  <span
                    title="مفيش تحديث جديد من قاعدة البيانات — دي آخر أرقام محفوظة على الجهاز"
                    className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                  >
                    بيانات محفوظة{targetSavedAt ? ` · ${formatSnapshotTime(targetSavedAt)}` : ''}
                  </span>
                )}
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

        {/* المؤشر القوسي — متوسط تحقيق المبيعات والتحصيل لنفس الشهر */}
        <TargetGaugeSummary
          salesPct={repTargetData.salesPct}
          collectionPct={repTargetData.collectionPct}
          salesTarget={repTargetData.salesTarget}
          salesAchieved={repTargetData.salesAchieved}
          collectionTarget={repTargetData.collectionTarget}
          collectionAchieved={repTargetData.collectionAchieved}
          monthName={repTargetData.monthName}
          year={repTargetData.year}
        />

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
                  <h4 className="font-black text-sm text-[var(--app-text)] dark:text-white">
                    إجمالي المبيعات المحققة
                  </h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    شهر {repTargetData.monthName} {repTargetData.year}
                  </span>
                </div>
              </div>
              <MiniGauge value={repTargetData.salesPct} size={46} />
            </div>

            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#2563EB] dark:text-blue-400">
                {formatCurrency(repTargetData.salesAchieved)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300 font-bold">
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
                  <h4 className="font-black text-sm text-[var(--app-text)] dark:text-white">
                    إجمالي التحصيلات المحققة
                  </h4>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                    شهر {repTargetData.monthName} {repTargetData.year}
                  </span>
                </div>
              </div>
              <MiniGauge value={repTargetData.collectionPct} size={46} />
            </div>

            <div className="space-y-1">
              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#16A34A] dark:text-emerald-400">
                {formatCurrency(repTargetData.collectionAchieved)}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300 font-bold">
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

  // بانر عروض وتخفيضات دريم — نسخة واحدة بتنسيقين (موبايل مدمج / ديسكتوب عريض).
  // الضغط عليه يفتح صفحة العروض مباشرة (تاب 'offers' متاح لكل الأدوار).
  const renderOffersBanner = (isMobileView: boolean) => (
    <button
      type="button"
      onClick={() => onNavigateToTab('offers')}
      className={`group relative w-full overflow-hidden rounded-3xl text-start bg-gradient-to-l from-amber-50 via-orange-50 to-rose-50 dark:from-[#2A1806] dark:via-[#3D2408] dark:to-[#2B1408] border border-amber-200 dark:border-amber-500/30 shadow-[0_4px_16px_rgba(245,158,11,0.12)] dark:shadow-[0_4px_20px_rgba(245,158,11,0.15)] hover:border-amber-400 dark:hover:border-amber-400/60 active:scale-[0.98] transition-all cursor-pointer ${isMobileView ? 'p-3.5' : 'p-4 sm:p-5'}`}
    >
      {/* زخارف ضبابية دافئة */}
      <div className="absolute top-0 left-0 w-24 h-24 bg-amber-400/20 dark:bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-24 h-24 bg-rose-400/20 dark:bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className={`relative z-10 flex items-center gap-3 ${isMobileView ? '' : 'sm:gap-4'}`}>
        {/* أيقونة نار ترويجية */}
        <div className={`shrink-0 rounded-2xl bg-gradient-to-br from-amber-100 to-rose-100 dark:from-amber-500/20 dark:to-rose-500/20 text-amber-600 dark:text-amber-300 border border-amber-300/60 dark:border-amber-400/30 flex items-center justify-center shadow-xs ${isMobileView ? 'w-11 h-11' : 'w-13 h-13 sm:w-14 sm:h-14'}`}>
          <Flame className={`${isMobileView ? 'w-5 h-5' : 'w-6 h-6 sm:w-7 sm:h-7'} stroke-[2.2] group-hover:scale-110 transition-transform`} />
        </div>

        {/* النصوص */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-black text-amber-950 dark:text-amber-50 ${isMobileView ? 'text-sm' : 'text-base sm:text-lg'}`}>
              عروض وتخفيضات دريم
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500 text-white shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>جديد</span>
            </span>
          </div>
          <p className={`text-amber-800/80 dark:text-amber-200/70 font-bold leading-snug mt-0.5 ${isMobileView ? 'text-[10px]' : 'text-xs sm:text-sm'}`}>
            خصومات حصرية على أصناف مختارة — الكميات محدودة والعرض لفترة قصيرة
          </p>
        </div>

        {/* CTA */}
        <div className={`shrink-0 flex items-center gap-1.5 bg-amber-500 group-hover:bg-amber-600 text-white rounded-full font-black shadow-sm group-hover:shadow-md transition-colors ${isMobileView ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs sm:text-sm'}`}>
          <Percent className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>شوف العروض</span>
          <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5] group-hover:-translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );

  const sectorLabel =
    currentUser?.sector === 'electrical'
      ? 'القطاع الكهربائي'
      : currentUser?.sector === 'both'
        ? 'منزلي + كهرباء'
        : 'القطاع المنزلي';

  const actionTiles: ActionTile[] = [
    { id: 'invoices', label: 'المبيعات', hint: `الفواتير والاعتمادات (${visibleInvoices.length})`, icon: TrendingUp, variant: 'primary', target: 'invoices' },
    { id: 'catalog', label: 'الكتالوج والتسوق', hint: `${visibleProductsList.length} صنف متاح للطلب`, icon: ShoppingCart, variant: 'secondary', target: 'catalog' },
    { id: 'customers', label: 'قاعدة العملاء', hint: `${visibleCustomers.length} عميل بالبيانات والمديونيات`, icon: Users, variant: 'violet', target: 'all_customers' },
    { id: 'visits', label: 'الزيارات الميدانية', hint: 'خط سير المندوب وإحداثيات الموقع', icon: CalendarCheck, variant: 'violet', target: 'visits' },
    { id: 'collection', label: 'التحصيلات', hint: 'متابعة سداد المديونيات والشيكات', icon: Wallet, variant: 'success', target: 'invoices' },
    { id: 'returns', label: 'المرتجعات', hint: 'تسجيل بضاعة ومتابعتها بصور الأصناف', icon: RotateCcw, variant: 'danger', target: 'returns' },
    {
      id: isAdminOrDev ? 'excel' : 'targets',
      label: isAdminOrDev ? 'الإكسل والمزامنة' : 'التارجت والمستهدف',
      hint: isAdminOrDev ? 'تحديث الشيتات السحابية' : 'متابعة نسبة التحقيق الشهرية',
      icon: isAdminOrDev ? FileSpreadsheet : Sparkles,
      variant: 'warning',
      target: isAdminOrDev ? 'excel' : 'targets',
    },
    { id: 'offers', label: 'العروض والخصومات', hint: 'أحدث البوانص والأسعار الترويجية 🔥', icon: Flame, variant: 'warning', target: 'offers' },
  ];

  const overviewTiles = actionTiles.slice(0, 4);

  // قيم كروت المؤشرات — تُختصر على الموبايل حتى لا تكسر الأرقام الطويلة الكارت
  const salesMetricValue = metricPeriod === 'today' ? todaySalesTotal : allSalesTotal;
  const collectionsMetricValue = metricPeriod === 'today' ? todayCollectionsTotal : allCollectionsTotal;

  const dashboardSections: Array<{ id: DashboardSectionId; label: string; icon: React.ElementType<LucideProps> }> = [
    { id: 'overview', label: 'نظرة عامة', icon: LayoutGrid },
    ...(repTargetData ? [{ id: 'target' as DashboardSectionId, label: 'التارجت الشهري', icon: Target }] : []),
    { id: 'shortcuts', label: 'كل الاختصارات', icon: Layers },
    { id: 'guide', label: 'التطبيق والدليل', icon: Smartphone },
  ];

  const renderActionTile = (tile: ActionTile) => {
    const Icon = tile.icon;
    return (
      <button
        key={tile.id}
        type="button"
        onClick={() => onNavigateToTab(tile.target)}
        className="group bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] hover:border-[#2563EB] dark:hover:border-[#3B82F6] rounded-2xl p-3.5 flex items-center gap-3 text-start shadow-xs hover:shadow-md active:scale-[0.98] transition-all cursor-pointer min-h-[64px]"
      >
        <IconBadge icon={Icon} variant={tile.variant} size="md" className="shrink-0 group-hover:scale-105 transition-transform" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs sm:text-sm font-black text-[var(--app-text)] dark:text-[#F1F5F9] truncate">{tile.label}</span>
          <span className="block text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold truncate mt-0.5">{tile.hint}</span>
        </span>
        <ChevronLeft className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5" dir="rtl">

      {/* ============================== Greeting ============================== */}
      <div className="relative overflow-hidden rounded-3xl p-4 sm:p-5 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] shadow-xs">
        <div className="pointer-events-none absolute -top-12 -left-10 w-40 h-40 rounded-full bg-[#2563EB]/8 dark:bg-[#2563EB]/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-14 -right-8 w-40 h-40 rounded-full bg-[#F59E0B]/8 dark:bg-[#F59E0B]/10 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="relative shrink-0 cursor-pointer group focus:outline-hidden"
              onClick={() => setIsAvatarModalOpen(true)}
              title="تعديل أو رفع صورتك الشخصية"
            >
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 border-white dark:border-[#26364D] shadow-sm ring-2 ring-blue-500/20 bg-slate-100 dark:bg-[#17243A]">
                <img
                  src={currentUser?.avatar || '/assets/rep-avatar.jpg'}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/rep-avatar.jpg';
                  }}
                />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-xs border border-white dark:border-[#111C2E]">
                <Camera className="w-2.5 h-2.5 stroke-[2.2]" />
              </div>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-[#2563EB] dark:text-[#93C5FD]">منظومة مبيعات طنطاوي دريم</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isOffline
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span>{isOffline ? 'أوفلاين' : 'متصل'}</span>
                </span>
              </div>

              <h1 className="text-lg sm:text-xl font-black text-[var(--app-text)] dark:text-white truncate">
                أهلاً بك يا {displayName}
              </h1>

              <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] font-bold text-slate-500 dark:text-[#94A3B8]">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#2563EB]" aria-hidden="true" />
                  {currentUser?.branchName || 'الفرع الرئيسي'}
                </span>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <Tag className="w-3 h-3 text-[#F59E0B]" aria-hidden="true" />
                  {canManageSectorGate ? (
                    /* تصنيف البرنامج قطاعين أساسيين فقط: منزلي / كهرباء */
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] p-0.5">
                      <button
                        type="button"
                        onClick={() => setActiveSectorFilter('home')}
                        aria-pressed={effectiveSectorFilter !== 'electrical'}
                        className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                          effectiveSectorFilter !== 'electrical'
                            ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                            : 'text-slate-600 dark:text-[#94A3B8]'
                        }`}
                      >
                        🏠 منزلي
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSectorFilter('electrical')}
                        aria-pressed={effectiveSectorFilter === 'electrical'}
                        className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer ${
                          effectiveSectorFilter === 'electrical'
                            ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                            : 'text-slate-600 dark:text-[#94A3B8]'
                        }`}
                      >
                        ⚡ كهرباء
                      </button>
                    </span>
                  ) : (
                    sectorLabel
                  )}
                </span>
              </div>
            </div>
          </div>

          <LiveClock />
        </div>
      </div>

      {/* ========================== Primary KPIs =========================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <h2 className="text-sm sm:text-base font-black text-[var(--app-text)] dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
            <span>مؤشراتك الآن</span>
          </h2>

          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setMetricPeriod('today')}
              aria-pressed={metricPeriod === 'today'}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                metricPeriod === 'today'
                  ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => setMetricPeriod('all')}
              aria-pressed={metricPeriod === 'all'}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                metricPeriod === 'all'
                  ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              الإجمالي
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Sales */}
          <KPICard
            label="إجمالي المبيعات"
            value={salesMetricValue}
            subtitle="جنيه مصري"
            variant="primary"
            icon={DollarSign}
            iconBadgeVariant="primary"
            smallLabel={`${todayInvoices.length} طلبات اليوم`}
          />
          {/* Orders */}
          <KPICard
            label="عدد الطلبات"
            value={metricPeriod === 'today' ? todayInvoices.length : visibleInvoices.length}
            subtitle="فاتورة مسجلة"
            variant="warning"
            icon={Package}
            iconBadgeVariant="warning"
            smallLabel={`${visibleCustomers.length} عميل`}
          />
          {/* Collections */}
          <KPICard
            label="التحصيلات"
            value={collectionsMetricValue}
            subtitle="المحصل فعلياً"
            variant="success"
            icon={Wallet}
            iconBadgeVariant="success"
            smallLabel="نقدي ومسجل"
          />
          {/* Visits */}
          <KPICard
            label="الزيارات"
            value={metricPeriod === 'today' ? todayVisits.length : visits.length}
            subtitle="زيارة مسجلة"
            variant="violet"
            icon={MapPin}
            iconBadgeVariant="violet"
            smallLabel="فتح الزيارات"
            smallOnClickLabel="فتح الزيارات"
            onClick={() => onNavigateToTab('visits')}
          />
        </div>
      </div>

      {/* ============================== Tabs ============================== */}
      <div
        role="tablist"
        aria-label="أقسام لوحة التحكم"
        className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-[#17243A] border border-slate-200 dark:border-[#26364D] overflow-x-auto"
      >
        {dashboardSections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white dark:bg-[#0F1E36] text-[#2563EB] dark:text-[#93C5FD] shadow-xs'
                  : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* ============================ Overview ============================ */}
      {activeSection === 'overview' && (
        <div className="space-y-3.5">
          {renderOffersBanner(false)}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <h2 className="text-sm sm:text-base font-black text-[var(--app-text)] dark:text-white">اختصارات سريعة</h2>
              <button
                type="button"
                onClick={() => setActiveSection('shortcuts')}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#2563EB] dark:text-[#93C5FD] hover:underline cursor-pointer"
              >
                <span>كل الاختصارات</span>
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {overviewTiles.map(renderActionTile)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#26364D] bg-white dark:bg-[#111C2E] px-4 py-3 flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500 dark:text-[#94A3B8] shadow-xs">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>مندوب دريم .. شريك نجاحك في المبيعات</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-[#2563EB]" aria-hidden="true" />
              <span>تحديث لحظي مع كل فاتورة وتحصيل</span>
            </span>
          </div>
        </div>
      )}

      {/* ========================= Monthly target ========================= */}
      {activeSection === 'target' && repTargetData && (
        <div className="space-y-3.5">
          {renderRepTargetDashboard(false)}
        </div>
      )}

      {/* =========================== Shortcuts =========================== */}
      {activeSection === 'shortcuts' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-sm sm:text-base font-black text-[var(--app-text)] dark:text-white flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-[#F59E0B]" aria-hidden="true" />
                <span>كل الاختصارات</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#94A3B8] font-bold mt-0.5">
                كل عمليات المنظومة في مكان واحد
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {actionTiles.map(renderActionTile)}
          </div>
        </div>
      )}

      {/* ============================ App guide =========================== */}
      {activeSection === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
          <div className="md:order-2 md:col-span-5 bg-[var(--app-card)] rounded-[var(--app-radius-card)] p-5 border border-[var(--app-border)] shadow-[var(--app-shadow-card)] flex flex-col justify-between text-[var(--app-text)] relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black text-[var(--app-warning-text)] tracking-wider">مندوب دريم • TANTAWY</span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-[var(--app-success-tint)] text-[var(--app-success-text)] border border-[var(--app-success-border)] shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <span>الحالة : نشط الآن</span>
              </span>
            </div>

            <div className="flex items-center gap-4 my-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 text-blue-500 dark:text-blue-400 border border-blue-500/30 shrink-0 flex items-center justify-center">
                <Smartphone className="w-7 h-7 stroke-[2.2]" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-black text-base sm:text-lg text-[var(--app-text)]">تثبيت تطبيق الجوال</h3>
                <p className="text-xs text-[var(--app-text-muted)] leading-relaxed mt-0.5">
                  ثبّت التطبيق كبرنامج حقيقي على أي هاتف أو كمبيوتر من المتصفح نفسه — بأيقونة الطنطاوي وشاشة كاملة بدون توزيع ملفات خارجية
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[var(--app-border)] flex items-center justify-between gap-2 mt-2">
              <button
                type="button"
                onClick={() => setIsInstallModalOpen(true)}
                className="flex-1 bg-[#2563EB] hover:bg-blue-700 text-white font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer shadow-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <Download className="w-4 h-4" aria-hidden="true" />
                <span>تثبيت التطبيق الآن</span>
              </button>
            </div>
          </div>

          <div className="md:order-1 md:col-span-7 bg-[var(--app-card)] rounded-[var(--app-radius-card)] p-5 border border-[var(--app-border)] shadow-[var(--app-shadow-card)] flex flex-col justify-between">
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
                <div className="font-black text-[var(--app-text)] dark:text-[#F1F5F9] text-[11px]">فتح الكتالوج</div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">تصفح الأصناف</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
                <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">2</div>
                <div className="font-black text-[var(--app-text)] dark:text-[#F1F5F9] text-[11px]">إضافة للسلة</div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">تحديد الكمية</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
                <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">3</div>
                <div className="font-black text-[var(--app-text)] dark:text-[#F1F5F9] text-[11px]">اختيار العميل</div>
                <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] mt-0.5">من عملائك</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#17243A] rounded-xl p-2.5 border border-slate-200/80 dark:border-[#26364D]">
                <div className="w-6 h-6 rounded-full bg-slate-900 dark:bg-[#2563EB] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">4</div>
                <div className="font-black text-[var(--app-text)] dark:text-[#F1F5F9] text-[11px]">مراجعة الائتمان</div>
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
      )}

      {/* ============================ Footer note ============================ */}
      <div className="bg-white dark:bg-[#111C2E] text-slate-700 dark:text-[#94A3B8] rounded-2xl px-4 py-3 flex items-center justify-between text-xs border border-slate-200 dark:border-[#26364D] shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-[#F59E0B] shrink-0" aria-hidden="true" />
          <span className="font-bold text-[var(--app-text)] dark:text-[#F1F5F9] truncate">يوم عمل جميل وممتع وموفق بإذن الله</span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">|</span>
          <span className="text-slate-500 dark:text-[#94A3B8] hidden sm:inline">منظومة مبيعات ومخازن مجموعة الطنطاوي دريم</span>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToTab('catalog')}
          className="text-[#0D9488] hover:underline font-bold flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <span className="hidden sm:inline">الكتالوج السريع</span>
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* مودال تعديل ورفع صورة المندوب عبر Cloudinary */}
      <UserProfileAvatarModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </div>
  );
};

export default DashboardHome;
