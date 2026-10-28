import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  CloudUpload,
  Download,
  LayoutDashboard,
  Link2,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
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
  growthPct,
  resolveItemGroup
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

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

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
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [selectedSearchCustomer, setSelectedSearchCustomer] = useState<CustomerItemSalesSummary | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(5);

  const [activeView, setActiveView] = useState<SalesViewMode>('overview');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string | null>(null);
  const [expandedCustomerAccounts, setExpandedCustomerAccounts] = useState<Set<string>>(new Set());

  const initialExpandDone = useRef(false);
  const loadSalesInProgress = useRef(false);

  const loadSalesData = async () => {
    // منع تكرار التحميل بسبب حدث الحفظ (save event) الذي يُطلق عند المزامنة/الجلب من Supabase
    if (loadSalesInProgress.current) return;
    loadSalesInProgress.current = true;

    setIsLoading(true);
    setSyncErrorMsg(null);
    try {
      // 1. قراءة الكاش المحلي كبيانات احتياطية
      const saved = await getSavedCustomerItemSales();
      let localBackup = saved.filter((record) => !String(record.id || '').startsWith('cis-demo-'));
      if (localBackup.length !== saved.length) {
        await saveCustomerItemSales(localBackup);
      }

      // 2. جلب أحدث السجلات من Supabase عند نجاح الاتصال
      let supabaseSales: CustomerItemSaleRecord[] = [];
      let supabaseError: string | null = null;
      let remoteCount = 0;

      try {
        const countRes = await getSupabaseCustomerItemSalesCount();
        remoteCount = countRes >= 0 ? countRes : 0;
        if (remoteCount >= 0) {
          setSupabaseCount(remoteCount);
        }

        const fetchRes = await fetchCustomerItemSalesFromSupabase();
        if (fetchRes.error) {
          supabaseError = fetchRes.error;
        } else if (fetchRes.sales && fetchRes.sales.length > 0) {
          supabaseSales = fetchRes.sales;
        }
      } catch (err: any) {
        supabaseError = err?.message || 'فشل الاتصال بـ Supabase';
      }

      // 3. الاعتماد على بيانات Supabase حتى لو الكاش المحلي مش فاضي (عند نجاح الاتصال)
      // 4. لو الاتصال فشل، استخدم الكاش المحلي واعرض تنبيه واضح
      let finalSales: CustomerItemSaleRecord[] = [];
      if (supabaseSales.length > 0 && !supabaseError) {
        finalSales = supabaseSales;
        setSyncSuccessMsg(
          `تم جلب ${supabaseSales.length.toLocaleString('ar-EG')} حركة من Supabase واعتمادها كبيانات أساسية.`
        );
      } else if (supabaseError) {
        finalSales = localBackup;
        setSyncErrorMsg(
          `فشل الاتصال بـ Supabase: ${supabaseError}. يتم عرض البيانات المخزنة محلياً (${localBackup.length.toLocaleString('ar-EG')} حركة) كنسخة احتياطية.`
        );
      } else if (remoteCount > 0 && supabaseSales.length === 0) {
        finalSales = localBackup;
        setSyncErrorMsg(
          `قاعدة Supabase تحتوي على ${remoteCount.toLocaleString('ar-EG')} سجل لكنها لم تُجلب بنجاح. يتم عرض البيانات المخزنة محلياً.`
        );
      } else {
        finalSales = localBackup;
      }

      setSalesRecords(finalSales);
    } finally {
      setIsLoading(false);
      loadSalesInProgress.current = false;
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
        setSyncSuccessMsg(
          `تم بنجاح رفع ومزامنة ${res.syncedCount.toLocaleString('ar-EG')} حركة إلى جدول customer_item_sales في Supabase!` +
            (res.prunedCount && res.prunedCount > 0
              ? ` وتم تنظيف ${res.prunedCount.toLocaleString('ar-EG')} صف قديم بكمية/مبلغ صفر.`
              : '') +
            ' أصبحت البيانات متطابقة سحابياً.'
        );
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
      const group = resolveItemGroup(record);
      if (group && group !== 'عام') set.add(group);
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
      if (selectedGroup !== 'all' && resolveItemGroup(record) !== selectedGroup) return false;
      if (selectedRep !== 'all' && record.repName !== selectedRep) return false;
      if (selectedWarehouse !== 'all' && record.warehouse !== selectedWarehouse) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matches =
          record.invoicingName?.toLowerCase().includes(query) ||
          record.customerAccount?.toLowerCase().includes(query) ||
          record.itemName?.toLowerCase().includes(query) ||
          record.itemCode?.toLowerCase().includes(query) ||
          record.definitions?.toLowerCase().includes(query) ||
          record.familyDimension?.toLowerCase().includes(query) ||
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

  const computedDiagnostics = useMemo(() => {
    const numericValuesCount = salesRecords.filter(
      (r) => Number(r.quantity || 0) > 0 || Number(r.amount || 0) > 0
    ).length;
    return {
      supabaseCount: supabaseCount ?? 0,
      loadedCount: salesRecords.length,
      numericValuesCount,
      afterRbacCount: rbacSales.length,
      afterFiltersCount: filteredSales.length
    };
  }, [salesRecords, rbacSales, filteredSales, supabaseCount]);

  const customerSummaries = useMemo(
    () => aggregateCustomerItemSales(filteredSales, customers),
    [filteredSales, customers]
  );

  const searchedCustomers = useMemo(() => {
    if (!customerSearchTerm.trim()) return [];
    const query = customerSearchTerm.toLowerCase().trim();
    return customerSummaries
      .filter(
        (s) =>
          s.customerName.toLowerCase().includes(query) ||
          s.customerAccount.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [customerSearchTerm, customerSummaries]);

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
              <BarChart3 className="w-6 h-6 text-warn" />
              تحليل مبيعات الأصناف
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[10px] font-bold ml-2">
                تحت التطوير
              </span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 max-w-3xl leading-relaxed">
              لوحة تحليل صنفية شاملة: المبيعات والكميات، توزيع الفئات، أعلى وأقل الأصناف حركة، أداء المناديب،
              وتحليل شهري للعملاء. كل المبالغ تُحسب من عمود <strong>Amount</strong> كما هو، والتجميع/الفئات من
              عمود <strong>التعريفات</strong> — وكل الأرقام محسوبة من حركات البيع الفعلية وبنفس نطاق صلاحيات المستخدم.
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

      {/* تشخيص عدد السجلات في كل مرحلة (لتعقب مصدر المشكلة) */}
      {salesRecords.length > 0 && (
        <section className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-[10px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-slate-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              تشخيص أعداد السجلات حسب المرحلة
            </h3>
            <span className="text-slate-400 font-bold">يساعد في تحديد ما إذا كانت المشكلة في التحميل أو التحويل أو الصلاحيات أو الفلاتر</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Supabase (السحابة)</div>
              <div className="text-lg font-black text-sky-700">{computedDiagnostics.supabaseCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات موجودة على السحابة</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد التحميل (الصفحة)</div>
              <div className="text-lg font-black text-amber-700">{computedDiagnostics.loadedCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات وصلت للعرض</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">قيم رقمية أكبر من صفر</div>
              <div className="text-lg font-black text-emerald-700">{computedDiagnostics.numericValuesCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات فيها كمية أو مبلغ &gt; 0</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد الصلاحيات (RBAC)</div>
              <div className="text-lg font-black text-teal-700">{computedDiagnostics.afterRbacCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات مسموح للمستخدم رؤيتها</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">بعد الفلاتر</div>
              <div className="text-lg font-black text-rose-700">{computedDiagnostics.afterFiltersCount.toLocaleString('ar-EG')}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">سجلات داخل الشهر والفئة المحددين</div>
            </div>
          </div>
          {computedDiagnostics.loadedCount > 0 && computedDiagnostics.afterFiltersCount === 0 && (
            <div className="mt-2.5 bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 text-[10px]">
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
              كل السجلات المحملة ({computedDiagnostics.loadedCount.toLocaleString('ar-EG')}) تُستبعد بواسطة الفلاتر الحالية — راجع الشهر والفئة والمندوب والفرع المختارين.
            </div>
          )}
          {computedDiagnostics.loadedCount > 0 && computedDiagnostics.numericValuesCount === 0 && (
            <div className="mt-2.5 bg-rose-50 border border-rose-200 rounded-lg p-2 text-rose-800 text-[10px]">
              <AlertCircle className="w-3.5 h-3.5 inline mr-1.5" />
              لا توجد سجلات فيها كمية أو مبلغ أكبر من صفر — قد تكون المشكلة في تحويل الأرقام من الملف المرفوع.
            </div>
          )}
          {computedDiagnostics.supabaseCount > 0 && computedDiagnostics.loadedCount === 0 && (
            <div className="mt-2.5 bg-sky-50 border border-sky-200 rounded-lg p-2 text-sky-800 text-[10px]">
              <CloudDownload className="w-3.5 h-3.5 inline mr-1.5" />
              يوجد سجلات في Supabase ({computedDiagnostics.supabaseCount.toLocaleString('ar-EG')}) لكن لم تصل لأي سجل للصفحة — تأكد من الاتصال بالسحابة أو اضغط «تحديث».
            </div>
          )}
        </section>
      )}

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
                      ? 'bg-navy-deep text-white'
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
                      ? 'bg-navy-deep text-white'
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
                      ? 'bg-navy-deep text-white'
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

          <div className="relative col-span-2 md:col-span-3 xl:col-span-2">
            <UserRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={customerSearchTerm}
              onChange={(event) => setCustomerSearchTerm(event.target.value)}
              placeholder="بحث عن عميل بالاسم أو الكود..."
              className="w-full h-10 pr-9 pl-9 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {customerSearchTerm && (
              <button
                type="button"
                onClick={() => setCustomerSearchTerm('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {searchedCustomers.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto text-right">
                {searchedCustomers.map((customer) => (
                  <button
                    key={customer.customerAccount}
                    type="button"
                    onClick={() => {
                      setSelectedSearchCustomer(customer);
                      setCustomerSearchTerm(customer.customerName);
                    }}
                    className="w-full text-right px-3 py-2 text-[11px] hover:bg-slate-50 border-b border-slate-50 last:border-0 transition"
                  >
                    <div className="font-black text-slate-800">{customer.customerName}</div>
                    <div className="text-[9.5px] text-slate-400 font-mono">
                      كود: {customer.customerAccount || '—'} •
                      {formatCurrency(customer.totalAmount)} •
                      {customer.totalQuantity.toLocaleString('ar-EG')} كرتونة
                    </div>
                  </button>
                ))}
              </div>
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
            <option value="all">كل الفئات/التعريفات ({distinctGroups.length})</option>
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
              ? 'bg-navy-deep text-white shadow-sm'
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
              ? 'bg-navy-deep text-white shadow-sm'
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
          {salesRecords.length > 0 && periodTotals.amount === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11.5px] font-black text-amber-900">
                    كل المبالغ والكميات في الداتا الحالية = صفر
                  </div>
                  <p className="text-[10px] text-amber-800 font-bold leading-relaxed mt-0.5">
                    الصفوف موجودة لكن أعمدة Amount/Quantity وصلت فاضية. أعد رفع شيت المبيعات من صفحة
                    الإكسل (أصبح بيقرأ الأرقام العربية والفواصل بشكل صحيح)، ثم اضغط «مزامنة Supabase»
                    لتنظيف الصفوف الصفرية ورفع القيم الحقيقية.
                  </p>
                </div>
              </div>
              {onNavigateToExcel && (
                <button
                  type="button"
                  onClick={onNavigateToExcel}
                  className="shrink-0 h-8 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black transition cursor-pointer"
                >
                  فتح صفحة الإكسل
                </button>
              )}
            </div>
          )}

          <ItemSalesKpiCards
            comparison={comparison}
            totalQuantity={periodTotals.quantity}
            previousQuantity={kpiPreviousQuantity}
            itemsCount={periodTotals.itemsCount}
            previousItemsCount={kpiPreviousItemsCount}
            customersCount={periodTotals.customersCount}
            idleCount={idleItems.totalIdle}
            idleCaption={idleCaption}
            comparisonCaption={kpiGrowthCaption}
          />

          {/* بطاقة تفاصيل العميل المختار من بحث العملاء */}
          {selectedSearchCustomer && (
            <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {initials(selectedSearchCustomer.customerName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 truncate flex-1">
                        {selectedSearchCustomer.customerName}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setSelectedSearchCustomer(null)}
                        className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[9.5px] text-slate-400 font-bold font-mono">
                      كود العميل: {selectedSearchCustomer.customerAccount || '—'}
                    </div>
                    <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" />
                      {selectedSearchCustomer.linkedBranch || selectedSearchCustomer.warehouse || 'الفرع الرئيسي'}
                    </div>
                    <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                      <UserRound className="w-3 h-3 shrink-0" />
                      {selectedSearchCustomer.linkedRepName || selectedSearchCustomer.repName || 'غير محدد'}
                    </div>
                    {selectedSearchCustomer.linkedPhone && (
                      <div className="text-[9.5px] text-slate-500 font-bold flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 shrink-0" />
                        {selectedSearchCustomer.linkedPhone}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-[9.5px] font-bold text-slate-400">إجمالي المشتريات</div>
                  <div className="text-xl font-black text-emerald-700 font-mono">
                    {formatCurrency(selectedSearchCustomer.totalAmount)}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {selectedSearchCustomer.totalQuantity.toLocaleString('ar-EG')} كرتونة •
                    {selectedSearchCustomer.distinctItemsCount} صنف
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* أكثر صنف اشتراه */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    أكثر صنف اشتراه
                  </div>
                  {selectedSearchCustomer.items.length > 0 ? (
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-black text-slate-900 truncate">
                          {selectedSearchCustomer.items[0].itemName}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {selectedSearchCustomer.items[0].itemCode || '—'}
                        </div>
                        <div className="text-[10px] font-bold text-emerald-700 mt-1">
                          {formatCurrency(selectedSearchCustomer.items[0].totalAmount)}
                        </div>
                        <div className="text-[9px] text-slate-600">
                          {selectedSearchCustomer.items[0].totalQuantity.toLocaleString('ar-EG')} كرتونة
                        </div>
                      </div>
                      {selectedSearchCustomer.totalAmount > 0 && (
                        <div className="text-[9px] text-slate-400 mt-1">
                          تمثل {Math.round((selectedSearchCustomer.items[0].totalAmount / selectedSearchCustomer.totalAmount) * 100)}% من مشتريات العميل
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 font-bold">لا توجد أصناف</div>
                  )}
                </div>

                {/* توزيع الأصناف بالنسبة المئوية */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    نسبة كل صنف من مشتريات العميل
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {selectedSearchCustomer.items.slice(0, 6).map((item, idx) => {
                      const pct =
                        selectedSearchCustomer.totalAmount > 0
                          ? (item.totalAmount / selectedSearchCustomer.totalAmount) * 100
                          : 0;
                      return (
                        <div
                          key={item.itemCode || idx}
                          className="text-[9.5px] font-bold text-slate-700"
                        >
                          <div className="flex justify-between mb-0.5">
                            <span className="truncate max-w-[120px]">{item.itemName}</span>
                            <span className="font-mono text-indigo-700">{Math.round(pct)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            ></div>
                          </div>
                          <div className="flex justify-between text-[8.5px] text-slate-400 mt-0.5">
                            <span>{formatCurrency(item.totalAmount)}</span>
                            <span>{item.totalQuantity.toLocaleString('ar-EG')} كرتونة</span>
                          </div>
                        </div>
                      );
                    })}
                    {selectedSearchCustomer.items.length === 0 && (
                      <div className="text-[10px] text-slate-400 font-bold">لا توجد بيانات</div>
                    )}
                  </div>
                </div>

                {/* المشتريات الشهرية */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    المشتريات الشهرية (السنة كاملة)
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                      const amount = selectedSearchCustomer.monthlySales[month] || 0;
                      const qty = selectedSearchCustomer.monthlyQuantities[month] || 0;
                      const hasSales = amount > 0;
                      return (
                        <div
                          key={month}
                          className="text-center p-1.5 rounded-lg border text-[9px] font-bold transition ${
                            hasSales
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-slate-100/50 border-transparent text-slate-400'
                          }"
                        >
                          <div className="text-[8px] uppercase tracking-wider mb-0.5">
                            {MONTH_NAMES_MAP[month].slice(0, 3)}
                          </div>
                          <div className="font-mono font-black">
                            {hasSales ? formatCurrency(amount) : '—'}
                          </div>
                          <div className="text-[8px]">{hasSales ? qty.toLocaleString('ar-EG') : '0'} ك</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {onOpenNewOrderForCustomer && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenNewOrderForCustomer(customers.find((c) => c.code === selectedSearchCustomer!.customerAccount || c.name === selectedSearchCustomer!.customerName) as Customer, undefined)}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-navy-deep hover:bg-navy-dark4 text-white text-[11px] font-black transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    طلبية جديدة لهذا العميل
                  </button>
                </div>
              )}
            </section>
          )}

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
