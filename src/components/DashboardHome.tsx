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
import { filterCustomersByRBAC } from '../services/customerAnalyticsService';
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
  const visibleCustomers = useMemo(
    () => filterCustomersByRBAC(customers, currentUser, users),
    [customers, currentUser, users]
  );

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
      {/* 1. TOP HERO SECTION (مستوحى بدقة من الصورة المرفقة مع أحدث تكنولوجيا تفاعلية) */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-slate-950 via-[#0d1d33] to-[#0a192e] rounded-3xl p-4 sm:p-6 text-white shadow-2xl border border-slate-800 relative overflow-hidden">
        
        {/* Ambient background night mode subtle lighting */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 left-10 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          
          {/* Right Header: Greeting & Live Clock (كما في يمين الصورة المرفقة) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            
            <div className="flex items-center justify-between">
              {/* App / Rep Badge */}
              <div className="flex items-center gap-2.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black shadow-lg shadow-blue-500/20">
                  <span className="text-xl">🌟</span>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-blue-400 tracking-wider">منظومة مبيعات طنطاوي دريم</div>
                  <h1 className="text-lg sm:text-xl font-black text-white">
                    أهلاً بك يا {(currentUser?.name || '').replace(/\s*\([^)]*\)/g, '').trim() || 'أسامة'} ...
                  </h1>
                </div>
              </div>

              {/* Status / Sector Pill */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span>{isOffline ? 'أوفلاين' : 'متصل'}</span>
                </span>
              </div>
            </div>

            <p className="text-xs sm:text-sm font-bold text-slate-300">
              هل أنت مستعد لتحقيق تارجت اليوم والنمو بمبيعاتك ؟ 🚀
            </p>

            {/* Time & Date Display (Match Image: PM 06:14 • Fr Jan 23 2026) */}
            <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-inner">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">التوقيت والتاريخ</div>
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white flex items-center gap-1.5">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span>{timeString}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-bold">
                  {dateDayNameAr}، {dateDayNum} {dateMonthNameAr}
                </div>
              </div>

              <div className="text-left font-mono border-r border-slate-800 pr-3">
                <div className="text-3xl font-black text-[#d97706] leading-none">{dateDayNum}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">{dateDayNameEn} • {dateMonthNameEn}</div>
                <div className="text-[10px] font-bold text-slate-500">{currentTime.getFullYear()}</div>
              </div>
            </div>

            {/* Rep Subtitle Info */}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-300 font-bold">{currentUser?.branchName || 'الفرع الرئيسي'}</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-[#d97706]" />
                <span className="text-[#d97706] font-bold">
                  {currentUser?.sector === 'electrical' ? 'القطاع الكهربائي' : currentUser?.sector === 'both' ? 'منزلي + كهرباء' : 'القطاع المنزلي'}
                </span>
              </div>
            </div>

          </div>

          {/* Center: 3D Isometric Visual Illustration (كما في وسط الصورة) */}
          <div className="hidden lg:flex lg:col-span-3 items-center justify-center p-2">
            <div className="relative group">
              <div className="w-48 h-48 rounded-3xl bg-gradient-to-tr from-[var(--app-ok)] via-slate-800 to-[var(--app-navy)] p-4 border border-[var(--app-ok)] flex flex-col items-center justify-center text-center shadow-xl backdrop-blur-sm">
                <div className="text-5xl mb-2 animate-bounce">📊</div>
                <div className="text-sm font-black text-[#0d9488]">منصة مبيعات ذكية</div>
                <div className="text-[10px] text-slate-400 mt-1 max-w-[150px]">
                  ربط مباشر مع المخازن، قاعدة العملاء، واعتمادات الفواتير
                </div>
                <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--app-ok)] text-[#0d9488] border border-[var(--app-ok)]">
                  <Sparkles className="w-3 h-3 text-[#0d9488]" />
                  <span>دريم تكنولوجي</span>
                </div>
              </div>
            </div>
          </div>

          {/* Left Cards: إجمالي المبيعات وعدد الطلبات (مطابقة كاملة للصورة) */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            
            {/* Metric 1: إجمالي المبيعات (Sales) */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-[var(--app-ok)] transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300">إجمالي المبيعات</span>
                <span className="text-xl">💰</span>
              </div>

              <div className="space-y-1 my-2">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white">
                  {metricPeriod === 'today' ? formatCurrency(todaySalesTotal) : formatCurrency(allSalesTotal)}
                </div>
                <div className="text-[10px] text-slate-400 font-bold">جنيه مصري</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex items-center gap-1 text-[#0d9488] hover:text-[#0d9488] font-bold cursor-pointer"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الإجمالي'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-[#0d9488] font-bold">
                  {todayInvoices.length} طلبات اليوم
                </span>
              </div>
            </div>

            {/* Metric 2: عدد الطلبات (Orders Count) */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-[var(--app-warn)] transition">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-300">عدد الطلبات</span>
                <span className="text-xl">📦</span>
              </div>

              <div className="space-y-1 my-2">
                <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-[#d97706]">
                  {metricPeriod === 'today' ? todayInvoices.length : visibleInvoices.length}
                </div>
                <div className="text-[10px] text-slate-400 font-bold">فاتورة مسجلة</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMetricPeriod(metricPeriod === 'today' ? 'all' : 'today')}
                  className="flex items-center gap-1 text-[#d97706] hover:text-[#d97706] font-bold cursor-pointer"
                >
                  <span>{metricPeriod === 'today' ? 'اليوم' : 'الكل'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                <span className="text-slate-400 font-bold">
                  {visibleCustomers.length} عميل
                </span>
              </div>
            </div>

            {/* Metric 3: التحصيلات */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-[var(--app-ok)] transition">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-300">التحصيلات</span>
                <span className="text-xl">💵</span>
              </div>

              <div className="space-y-0.5 my-1">
                <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-[#0d9488]">
                  {formatCurrency(metricPeriod === 'today' ? todayCollectionsTotal : allCollectionsTotal)}
                </div>
                <div className="text-[10px] text-slate-400 font-bold">المحصل فعلياً</div>
              </div>

              <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                <span>تحديث لحظي</span>
                <span className="text-[#0d9488] font-bold">✓ نقدي ومسجل</span>
              </div>
            </div>

            {/* Metric 4: زيارات اليوم */}
            <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-[var(--app-navy)] transition">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-300">الزيارات</span>
                <span className="text-xl">📍</span>
              </div>

              <div className="space-y-0.5 my-1">
                <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[#0d9488]">
                  {todayVisits.length}
                </div>
                <div className="text-[10px] text-slate-400 font-bold">زيارة اليوم</div>
              </div>

              <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                <span>الخطة الميدانية</span>
                <button
                  type="button"
                  onClick={() => onNavigateToTab('visits')}
                  className="text-[#0d9488] font-bold hover:underline"
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
            <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[var(--app-warn-text)]" />
              <span>القائمة الرئيسية والاختصارات</span>
            </h2>
            <p className="text-xs text-slate-500">
              واجهة سهلة وسريعة مستوحاة من تطبيقات التسوق (كارتونة وجوميا) لإتمام العمليات بضغطة واحدة
            </p>
          </div>
          
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            كل القائمة
          </span>
        </div>

        {/* The 10 Big Action Cards Grid (مطابقة دقيقة لتوزيع الكروت بالصورة) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          
          {/* Tile 1: فاتورة جديدة (الأخضر البارز في الصورة) */}
          <button
            type="button"
            onClick={handleStartOrder}
            className="group relative bg-gradient-to-br from-[var(--app-ok)] via-[var(--app-ok)] to-[var(--app-ok)] text-white rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-[var(--app-ok)] min-h-[140px] sm:min-h-[160px]"
          >
            <div className="absolute top-2.5 right-2.5 bg-white/20 backdrop-blur-xs text-[10px] font-black px-2 py-0.5 rounded-full">
              الأهم ⭐
            </div>
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white text-[var(--app-ok-text)] flex items-center justify-center shadow-md mb-2.5 group-hover:scale-110 transition duration-200">
              <Receipt className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">فاتورة جديدة</span>
            <span className="text-[10px] text-[#0d9488] font-bold mt-1">إنشاء طلب بيع جديد</span>
          </button>

          {/* Tile 2: المبيعات والفواتير */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-warn-line)]">
              <TrendingUp className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">المبيعات</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">
              الفواتير والاعتمادات ({visibleInvoices.length})
            </span>
          </button>

          {/* Tile 3: الكتالوج والتسوق */}
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-ok-line)]">
              <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">الكتالوج والتسوق</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">
              {visibleProductsList.length} صنف متاح للطلب
            </span>
          </button>

          {/* Tile 4: عروض الأسعار والخصومات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-risk-line)]">
              <Flame className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">عروض الأسعار</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">تخفيضات وبونص الكراتين</span>
          </button>

          {/* Tile 5: العملاء */}
          <button
            type="button"
            onClick={() => onNavigateToTab('all_customers')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-navy-line)]">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">العملاء</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">
              قاعدة العملاء ({visibleCustomers.length})
            </span>
          </button>

          {/* Tile 6: المنتجات والمخزون */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-ok-line)]">
              <Package className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">أرصدة المخزون</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">الفرع والمخزن المركزي</span>
          </button>

          {/* Tile 7: خطة الزيارات الميدانية */}
          <button
            type="button"
            onClick={() => onNavigateToTab('visits')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-navy-line)]">
              <CalendarCheck className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">الزيارات</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">خط سير المندوب اليومي</span>
          </button>

          {/* Tile 8: التحصيلات والماليات */}
          <button
            type="button"
            onClick={() => onNavigateToTab('invoices')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-ok-line)]">
              <Wallet className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">التحصيلات</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">متابعة سداد المديونيات</span>
          </button>

          {/* Tile 9: المرتجعات الموحدة */}
          <button
            type="button"
            onClick={() => onNavigateToTab('returns')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--app-navy-tint)] text-[var(--app-navy-text)] flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-[var(--app-navy-line)]">
              <RotateCcw className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" />
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">المرتجعات</span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">تسجيل بضاعة ومتابعتها</span>
          </button>

          {/* Tile 10: التارجت أو الإكسل */}
          <button
            type="button"
            onClick={() => onNavigateToTab(isAdminOrDev ? 'excel' : 'targets')}
            className="group bg-white hover:bg-slate-50 text-slate-900 rounded-3xl p-4 sm:p-5 flex flex-col items-center justify-center text-center shadow-sm hover:shadow-md hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border border-slate-200 min-h-[140px] sm:min-h-[160px]"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shadow-xs mb-2.5 group-hover:scale-110 transition duration-200 border border-slate-300/50">
              {isAdminOrDev ? (
                <FileSpreadsheet className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5] text-[var(--app-ok-text)]" />
              ) : (
                <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5] text-[var(--app-warn-text)]" />
              )}
            </div>
            <span className="font-black text-sm sm:text-base leading-tight">
              {isAdminOrDev ? 'الإكسل والمزامنة' : 'التارجت والمستهدف'}
            </span>
            <span className="text-[10px] text-slate-500 font-bold mt-1">
              {isAdminOrDev ? 'تحديث الشيتات السحابية' : 'متابعة نسبة التحقيق'}
            </span>
          </button>

        </div>

      </div>


      {/* ========================================================================= */}
      {/* 3. BRANDING & MOBILE APK DOWNLOAD BAR (كارت البراند الفخم كما بالصورة) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
        
        {/* Left Card: 3D Emblem Card matching the GEONEX / Brand Card in Image */}
        <div className="md:col-span-5 bg-gradient-to-tr from-slate-950 via-[#0e172a] to-[#1e1b4b] rounded-3xl p-5 border border-slate-800 shadow-xl flex flex-col justify-between text-white relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black text-[#d97706] tracking-wider">مندوب دريم • TANTAWY</span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-[var(--app-ok)] text-[#0d9488] border border-[var(--app-ok)]">
              <span className="w-2 h-2 rounded-full bg-[var(--app-ok)] animate-ping" />
              <span>الحالة : ACTIVE</span>
            </span>
          </div>

          <div className="flex items-center gap-4 my-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[var(--app-warn)] via-[var(--app-risk)] to-[var(--app-navy)] p-0.5 shadow-2xl shrink-0 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-2xl flex items-center justify-center text-2xl">
                📱
              </div>
            </div>
            <div>
              <h3 className="font-black text-lg text-white">تطبيق الجوال (APK)</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                يمكنك تحميل ملف الـ APK وتثبيته مباشرة على أي هاتف أندرويد للمناديب بدون متجر
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 mt-2">
            <button
              type="button"
              onClick={() => setIsInstallModalOpen(true)}
              className="flex-1 bg-gradient-to-r from-[var(--app-warn)] to-[var(--app-warn)] hover:from-[var(--app-warn)] hover:to-[var(--app-warn)] text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs transition cursor-pointer shadow-md flex items-center justify-center gap-2 active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>تحميل وتثبيت التطبيق 📲</span>
            </button>
            
            <a
              href="/tantawy-sales.apk"
              download="tantawy-sales.apk"
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 px-3 rounded-xl text-xs transition border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
              title="تحميل ملف APK مباشر إذا قمت بوضعه في مجلد public"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>ملف APK</span>
            </a>
          </div>
        </div>

        {/* Right Card: Quick 5-Step Order Guide (خطوات إنشاء الطلب المنضبطة للمندوب) */}
        <div className="md:col-span-7 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-[var(--app-warn)] text-[var(--app-warn-text)] flex items-center justify-center font-black">
                📋
              </span>
              <div>
                <h4 className="font-black text-slate-900 text-sm">خطوات إنشاء الطلبية للمندوب</h4>
                <p className="text-[11px] text-slate-500">سير العمل المعتمد لإصدار فواتير دقيقة ومراجعة المخزون</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleStartOrder}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-black px-3.5 py-1.5 rounded-xl cursor-pointer shadow-xs transition"
            >
              ابدأ الآن ⚡
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200/60">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">1</div>
              <div className="font-black text-slate-800 text-[11px]">فتح الكتالوج</div>
              <div className="text-[10px] text-slate-500 mt-0.5">تصفح الأصناف المتاحة</div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200/60">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">2</div>
              <div className="font-black text-slate-800 text-[11px]">إضافة للسلة</div>
              <div className="text-[10px] text-slate-500 mt-0.5">تحديد كراتين وقطع</div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200/60">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">3</div>
              <div className="font-black text-slate-800 text-[11px]">اختيار العميل</div>
              <div className="text-[10px] text-slate-500 mt-0.5">من قائمة عملائك</div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200/60">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">4</div>
              <div className="font-black text-slate-800 text-[11px]">مراجعة الائتمان</div>
              <div className="text-[10px] text-slate-500 mt-0.5">فحص المديونية والحد</div>
            </div>

            <div className="bg-[var(--app-ok-tint)] rounded-2xl p-2.5 border border-[var(--app-ok-line)]">
              <div className="w-6 h-6 rounded-full bg-[var(--app-ok)] text-white font-black text-xs mx-auto flex items-center justify-center mb-1.5">5</div>
              <div className="font-black text-[var(--app-ok-text)] text-[11px]">إصدار واعتماد</div>
              <div className="text-[10px] text-[var(--app-ok-text)] mt-0.5">تتحول للمشرف للمراجعة</div>
            </div>
          </div>
        </div>

      </div>


      {/* ========================================================================= */}
      {/* 4. FOOTER NOTE (كما في أسفل الصورة: يوم عمل جميل وممتع) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950 text-slate-300 rounded-2xl px-4 py-3 flex items-center justify-between text-xs border border-slate-800 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-[#d97706] text-sm">✨</span>
          <span className="font-bold text-white">يوم عمل جميل وممتع وموفق بإذن الله</span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-slate-400 hidden sm:inline">منظومة مبيعات ومخازن مجموعة الطنطاوي دريم</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateToTab('catalog')}
            className="text-[#0d9488] hover:text-[#0d9488] font-bold flex items-center gap-1 cursor-pointer"
          >
            <span>الكتالوج السريع</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
};

export default DashboardHome;
