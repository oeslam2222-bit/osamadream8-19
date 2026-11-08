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
  Flame,
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
  Tag
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { isArabicNameMatch, isBranchMatch } from '../services/arabicMatchingService';
import { Customer, CustomerVisit, Invoice } from '../types';

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

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      
      {/* ========================================================================= */}
      {/* 1. TOP HERO SECTION */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--app-line)] bg-gradient-to-br from-[#0F172A] via-[#13243F] to-[#0B1220] p-4 text-white shadow-[var(--sh-lg)] sm:p-6 dark:border-slate-700/80">
        <div className="pointer-events-none absolute top-0 right-1/4 h-72 w-72 rounded-full bg-[var(--brand-primary)]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-10 h-64 w-64 rounded-full bg-[var(--app-warn)]/10 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          
          {/* Right Header: Greeting & Live Clock (كما في يمين الصورة المرفقة) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            
            <div className="flex items-center justify-between">
              {/* App / Rep Badge */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[var(--brand-primary)] to-[var(--brand-violet)] text-white shadow-lg shadow-blue-500/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-blue-300">منظومة مبيعات طنطاوي دريم</div>
                  <h1 className="text-lg font-black text-white sm:text-xl">
                    أهلاً بك يا {(currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'مستخدم'}
                  </h1>
                </div>
              </div>

              {/* Status / Sector Pill */}
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-black ${isOffline ? 'border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-amber-200' : 'border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-emerald-200'}`}>
                  {isOffline ? <WifiOff className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
                  <span>{isOffline ? 'أوفلاين' : 'متصل'}</span>
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-300">
              هل أنت مستعد لتحقيق تارجت اليوم والنمو بمبيعاتك؟
            </p>

            {/* Time & Date Display (Match Image: PM 06:14 • Fr Jan 23 2026) */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 shadow-inner backdrop-blur-sm sm:p-4">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">التوقيت والتاريخ</div>
                <div className="flex items-center gap-1.5 font-mono text-xl font-black tracking-tight text-white sm:text-2xl">
                  <Clock className="h-5 w-5 text-blue-300" />
                  <span>{timeString}</span>
                </div>
                <div className="text-[11px] font-bold text-slate-300">
                  {dateDayNameAr}، {dateDayNum} {dateMonthNameAr}
                </div>
              </div>

              <div className="border-r border-white/10 pr-3 text-left font-mono">
                <div className="text-3xl font-black leading-none text-[var(--app-warn)]">{dateDayNum}</div>
                <div className="mt-0.5 text-[10px] font-bold uppercase text-slate-400">{dateDayNameEn} • {dateMonthNameEn}</div>
                <div className="text-[10px] font-bold text-slate-500">{currentTime.getFullYear()}</div>
              </div>
            </div>

            {/* Rep Subtitle Info */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-blue-300" />
                <span className="font-bold text-slate-200">{currentUser?.branchName || 'الفرع الرئيسي'}</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-[var(--app-warn)]" />
                <span className="font-bold text-[var(--app-warn)]">
                  {currentUser?.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser?.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                </span>
              </div>
            </div>

          </div>

          {/* Center: 3D Isometric Visual Illustration (كما في وسط الصورة) */}
          <div className="hidden lg:flex lg:col-span-3 items-center justify-center p-2">
            <div className="relative group">
              <div className="flex h-48 w-48 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-4 text-center shadow-xl backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-center rounded-2xl bg-[var(--app-secondary-tint)] p-3 text-[var(--brand-secondary)]">
                  <BarChart3 className="h-10 w-10" />
                </div>
                <div className="text-sm font-black text-white">منصة مبيعات ذكية</div>
                <div className="mt-1 max-w-[150px] text-[10px] text-slate-300">
                  ربط مباشر مع المخازن، قاعدة العملاء، واعتمادات الفواتير
                </div>
                <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white">
                  <Sparkles className="h-3 w-3 text-[var(--app-warn)]" />
                  <span>دريم تكنولوجي</span>
                </div>
              </div>
            </div>
          </div>

          {/* Left Cards: إجمالي المبيعات وعدد الطلبات (مطابقة كاملة للصورة) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            
            {/* Metric 1: إجمالي المبيعات (Sales) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--app-ok-line)]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">إجمالي المبيعات</span>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]"><DollarSign className="h-4 w-4" /></span>
              </div>

              <div className="my-2 space-y-1">
                <div className="font-mono text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {metricPeriod === 'today' ? formatCurrency(todaySalesTotal) : formatCurrency(allSalesTotal)}
                </div>
                <div className="text-[10px] font-bold text-slate-400">جنيه مصري</div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex cursor-pointer items-center gap-1 font-bold text-[var(--brand-secondary)]"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الإجمالي'}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                <span className="font-bold text-emerald-300">
                  {todayInvoices.length} طلبات اليوم
                </span>
              </div>
            </div>

            {/* Metric 2: عدد الطلبات (Orders Count) */}
            <div className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--app-warn-line)]">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">عدد الطلبات</span>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]"><Receipt className="h-4 w-4" /></span>
              </div>

              <div className="my-2 space-y-1">
                <div className="font-mono text-3xl font-black tracking-tight text-[var(--app-warn)] sm:text-4xl">
                  {metricPeriod === 'today' ? todayInvoices.length : visibleInvoices.length}
                </div>
                <div className="text-[10px] font-bold text-slate-400">فاتورة مسجلة</div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex cursor-pointer items-center gap-1 font-bold text-[var(--app-warn)]"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الكل'}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
                <span className="font-bold text-slate-300">
                  {visibleCustomers.length} عميل
                </span>
              </div>
            </div>

            {/* Metric 3: التحصيلات */}
            <div className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--app-secondary-line)]">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">التحصيلات</span>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-secondary-line)] bg-[var(--app-secondary-tint)] text-[var(--brand-secondary)]"><Wallet className="h-4 w-4" /></span>
              </div>

              <div className="my-1 space-y-0.5">
                <div className="font-mono text-xl font-black tracking-tight text-[var(--brand-secondary)] sm:text-2xl">
                  {formatCurrency(metricPeriod === 'today' ? todayCollectionsTotal : allCollectionsTotal)}
                </div>
                <div className="text-[10px] font-bold text-slate-400">المحصل فعلياً</div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px] text-slate-400">
                <span>تحديث لحظي</span>
                <span className="font-bold text-emerald-300">مسجل</span>
              </div>
            </div>

            {/* Metric 4: زيارات اليوم */}
            <div className="group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-[var(--app-primary-line)]">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">الزيارات</span>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--app-primary-line)] bg-[var(--app-primary-tint)] text-[var(--brand-primary)]"><MapPin className="h-4 w-4" /></span>
              </div>

              <div className="my-1 space-y-0.5">
                <div className="font-mono text-2xl font-black tracking-tight text-[var(--brand-primary)] sm:text-3xl">
                  {todayVisits.length}
                </div>
                <div className="text-[10px] font-bold text-slate-400">زيارة اليوم</div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-[10px] text-slate-400">
                <span>الخطة الميدانية</span>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('visits')}
                  className="font-bold text-[var(--brand-primary)] hover:underline"
                >
                  فتح الزيارات
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>


      {/* ========================================================================= */}
      {/* 2. MAIN APPLICATION TILES (الكروت الكبيرة للاختصارات الرئيسية - تصميم كارتونة وجوميا) */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-[var(--text-primary)] sm:text-lg">
              <LayoutGrid className="h-5 w-5 text-[var(--app-warn-text)]" />
              <span>القائمة الرئيسية والاختصارات</span>
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              وصول سريع للعمليات اليومية بنفس ترتيب النظام الحالي
            </p>
          </div>

          <span className="rounded-full border border-[var(--app-line)] bg-[var(--bg-surface-alt)] px-3 py-1 text-xs font-bold text-[var(--text-muted)]">
            كل القائمة
          </span>
        </div>

        {/* Main action tiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">

          {/* Tile 1: المبيعات والفواتير */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <TrendingUp className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">المبيعات</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">
              الفواتير والاعتمادات ({visibleInvoices.length})
            </span>
          </button>

          {/* Tile 2: الكتالوج والتسوق */}
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <ShoppingCart className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">الكتالوج والتسوق</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">
              {visibleProductsList.length} صنف متاح للطلب
            </span>
          </button>

          {/* Tile 3: عروض الأسعار والخصومات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-risk-line)] bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <Flame className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">عروض الأسعار</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">تخفيضات وبونص الكراتين</span>
          </button>

          {/* Tile 4: العملاء */}
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-primary-line)] bg-[var(--app-primary-tint)] text-[var(--brand-primary)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <Users className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">العملاء</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">
              قاعدة العملاء ({visibleCustomers.length})
            </span>
          </button>

          {/* Tile 5: المنتجات والمخزون */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-secondary-line)] bg-[var(--app-secondary-tint)] text-[var(--brand-secondary)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <Package className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">أرصدة المخزون</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">الفرع والمخزن المركزي</span>
          </button>

          {/* Tile 6: خطة الزيارات الميدانية */}
          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-violet-line)] bg-[var(--app-violet-tint)] text-[var(--app-violet)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <CalendarCheck className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">الزيارات</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">خط سير المندوب اليومي</span>
          </button>

          {/* Tile 7: التحصيلات والماليات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <Wallet className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">التحصيلات</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">متابعة سداد المديونيات</span>
          </button>

          {/* Tile 8: المرتجعات الموحدة */}
          <button
            type="button"
            onClick={() => onNavigateToTab('returns')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className="mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--app-primary-line)] bg-[var(--app-primary-tint)] text-[var(--brand-primary)] transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16">
              <RotateCcw className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">المرتجعات</span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">تسجيل بضاعة ومتابعتها</span>
          </button>

          {/* Tile 9: التارجت أو الإكسل */}
          <button
            type="button"
            onClick={() => onNavigateToTab(isAdminOrDev ? 'excel' : 'targets')}
            className="group flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-4 text-center text-[var(--text-primary)] shadow-sm transition-all hover:-translate-y-1 hover:shadow-md active:scale-95 sm:min-h-[160px] sm:p-5"
          >
            <div className={`mb-2.5 flex h-14 w-14 items-center justify-center rounded-2xl border transition duration-200 group-hover:scale-110 sm:h-16 sm:w-16 ${isAdminOrDev ? 'border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]' : 'border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]'}`}>
              {isAdminOrDev ? (
                <FileSpreadsheet className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
              ) : (
                <Sparkles className="h-7 w-7 stroke-[2.25] sm:h-8 sm:w-8" />
              )}
            </div>
            <span className="text-sm font-black leading-tight sm:text-base">
              {isAdminOrDev ? 'الإكسل والمزامنة' : 'التارجت والمستهدف'}
            </span>
            <span className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">
              {isAdminOrDev ? 'تحديث الشيتات السحابية' : 'متابعة نسبة التحقيق'}
            </span>
          </button>

        </div>

      </div>


      {/* ========================================================================= */}
      {/* 3. BRANDING & MOBILE APK DOWNLOAD BAR */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-12">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-tr from-[#0F172A] via-[#13243F] to-[#172554] p-5 text-white shadow-[var(--sh-lg)] md:col-span-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-black tracking-wider text-[var(--app-warn)]">مندوب دريم • TANTAWY</span>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black shadow-xs ${isOffline ? 'border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-amber-200' : 'border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] text-emerald-200'}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${isOffline ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span>{isOffline ? 'OFFLINE' : 'ACTIVE'}</span>
            </span>
          </div>

          <div className="my-2 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-[var(--app-warn)] via-[var(--brand-primary)] to-[var(--brand-violet)] p-0.5 shadow-2xl">
              <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-950/90">
                <Smartphone className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-black text-white">تطبيق الجوال (APK)</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
                يمكنك تحميل ملف الـ APK وتثبيته مباشرة على أي هاتف أندرويد للمناديب بدون متجر
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--app-warn)] px-4 py-2.5 text-xs font-black text-slate-950 shadow-md transition hover:brightness-110 active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span>تحميل وتثبيت التطبيق</span>
            </button>

            <a
              href="/tantawy-sales.apk"
              download="tantawy-sales.apk"
              className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold text-slate-100 transition hover:bg-white/10"
              title="تحميل ملف APK مباشر"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>ملف APK</span>
            </a>
          </div>
        </div>

        {/* Right Card: Quick 5-Step Order Guide */}
        <div className="flex flex-col justify-between rounded-3xl border border-[var(--app-line)] bg-[var(--bg-surface)] p-5 shadow-sm md:col-span-7">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--app-line)] pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]">
                <Receipt className="h-4 w-4" />
              </span>
              <div>
                <h4 className="text-sm font-black text-[var(--text-primary)]">خطوات إنشاء الطلبية للمندوب</h4>
                <p className="text-[11px] text-[var(--text-muted)]">سير العمل المعتمد لإصدار فواتير دقيقة ومراجعة المخزون</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-center text-xs sm:grid-cols-5">
            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--bg-surface-alt)] p-2.5">
              <div className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-black text-white">1</div>
              <div className="text-[11px] font-black text-[var(--text-primary)]">فتح الكتالوج</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">تصفح الأصناف المتاحة</div>
            </div>

            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--bg-surface-alt)] p-2.5">
              <div className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-black text-white">2</div>
              <div className="text-[11px] font-black text-[var(--text-primary)]">إضافة للسلة</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">تحديد كراتين وقطع</div>
            </div>

            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--bg-surface-alt)] p-2.5">
              <div className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-black text-white">3</div>
              <div className="text-[11px] font-black text-[var(--text-primary)]">اختيار العميل</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">من قائمة عملائك</div>
            </div>

            <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--bg-surface-alt)] p-2.5">
              <div className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-black text-white">4</div>
              <div className="text-[11px] font-black text-[var(--text-primary)]">مراجعة الائتمان</div>
              <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">فحص المديونية والحد</div>
            </div>

            <div className="rounded-2xl border border-[var(--app-ok-line)] bg-[var(--app-ok-tint)] p-2.5">
              <div className="mx-auto mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-ok)] text-xs font-black text-white">5</div>
              <div className="text-[11px] font-black text-[var(--app-ok-text)]">إصدار واعتماد</div>
              <div className="mt-0.5 text-[10px] text-[var(--app-ok-text)]">تتحول للمشرف للمراجعة</div>
            </div>
          </div>
        </div>

      </div>


      {/* ========================================================================= */}
      {/* 4. FOOTER NOTE */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-700/80 bg-[#0F172A] px-4 py-3 text-xs text-slate-300 shadow-md">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--app-warn)]" />
          <span className="font-bold text-white">يوم عمل جميل وممتع وموفق بإذن الله</span>
          <span className="hidden text-slate-600 sm:inline">|</span>
          <span className="hidden text-slate-400 sm:inline">منظومة مبيعات ومخازن مجموعة الطنطاوي دريم</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="flex cursor-pointer items-center gap-1 font-bold text-[var(--brand-secondary)]"
          >
            <span>الكتالوج السريع</span>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};
