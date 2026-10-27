import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  CloudUpload,
  Download,
  LayoutDashboard,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  buildCustomerGrowthMap,
  buildCustomerInsights,
  buildFollowUpAlerts,
  buildPeriodComparison,
  resolveLatestSalesMonth
} from '../services/customerItemSalesInsights';
import {
  buildGroupInsights,
  buildIdleItems,
  buildItemRanking,
  buildMonthlyCustomerAnalysis,
  buildMonthlyPerformance,
  buildPeriodTotals,
  buildRepPerformance,
  growthPct
} from '../services/itemSalesAnalytics';
import {
  aggregateCustomerItemSales,
  clearCustomerItemSales,
  enrichCustomerItemSalesWithDirectory,
  exportCustomerItemSalesToExcel,
  fetchCustomerItemSalesFromSupabase,
  filterCustomerItemSalesByRBAC,
  getSavedCustomerItemSales,
  getSupabaseCustomerItemSalesCount,
  MONTH_NAMES_MAP,
  pushCustomerItemSalesToSupabase,
  saveCustomerItemSales
} from '../services/customerItemSalesService';
import { Customer, CustomerItemSaleRecord, CustomerItemSalesSummary } from '../types';
import { CustomerDossiers } from './customerSales/CustomerDossiers';
import { CategoryMixCard } from './itemSales/CategoryMixCard';
import {
  MonthlyCustomerAnalysisTable,
  TopCustomersTable
} from './itemSales/CustomerBreakdownCards';
import { CustomerSnapshotCard } from './itemSales/CustomerSnapshotCard';
import { ItemRankingCard } from './itemSales/ItemRankingCard';
import { ItemSalesKpiCards } from './itemSales/ItemSalesKpiCards';
import { MonthlyPerformanceCard } from './itemSales/MonthlyPerformanceCard';
import { RepPerformanceCard } from './itemSales/RepPerformanceCard';
import { SlowMoversCard } from './itemSales/SlowMoversCard';

interface CustomerItemSalesViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer, prefilledItemCode?: string) => void;
  onNavigateToExcel?: () => void;
}

type SalesViewMode = 'overview' | 'customers';

export const CustomerItemSalesView: React.FC<CustomerItemSalesViewProps> = ({
  onOpenNewOrderForCustomer,
  onNavigateToExcel
}) => {
  const { currentUser, users, customers, products } = useApp();
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const [salesRecords, setSalesRecords] = useState<CustomerItemSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseCount, setSupabaseCount] = useState<number | null>(null);
  const [lastSyncAt] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const [showAllSalesOverride, setShowAllSalesOverride] = useState(false);
  const [isSupabasePushing, setIsSupabasePushing] = useState(false);
  const [supabasePushProgress, setSupabasePushProgress] = useState<{ synced: number; total: number } | null>(null);
  const [isSupabaseFetching, setIsSupabaseFetching] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(5);

  const [activeView, setActiveView] = useState<SalesViewMode>('overview');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string | null>(null);
  const [expandedCustomerAccounts, setExpandedCustomerAccounts] = useState<Set<string>>(new Set());

  const initialExpandDone = useRef(false);

  const loadSalesData = async () => {
    setIsLoading(true);
    try {
      const saved = await getSavedCustomerItemSales();
      // Strictly purge any legacy demo-generated records
      let realSaved = saved.filter((record) => !String(record.id || '').startsWith('cis-demo-'));
      if (realSaved.length !== saved.length) {
        await saveCustomerItemSales(realSaved);
      }

      // Check remote Supabase record count
      const remoteCount = await getSupabaseCustomerItemSalesCount();
      if (remoteCount >= 0) {
        setSupabaseCount(remoteCount);
      }

      // If local cache is empty, but Supabase already contains records, auto-fetch from Supabase
      if (realSaved.length === 0 && remoteCount > 0) {
        const fetchRes = await fetchCustomerItemSalesFromSupabase();
        if (fetchRes.sales && fetchRes.sales.length > 0) {
          realSaved = fetchRes.sales;
        }
      }

      setSalesRecords(realSaved);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSalesData();

    // Auto-refresh when an Excel file is uploaded from the Excel tab or background
    const handleUpdate = () => {
      loadSalesData();
    };
    window.addEventListener('tantawy-customer-item-sales-updated', handleUpdate);
    return () => window.removeEventListener('tantawy-customer-item-sales-updated', handleUpdate);
  }, []);

  const handlePushToSupabase = async () => {
    if (salesRecords.length === 0) {
      setSyncErrorMsg('لا توجد سجلات مبيعات لرفعها إلى Supabase');
      return;
    }
    setIsSupabasePushing(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      const res = await pushCustomerItemSalesToSupabase(salesRecords, (synced, total) => {
        setSupabasePushProgress({ synced, total });
      });
      if (res.success) {
        setSupabaseCount(res.syncedCount);
        setSyncSuccessMsg(`تم بنجاح رفع ومزامنة ${res.syncedCount.toLocaleString('ar-EG')} حركة إلى جدول customer_item_sales في Supabase! أصبحت البيانات متطابقة سحابياً.`);
      } else {
        setSyncErrorMsg(res.error || 'فشلت المزامنة مع Supabase');
      }
    } finally {
      setIsSupabasePushing(false);
      setSupabasePushProgress(null);
    }
  };

  const handleFetchFromSupabase = async () => {
    setIsSupabaseFetching(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);
    try {
      const res = await fetchCustomerItemSalesFromSupabase();
      if (res.error) {
        setSyncErrorMsg(res.error);
      } else {
        setSalesRecords(res.sales);
        setSupabaseCount(res.sales.length);
        setSyncSuccessMsg(`تم بنجاح جلب ${res.sales.length.toLocaleString('ar-EG')} حركة من جدول customer_item_sales في Supabase!`);
      }
    } finally {
      setIsSupabaseFetching(false);
    }
  };

  const handleClearSales = () => {
    if (window.confirm('هل أنت متأكد من رغبتك في مسح كافة سجلات مبيعات الأصناف نهائياً؟')) {
      clearCustomerItemSales();
      setSalesRecords([]);
      setSyncSuccessMsg('تم مسح وتصفير كافة سجلات مبيعات الأصناف بنجاح. يتم تحديث البيانات من صفحة الإكسل.');
      setSyncErrorMsg(null);
    }
  };

  // Automatically link customer codes with master Customer directory to extract authoritative branch and rep
  const enrichedSalesRecords = useMemo(() => {
    if (customers.length === 0 || salesRecords.length === 0) return salesRecords;
    return enrichCustomerItemSalesWithDirectory(salesRecords, customers).enriched;
  }, [salesRecords, customers]);

  const customerLinkStats = useMemo(() => {
    if (customers.length === 0 || salesRecords.length === 0) {
      return { linkedRecords: 0, linkedCustomers: 0, totalSales: salesRecords.length };
    }
    const res = enrichCustomerItemSalesWithDirectory(salesRecords, customers);
    return {
      linkedRecords: res.matchedRecordsCount,
      linkedCustomers: res.distinctCustomersMatched,
      totalSales: salesRecords.length
    };
  }, [salesRecords, customers]);

  const handleEnrichAndPersistSales = async () => {
    if (salesRecords.length === 0) return;
    const res = enrichCustomerItemSalesWithDirectory(salesRecords, customers, { forceOverwrite: true });
    await saveCustomerItemSales(res.enriched);
    setSalesRecords(res.enriched);
    setSyncSuccessMsg(
      `تم بنجاح مطابقة كود العميل بقاعدة العملاء لـ (${res.distinctCustomersMatched.toLocaleString('ar-EG')} عميل) وتثبيت فروعهم ومناديبهم في (${res.matchedRecordsCount.toLocaleString('ar-EG')} حركة مبيعات)!`
    );
    setSyncErrorMsg(null);
  };

  const rbacSales = useMemo(() => {
    if (showAllSalesOverride) return enrichedSalesRecords;
    return filterCustomerItemSalesByRBAC(enrichedSalesRecords, currentUser, users, customers);
  }, [enrichedSalesRecords, currentUser, users, customers, showAllSalesOverride]);

  const distinctGroups = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((record) => {
      if (record.itemGroup && record.itemGroup !== 'عام') set.add(record.itemGroup);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  const distinctReps = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((record) => {
      if (record.repName) set.add(record.repName);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  const distinctWarehouses = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((record) => {
      if (record.warehouse) set.add(record.warehouse);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  /** كل الفلاتر ما عدا الشهر — أساس حساب المقارنة الشهرية. */
  const baseSales = useMemo(() => {
    return rbacSales.filter((record) => {
      if (selectedGroup !== 'all' && record.itemGroup !== selectedGroup) return false;
      if (selectedRep !== 'all' && record.repName !== selectedRep) return false;
      if (selectedWarehouse !== 'all' && record.warehouse !== selectedWarehouse) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matches =
          record.invoicingName?.toLowerCase().includes(query) ||
          record.customerAccount?.toLowerCase().includes(query) ||
          record.itemName?.toLowerCase().includes(query) ||
          record.itemCode?.toLowerCase().includes(query) ||
          record.salesOrder?.toLowerCase().includes(query) ||
          record.repName?.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [rbacSales, selectedGroup, selectedRep, selectedWarehouse, searchTerm]);

  const filteredSales = useMemo(
    () =>
      selectedMonth === 'all'
        ? baseSales
        : baseSales.filter((record) => Number(record.month) === selectedMonth),
    [baseSales, selectedMonth]
  );

  const customerSummaries = useMemo(
    () => aggregateCustomerItemSales(filteredSales, customers),
    [filteredSales, customers]
  );

  const latestMonth = useMemo(() => resolveLatestSalesMonth(baseSales), [baseSales]);
  const growthMonth = selectedMonth === 'all' ? latestMonth : selectedMonth;
  const previousMonth = growthMonth && growthMonth > 1 ? growthMonth - 1 : null;

  const previousMonthSales = useMemo(
    () =>
      previousMonth
        ? baseSales.filter((record) => Number(record.month) === previousMonth)
        : [],
    [baseSales, previousMonth]
  );

  const comparison = useMemo(
    () => buildPeriodComparison(filteredSales, baseSales, selectedMonth, latestMonth),
    [filteredSales, baseSales, selectedMonth, latestMonth]
  );

  /* ---------------- لوحة تحليل الأصناف (Item-centric) ---------------- */
  const periodTotals = useMemo(() => buildPeriodTotals(filteredSales), [filteredSales]);
  const previousPeriodTotals = useMemo(
    () => buildPeriodTotals(previousMonthSales),
    [previousMonthSales]
  );

  const groupMix = useMemo(() => buildGroupInsights(filteredSales), [filteredSales]);

  const topItemsByValue = useMemo(
    () => buildItemRanking(filteredSales, previousMonthSales, { metric: 'amount', limit: 10 }),
    [filteredSales, previousMonthSales]
  );

  const topItemsByQuantity = useMemo(
    () => buildItemRanking(filteredSales, previousMonthSales, { metric: 'quantity', limit: 10 }),
    [filteredSales, previousMonthSales]
  );

  const slowMovers = useMemo(
    () =>
      buildItemRanking(filteredSales, previousMonthSales, {
        metric: 'amount',
        limit: 6,
        order: 'asc'
      }),
    [filteredSales, previousMonthSales]
  );

  const monthlyPerformance = useMemo(() => buildMonthlyPerformance(baseSales, 6), [baseSales]);

  const monthlyPerformanceGrowth = useMemo(() => {
    if (monthlyPerformance.length < 2) return null;
    const last = monthlyPerformance[monthlyPerformance.length - 1];
    const before = monthlyPerformance[monthlyPerformance.length - 2];
    return growthPct(last.amount, before.amount);
  }, [monthlyPerformance]);

  const monthlyCustomerRows = useMemo(() => buildMonthlyCustomerAnalysis(baseSales), [baseSales]);

  const repPerformance = useMemo(() => buildRepPerformance(filteredSales, 6), [filteredSales]);

  const idleItems = useMemo(
    () => buildIdleItems(filteredSales, baseSales, products || [], 6),
    [filteredSales, baseSales, products]
  );

  const idleCaption = useMemo(() => {
    if (idleItems.source === 'catalog') {
      return `من ${idleItems.catalogWithStock.toLocaleString('en-US')} صنف برصيد في الكتالوج`;
    }
    if (idleItems.source === 'sales-history') return 'بدون حركة في الفترة المحددة';
    return 'الكتالوج غير محمّل';
  }, [idleItems]);

  /**
   * عند اختيار «كل الشهور» مفيش فترة سابقة مكافئة للسنة، فبنقارن آخر شهر
   * متاح بالشهر اللي قبله — نفس منطق buildPeriodComparison للمبيعات.
   */
  const beforeLatestMonthSales = useMemo(
    () =>
      latestMonth && latestMonth > 1
        ? baseSales.filter((record) => Number(record.month) === latestMonth - 1)
        : [],
    [baseSales, latestMonth]
  );

  const kpiPreviousQuantity = useMemo(() => {
    if (selectedMonth === 'all') {
      return latestMonth ? buildPeriodTotals(beforeLatestMonthSales).quantity : 0;
    }
    return previousPeriodTotals.quantity;
  }, [selectedMonth, latestMonth, beforeLatestMonthSales, previousPeriodTotals]);

  const kpiPreviousItemsCount = useMemo(() => {
    if (selectedMonth === 'all') {
      return latestMonth ? buildPeriodTotals(beforeLatestMonthSales).itemsCount : 0;
    }
    return previousPeriodTotals.itemsCount;
  }, [selectedMonth, latestMonth, beforeLatestMonthSales, previousPeriodTotals]);

  const kpiGrowthCaption =
    comparison.growthPct !== null ? 'مقارنة بالفترة السابقة' : 'نمو آخر شهر متاح';

  const customerInsights = useMemo(() => {
    const growthMap = buildCustomerGrowthMap(baseSales, growthMonth);
    return buildCustomerInsights(customerSummaries, filteredSales, growthMap, comparison.currentAmount)
      .sort((a, b) => b.amount - a.amount);
  }, [customerSummaries, filteredSales, baseSales, growthMonth, comparison.currentAmount]);

  /** توزيع كل عميل على شهور السنة كاملة — مستقل عن فلتر الشهر عشان الشبكة تفضل قابلة للتنقل. */
  const yearlySummaries = useMemo(() => {
    const grouped = aggregateCustomerItemSales(baseSales);
    return new Map(
      grouped.map((summary) => [summary.customerAccount || summary.customerName, summary])
    );
  }, [baseSales]);

  const alerts = useMemo(() => buildFollowUpAlerts(customerInsights), [customerInsights]);

  const selectedCustomer = useMemo(
    () =>
      customerInsights.find((customer) => customer.customerAccount === selectedCustomerAccount) ||
      customerInsights[0] ||
      null,
    [customerInsights, selectedCustomerAccount]
  );

  useEffect(() => {
    if (customerInsights.length === 0) {
      if (selectedCustomerAccount !== null) setSelectedCustomerAccount(null);
      return;
    }
    const exists = customerInsights.some(
      (customer) => customer.customerAccount === selectedCustomerAccount
    );
    if (!exists) setSelectedCustomerAccount(customerInsights[0].customerAccount);
  }, [customerInsights, selectedCustomerAccount]);

  useEffect(() => {
    const initial = new Set<string>();
    customerSummaries.slice(0, 2).forEach((summary) => initial.add(summary.customerAccount));
    setExpandedCustomerAccounts(initial);
    // إعادة الضبط فقط عند تغيير فلاتر النطاق — وليس مع كل كتابة في البحث أو تغيير الشهر.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup, selectedRep, selectedWarehouse]);

  useEffect(() => {
    if (initialExpandDone.current || customerSummaries.length === 0) return;
    initialExpandDone.current = true;
    setExpandedCustomerAccounts(
      new Set(customerSummaries.slice(0, 2).map((summary) => summary.customerAccount))
    );
  }, [customerSummaries]);

  const toggleCustomerExpand = (account: string) => {
    setExpandedCustomerAccounts((previous) => {
      const next = new Set(previous);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedCustomerAccounts(new Set(customerSummaries.map((summary) => summary.customerAccount)));
  };

  const handleCollapseAll = () => setExpandedCustomerAccounts(new Set());

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedMonth('all');
    setSelectedGroup('all');
    setSelectedRep('all');
    setSelectedWarehouse('all');
  };

  const handleExportExcel = () => {
    exportCustomerItemSalesToExcel(
      filteredSales,
      customerSummaries,
      `تحليل_مبيعات_الأصناف_${currentUser?.name || 'الطنطاوي'}`
    );
  };

  const handleStartOrderForCustomer = (account: string, itemCode?: string) => {
    const matched = customers.find(
      (customer) => customer.code === account || customer.name === account
    );
    if (matched && onOpenNewOrderForCustomer) onOpenNewOrderForCustomer(matched, itemCode);
  };

  const openCustomerDetails = (account: string) => {
    setSelectedCustomerAccount(account);
    setActiveView('customers');
    setExpandedCustomerAccounts((previous) => new Set(previous).add(account));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-10 flex flex-col items-center justify-center gap-3 min-h-[360px]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-xs font-bold text-slate-500">جاري تحميل سجلات مبيعات الأصناف...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20" dir="rtl">
      {/* Page header */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-[0_4px_18px_rgba(15,43,56,0.05)] p-5 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[11px] font-black">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              لوحة تحليل مبيعات الأصناف الحقيقية
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#c99a43]" />
              تحليل مبيعات الأصناف
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 max-w-3xl leading-relaxed">
              لوحة تحليل صنفية شاملة: المبيعات والكميات، توزيع الفئات، أعلى وأقل الأصناف حركة، أداء المناديب،
              وتحليل شهري للعملاء — كل الأرقام محسوبة من حركات البيع الفعلية وبنفس نطاق صلاحيات المستخدم.
            </p>

            <div className="pt-1 flex items-center gap-2 flex-wrap text-[10px]">
              {salesRecords.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 rounded-lg text-amber-800 font-bold border border-amber-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                  {salesRecords.length.toLocaleString('ar-EG')} حركة بيع معتمدة
                </span>
              )}
              {supabaseCount !== null && supabaseCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 rounded-lg text-sky-800 font-bold border border-sky-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                  مزامنة Supabase: {supabaseCount.toLocaleString('ar-EG')} حركة سحابياً
                </span>
              )}
              {supabaseCount === 0 && salesRecords.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 rounded-lg text-rose-800 font-bold border border-rose-200 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  قاعدة Supabase فارغة (0) — يلزم المزامنة السحابية
                </span>
              )}
              {lastSyncAt && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg text-emerald-700 font-bold border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  آخر تحديث: {lastSyncAt}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={loadSalesData}
              title="تحديث البيانات من الذاكرة وقاعدة البيانات"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            {salesRecords.length > 0 && customers.length > 0 && (
              <button
                type="button"
                onClick={handleEnrichAndPersistSales}
                title="مطابقة كود العميل بقاعدة العملاء المركزية وتحديد الفرع والمندوب لكل حركة"
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 font-black text-[11px] shadow-2xs transition cursor-pointer"
              >
                <Link2 className="w-4 h-4 text-teal-700" />
                <span>ربط الفروع والمناديب</span>
              </button>
            )}

            {salesRecords.length > 0 && (
              <button
                type="button"
                onClick={handlePushToSupabase}
                disabled={isSupabasePushing}
                title="مزامنة حركات الأصناف مع جدول customer_item_sales في Supabase"
                className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 font-black text-[11px] shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <CloudUpload className={`w-4 h-4 text-sky-600 ${isSupabasePushing ? 'animate-bounce' : ''}`} />
                <span>
                  {isSupabasePushing
                    ? `جاري المزامنة (${supabasePushProgress ? `${supabasePushProgress.synced}/${supabasePushProgress.total}` : '...'})`
                    : 'مزامنة Supabase'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleFetchFromSupabase}
              disabled={isSupabaseFetching}
              title="جلب وتحديث الحركات من جدول customer_item_sales في Supabase"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
            >
              <CloudDownload className={`w-3.5 h-3.5 text-sky-600 ${isSupabaseFetching ? 'animate-bounce' : ''}`} />
              <span>{isSupabaseFetching ? 'جاري الجلب...' : 'جلب من Supabase'}</span>
            </button>

            {salesRecords.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                تصدير Excel
              </button>
            )}

            {salesRecords.length > 0 && (
              <button
                type="button"
                onClick={handleClearSales}
                title="تصفير ومسح مبيعات الأصناف"
                className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-[11px] transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span className="hidden sm:inline">مسح الداتا</span>
              </button>
            )}
          </div>
        </div>

        {/* Directory linking info banner */}
        {salesRecords.length > 0 && customerLinkStats.linkedCustomers > 0 && (
          <div className="mt-4 bg-gradient-to-l from-emerald-50 via-teal-50 to-sky-50 border border-teal-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Link2 className="w-4 h-4" />
              </div>
              <div>
                <div className="font-black text-slate-900 flex items-center gap-2">
                  <span>ربط كود العميل بقاعدة العملاء المركزية</span>
                  <span className="bg-emerald-100 text-emerald-900 text-[10px] px-2 py-0.5 rounded-md font-black border border-emerald-300">
                    مفعّل وتلقائي ✓
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  تم ربط <strong>{customerLinkStats.linkedCustomers.toLocaleString('ar-EG')}</strong> عميل وتحديد فروعهم (المخزن) ومناديبهم المعتمدين تلقائياً عبر مطابقة كود العميل (Customer Account).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEnrichAndPersistSales}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 bg-teal-800 hover:bg-teal-900 text-white font-black rounded-xl text-[11px] shadow-2xs transition cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              <span>تثبيت الربط ببيانات العملاء</span>
            </button>
          </div>
        )}

        {syncSuccessMsg && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-bold">{syncSuccessMsg}</span>
          </div>
        )}
        {syncErrorMsg && (
          <div className="mt-3 bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-bold">{syncErrorMsg}</span>
          </div>
        )}
      </section>

      {/* RBAC Filter Warning Banner when sales exist but user role filters them out */}
      {salesRecords.length > 0 && rbacSales.length === 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-950 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-sm sm:text-base">
                تم حفظ {salesRecords.length.toLocaleString('ar-EG')} حركة بيع في النظام بنجاح!
              </h3>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                الحركات الحالية لا تطابق اسم المندوب أو الفرع الخاص بالحساب المسجل به حالياً ({currentUser?.name || 'مستخدم غير محدد'} - {currentUser?.role || 'sales_rep'}).
                اضغط على الزر المقابل لعرض كافة مبيعات الشركة والجمهورية مباشرة بدون قيود.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAllSalesOverride(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-black px-5 py-2.5 rounded-xl text-xs shrink-0 cursor-pointer shadow-md transition whitespace-nowrap"
          >
            عرض كافة مبيعات الشركة (تجاوز الفلتر)
          </button>
        </div>
      )}

      {showAllSalesOverride && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-center justify-between gap-2 text-blue-900 text-xs">
          <span className="font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            يتم حالياً عرض كافة مبيعات الجمهورية والشركة ({salesRecords.length.toLocaleString('ar-EG')} حركة) متجاوزاً قيود المندوب.
          </span>
          <button
            type="button"
            onClick={() => setShowAllSalesOverride(false)}
            className="underline hover:text-blue-700 font-black cursor-pointer text-[11px]"
          >
            العودة للفلترة حسب نطاق صلاحيتي
          </button>
        </div>
      )}

      {/* Prominent Cloud Sync Banner when local records exist but Supabase is empty */}
      {salesRecords.length > 0 && supabaseCount !== null && supabaseCount === 0 && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl shadow-amber-500/20 animate-in fade-in">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/30 shadow-inner">
                <CloudUpload className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-base sm:text-lg text-white">
                    البيانات محفوظة على جهازك محلياً فقط — قاعدة Supabase السحابية لا تزال فارغة (0 سجل)!
                  </h3>
                  <span className="bg-white/25 px-2.5 py-0.5 rounded-full text-[11px] font-black border border-white/30">
                    تنبيه مزامنة سحابية
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-amber-50 max-w-3xl leading-relaxed">
                  شاشتك تعرض حالياً <strong>{salesRecords.length.toLocaleString('ar-EG')}</strong> حركة بيع (مخزنة في ذاكرة المتصفح)، بينما جدول <code className="bg-black/20 px-1.5 py-0.5 rounded text-amber-100 font-mono">customer_item_sales</code> والـ View <code className="bg-black/20 px-1.5 py-0.5 rounded text-amber-100 font-mono">view_customer_monthly_item_sales</code> في Supabase فارغين تماماً. اضغط على الزر المقابل لحفظها سحابياً فوراً ليتم ملء الجداول السحابية بالكامل.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePushToSupabase}
              disabled={isSupabasePushing}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-amber-900 hover:bg-amber-50 font-black text-xs sm:text-sm shadow-lg transition cursor-pointer disabled:opacity-75 shrink-0 whitespace-nowrap active:scale-95"
            >
              {isSupabasePushing ? (
                <>
                  <Loader2 className="w-5 h-5 text-amber-700 animate-spin" />
                  <span>
                    جاري الرفع سحابياً {supabasePushProgress ? `(${supabasePushProgress.synced.toLocaleString('ar-EG')} / ${supabasePushProgress.total.toLocaleString('ar-EG')})` : '...'}
                  </span>
                </>
              ) : (
                <>
                  <CloudUpload className="w-5 h-5 text-amber-600" />
                  <span>حفظ ومزامنة ({salesRecords.length.toLocaleString('ar-EG')}) حركة إلى Supabase الآن</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {salesRecords.length === 0 ? (
        <section className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center mb-4 shadow-xs">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h2 className="text-base sm:text-lg font-black text-slate-900">
            لا توجد بيانات مبيعات مسجلة في المتصفح حالياً
          </h2>
          <p className="text-xs text-slate-500 max-w-xl mx-auto mt-2 leading-relaxed">
            تم مسح البيانات التجريبية نهائياً. يتم قراءة وتحليل بيانات المبيعات الحقيقية فور رفع الملفات المعتمدة، أو جلبها مباشرة من السحابة إذا كانت مرفوعة مسبقاً.
          </p>

          {supabaseCount !== null && supabaseCount > 0 && (
            <div className="mt-5">
              <button
                type="button"
                onClick={handleFetchFromSupabase}
                disabled={isSupabaseFetching}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black text-xs shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <CloudDownload className={`w-4 h-4 ${isSupabaseFetching ? 'animate-bounce' : ''}`} />
                <span>
                  {isSupabaseFetching
                    ? 'جاري الجلب من Supabase...'
                    : `جلب (${supabaseCount.toLocaleString('ar-EG')}) حركة محفوظة في Supabase السحابي`}
                </span>
              </button>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 max-w-2xl mx-auto text-right">
            <h4 className="text-[11px] font-black text-slate-700 mb-2">الأعمدة المدعومة في الملف (Excel / Google Sheet):</h4>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-600 font-mono">
              {[
                'Customer account', 'Invoicing name', 'Sales order', 'Date',
                'المندوب', 'الشهر', 'Warehouse', 'Item', 'Name', 'Unit',
                'factor', 'Unit price', 'Discount', 'Quantity', 'Amount',
                'Item group', 'التعريفات', 'Family Dimension'
              ].map((col) => (
                <span key={col} className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {col}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Filters */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
                تصفية النتائج
              </h2>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedMonth(latestMonth ?? 'all')}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    selectedMonth !== 'all' && selectedMonth === latestMonth
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  هذا الشهر
                </button>
                <button
                  type="button"
                  onClick={() => previousMonth && setSelectedMonth(previousMonth)}
                  disabled={!previousMonth}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    previousMonth && selectedMonth === previousMonth
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الشهر السابق
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMonth('all')}
                  className={`h-7 px-2.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    selectedMonth === 'all'
                      ? 'bg-[#102b4e] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  كل الشهور
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 h-7 px-2 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  إعادة تعيين
                </button>
              </div>
            </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="بحث بالعميل، الصنف، كود العميل، أو رقم أمر البيع..."
              className="w-full h-10 pr-9 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            value={selectedMonth}
            onChange={(event) =>
              setSelectedMonth(event.target.value === 'all' ? 'all' : Number(event.target.value))
            }
            aria-label="تصفية بالشهر"
            className="h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
          >
            <option value="all">كل الشهور</option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
              <option key={month} value={month}>
                {MONTH_NAMES_MAP[month]}
              </option>
            ))}
          </select>

          <select
            value={selectedGroup}
            onChange={(event) => setSelectedGroup(event.target.value)}
            aria-label="تصفية بمجموعة الأصناف"
            className="h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
          >
            <option value="all">كل المجموعات ({distinctGroups.length})</option>
            {distinctGroups.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>

          {distinctWarehouses.length > 1 && (
            <select
              value={selectedWarehouse}
              onChange={(event) => setSelectedWarehouse(event.target.value)}
              aria-label="تصفية بالفرع"
              className="h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              <option value="all">كل الفروع ({distinctWarehouses.length})</option>
              {distinctWarehouses.map((warehouse) => (
                <option key={warehouse} value={warehouse}>
                  {warehouse}
                </option>
              ))}
            </select>
          )}

          {currentUser?.role !== 'sales_rep' && distinctReps.length > 1 && (
            <select
              value={selectedRep}
              onChange={(event) => setSelectedRep(event.target.value)}
              aria-label="تصفية بالمندوب"
              className="h-10 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
            >
              <option value="all">كل المناديب ({distinctReps.length})</option>
              {distinctReps.map((rep) => (
                <option key={rep} value={rep}>
                  {rep}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>


      {/* View tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveView('overview')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'overview'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          لوحة المبيعات
        </button>
        <button
          type="button"
          onClick={() => setActiveView('customers')}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[11px] font-black transition cursor-pointer ${
            activeView === 'customers'
              ? 'bg-[#102b4e] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          تفاصيل العملاء
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
              activeView === 'customers' ? 'bg-white/15 text-amber-200' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {customerSummaries.length}
          </span>
        </button>

        <span className="ms-auto text-[9px] text-slate-400 font-bold px-2 hidden sm:inline-flex items-center gap-1">
          <ClipboardList className="w-3 h-3" />
          {previousMonth
            ? `مقارنة النمو مقابل ${MONTH_NAMES_MAP[previousMonth]}`
            : 'لا توجد فترة سابقة متاحة للمقارنة'}
        </span>
      </div>

      {activeView === 'overview' ? (
        <>
          <ItemSalesKpiCards
            comparison={comparison}
            totalQuantity={periodTotals.quantity}
            previousQuantity={kpiPreviousQuantity}
            itemsCount={periodTotals.itemsCount}
            previousItemsCount={kpiPreviousItemsCount}
            idleCount={idleItems.totalIdle}
            idleCaption={idleCaption}
            comparisonCaption={kpiGrowthCaption}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-5">
              <CategoryMixCard
                groups={groupMix.groups}
                totalAmount={groupMix.totalAmount}
                totalItems={groupMix.totalItems}
                totalQuantity={groupMix.totalQuantity}
                onSelectGroup={(group) => {
                  if (group.startsWith('أخرى')) return;
                  if (!distinctGroups.includes(group)) return;
                  setSelectedGroup(group);
                }}
              />
            </div>
            <div className="xl:col-span-7">
              <ItemRankingCard
                variant="amount"
                items={topItemsByValue}
                subtitle={`${comparison.scopeLabel} • أعلى 10 أصناف بالقيمة`}
                onSelectItem={(itemCode) => {
                  if (itemCode) setSearchTerm(itemCode);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <MonthlyPerformanceCard
                points={monthlyPerformance}
                growth={monthlyPerformanceGrowth}
                selectedMonth={selectedMonth}
                onSelectMonth={(month) => setSelectedMonth(month)}
              />
            </div>
            <div className="xl:col-span-5">
              <TopCustomersTable
                customers={customerInsights}
                selectedAccount={selectedCustomer?.customerAccount || null}
                onSelectCustomer={setSelectedCustomerAccount}
                onOpenAll={() => setActiveView('customers')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <ItemRankingCard
                variant="quantity"
                items={topItemsByQuantity}
                subtitle={`${comparison.scopeLabel} • أعلى 10 أصناف بالكمية`}
                onSelectItem={(itemCode) => {
                  if (itemCode) setSearchTerm(itemCode);
                }}
              />
            </div>
            <div className="xl:col-span-5">
              <CustomerSnapshotCard
                customer={selectedCustomer}
                alert={alerts[0] || null}
                onStartOrder={onOpenNewOrderForCustomer ? handleStartOrderForCustomer : undefined}
                onOpenDetails={openCustomerDetails}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7">
              <SlowMoversCard items={slowMovers} totalItems={periodTotals.itemsCount} />
            </div>
            <div className="xl:col-span-5">
              <RepPerformanceCard
                reps={repPerformance}
                selectedRep={selectedRep}
                onSelectRep={(rep) => setSelectedRep(rep === selectedRep ? 'all' : rep)}
              />
            </div>
          </div>

          <MonthlyCustomerAnalysisTable rows={monthlyCustomerRows} />
        </>
      ) : (
        <CustomerDossiers
          summaries={customerSummaries}
          yearlySummaries={yearlySummaries}
          displayLimit={customerDisplayLimit}
          expandedAccounts={expandedCustomerAccounts}
          selectedMonth={selectedMonth}
          onToggle={toggleCustomerExpand}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          onChangeLimit={setCustomerDisplayLimit}
          onSelectMonth={setSelectedMonth}
          onStartOrder={onOpenNewOrderForCustomer ? handleStartOrderForCustomer : undefined}
        />
      )}
        </>
      )}
    </div>
  );
};
