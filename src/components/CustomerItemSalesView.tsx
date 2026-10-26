import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  Download,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getSavedSourceUrl } from '../services/dataSourceService';
import {
  buildBranchInsights,
  buildCustomerGrowthMap,
  buildCustomerInsights,
  buildCustomerRecentOrders,
  buildFollowUpAlerts,
  buildMonthlyTrend,
  buildPeriodComparison,
  buildTopItemInsights,
  countDistinctOrders,
  hasSalesOrderData,
  resolveLatestSalesMonth,
  sumSalesQuantity
} from '../services/customerItemSalesInsights';
import {
  aggregateCustomerItemSales,
  exportCustomerItemSalesToExcel,
  fetchCustomerItemSalesFromGoogleSheet,
  filterCustomerItemSalesByRBAC,
  generateDemoCustomerItemSales,
  getCustomerItemSalesSQLSchema,
  getSavedCustomerItemSales,
  MONTH_NAMES_MAP,
  saveCustomerItemSales
} from '../services/customerItemSalesService';
import { Customer, CustomerItemSaleRecord, CustomerItemSalesSummary } from '../types';
import { BranchShareCard } from './customerSales/BranchShareCard';
import { CustomerDossiers } from './customerSales/CustomerDossiers';
import { CustomerInsightRail } from './customerSales/CustomerInsightRail';
import { MonthlyTrendCard } from './customerSales/MonthlyTrendCard';
import { SalesKpiCards } from './customerSales/SalesKpiCards';
import { TopCustomersCard } from './customerSales/TopCustomersCard';
import { TopItemsChartCard } from './customerSales/TopItemsChartCard';

interface CustomerItemSalesViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer, prefilledItemCode?: string) => void;
  onNavigateToExcel?: () => void;
}

type SalesViewMode = 'overview' | 'customers';

export const CustomerItemSalesView: React.FC<CustomerItemSalesViewProps> = ({
  onOpenNewOrderForCustomer,
  onNavigateToExcel
}) => {
  const { currentUser, users, customers } = useApp();

  const [salesRecords, setSalesRecords] = useState<CustomerItemSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDemoData, setIsDemoData] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(5);

  const [activeView, setActiveView] = useState<SalesViewMode>('overview');
  const [selectedCustomerAccount, setSelectedCustomerAccount] = useState<string | null>(null);
  const [expandedCustomerAccounts, setExpandedCustomerAccounts] = useState<Set<string>>(new Set());

  const [isSQLModalOpen, setIsSQLModalOpen] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const initialExpandDone = useRef(false);

  useEffect(() => {
    const saved = getSavedCustomerItemSales();
    const realSaved = saved.filter((record) => !String(record.id || '').startsWith('cis-demo-'));
    if (realSaved.length > 0) {
      setSalesRecords(realSaved);
      setIsDemoData(false);
    } else {
      // بيانات تجريبية للمعاينة فقط — لا يتم حفظها حتى لا تختلط ببيانات الشيت الحقيقية.
      if (saved.length > 0) saveCustomerItemSales([]);
      setSalesRecords(generateDemoCustomerItemSales(customers, users));
      setIsDemoData(true);
    }
    setIsLoading(false);
  }, [customers, users]);

  const rbacSales = useMemo(
    () => filterCustomerItemSalesByRBAC(salesRecords, currentUser, users, customers),
    [salesRecords, currentUser, users, customers]
  );

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
    () => aggregateCustomerItemSales(filteredSales),
    [filteredSales]
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

  const topItems = useMemo(
    () => buildTopItemInsights(filteredSales, previousMonthSales, 5),
    [filteredSales, previousMonthSales]
  );

  const branchData = useMemo(() => buildBranchInsights(filteredSales), [filteredSales]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(baseSales), [baseSales]);

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

  const invoicesCount = useMemo(() => countDistinctOrders(filteredSales), [filteredSales]);
  const ordersAvailable = useMemo(() => hasSalesOrderData(filteredSales), [filteredSales]);
  const uniqueItemsCount = useMemo(
    () => new Set(filteredSales.map((record) => record.itemCode || record.itemName)).size,
    [filteredSales]
  );
  const totalQuantity = useMemo(() => sumSalesQuantity(filteredSales), [filteredSales]);

  const selectedCustomer = useMemo(
    () =>
      customerInsights.find((customer) => customer.customerAccount === selectedCustomerAccount) ||
      customerInsights[0] ||
      null,
    [customerInsights, selectedCustomerAccount]
  );

  const recentOrders = useMemo(
    () =>
      selectedCustomer
        ? buildCustomerRecentOrders(baseSales, selectedCustomer.customerAccount, 3)
        : [],
    [baseSales, selectedCustomer]
  );

  const selectedCustomerMonthlySales = useMemo(() => {
    const monthly: Record<number, number> = {};
    if (!selectedCustomer) return monthly;
    const selectedAccount = selectedCustomer.customerAccount.trim().toLowerCase();
    baseSales.forEach((record) => {
      const account = (record.customerAccount || record.invoicingName || '').trim().toLowerCase();
      if (account !== selectedAccount) return;
      const month = Number(record.month);
      if (!Number.isFinite(month)) return;
      monthly[month] = (monthly[month] || 0) + (Number(record.amount) || 0);
    });
    return monthly;
  }, [baseSales, selectedCustomer]);

  const selectedCustomerFinancials = useMemo(() => {
    if (!selectedCustomer) return null;
    const matched = customers.find(
      (customer) =>
        customer.code === selectedCustomer.customerAccount ||
        customer.name === selectedCustomer.customerAccount ||
        customer.name === selectedCustomer.customerName
    );
    if (!matched) return null;
    return {
      currentBalance: matched.currentBalance ?? matched.balance ?? 0,
      overdue: matched.totalOverdueAndDue ?? matched.overdueBalance ?? 0,
      collections: matched.collections2026 ?? matched.totalOverallCollections ?? 0,
      creditLimit: matched.creditLimit ?? 0,
      lastCollectionDate: matched.lastCollectionDate,
      lastCollectionAmount: matched.lastCollectionAmount ?? 0
    };
  }, [customers, selectedCustomer]);

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

  const scopeLabel =
    currentUser?.role === 'sales_rep'
      ? `مندوب المبيعات (${currentUser.name})`
      : currentUser?.role === 'supervisor'
        ? `مشرف المناديب (${currentUser.name})`
        : currentUser?.role === 'branch_manager'
          ? `مدير الفرع (${currentUser.branchName})`
          : 'الإدارة العامة (كامل الصلاحيات)';


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

  const sqlSchemaText = useMemo(() => getCustomerItemSalesSQLSchema(), []);

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlSchemaText);
      setCopiedSQL(true);
      setTimeout(() => setCopiedSQL(false), 2500);
    } catch {
      setCopiedSQL(false);
    }
  };

  const handleExportExcel = () => {
    exportCustomerItemSalesToExcel(
      filteredSales,
      customerSummaries,
      `تحليل_مبيعات_الأصناف_${currentUser?.name || 'الطنطاوي'}`
    );
  };

  const handleSyncFromSheet = async () => {
    const sheetUrl = getSavedSourceUrl('customerSales');
    if (!sheetUrl) {
      setSyncErrorMsg(
        'لم يتم حفظ رابط Google Sheet لمبيعات العملاء بالصنف بعد. أدخل الرابط من صفحة الإكسل أولاً.'
      );
      return;
    }

    setIsSyncing(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);

    try {
      const result = await fetchCustomerItemSalesFromGoogleSheet(sheetUrl);
      if (result.sales.length === 0) {
        throw new Error(result.errors[0] || 'لم يتم العثور على صفوف مبيعات صالحة في الشيت');
      }
      setSalesRecords(result.sales);
      saveCustomerItemSales(result.sales);
      setIsDemoData(false);
      setLastSyncAt(new Date().toLocaleString('ar-EG'));
      setSyncSuccessMsg(
        `تم تحديث ${result.sales.length.toLocaleString('ar-EG')} سطر مبيعات من ${result.totalRows.toLocaleString('ar-EG')} صف في الشيت.`
      );
    } catch (error: any) {
      setSyncErrorMsg(error?.message || 'فشلت مزامنة شيت مبيعات العملاء بالصنف');
    } finally {
      setIsSyncing(false);
    }
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
              لوحة تحليل مبيعات الأصناف
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#c99a43]" />
              مبيعات العملاء بالصنف
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 max-w-3xl leading-relaxed">
              صورة موحّدة للمبيعات حسب الفرع والمندوب والعميل والصنف، مع مقارنة بالفترة السابقة
              ومؤشرات نمو وتنبيهات متابعة تساعد الإدارة ومدير الفرع ومشرف المناديب على القرار السريع.
            </p>

            <div className="pt-1 flex items-center gap-2 flex-wrap text-[10px]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-slate-600 font-bold border border-slate-200">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                نطاق الصلاحية: {scopeLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg text-slate-600 font-bold border border-slate-200">
                <CalendarDays className="w-3.5 h-3.5 text-sky-600" />
                {comparison.scopeLabel}
              </span>
              {lastSyncAt && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-lg text-emerald-700 font-bold border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  آخر مزامنة: {lastSyncAt}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleSyncFromSheet}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'جاري المزامنة...' : 'مزامنة الشيت'}
            </button>
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              تصدير Excel
            </button>
            <button
              type="button"
              onClick={() => setIsSQLModalOpen(true)}
              className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer"
            >
              <Database className="w-4 h-4 text-sky-600" />
              SQL
            </button>
          </div>
        </div>

        {isDemoData && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-amber-900 leading-relaxed">
              البيانات المعروضة تجريبية للمعاينة فقط (غير محفوظة). اربط شيت مبيعات الأصناف لعرض أرقامك الحقيقية.
            </p>
            {onNavigateToExcel && (
              <button
                type="button"
                onClick={onNavigateToExcel}
                className="shrink-0 h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-black transition cursor-pointer"
              >
                ربط الشيت من صفحة الإكسل
              </button>
            )}
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


      {/* Filters */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
            تصفية النتائج
          </h2>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            إعادة تعيين
          </button>
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
          <SalesKpiCards
            comparison={comparison}
            invoicesCount={invoicesCount}
            hasOrders={ordersAvailable}
            customersCount={customerSummaries.length}
            itemsCount={uniqueItemsCount}
            totalQuantity={totalQuantity}
            topItem={topItems[0] || null}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TopItemsChartCard
                  items={topItems}
                  currentLabel={comparison.scopeLabel}
                  previousLabel={
                    previousMonth ? MONTH_NAMES_MAP[previousMonth] : null
                  }
                  onSelectItem={(itemCode) => {
                    if (itemCode) setSearchTerm(itemCode);
                  }}
                />
                <BranchShareCard
                  branches={branchData.branches}
                  totalAmount={branchData.totalAmount}
                  totalCustomers={branchData.totalCustomers}
                />
              </div>

              <MonthlyTrendCard trend={monthlyTrend} selectedMonth={selectedMonth} />

              <TopCustomersCard
                customers={customerInsights}
                selectedAccount={selectedCustomer?.customerAccount || null}
                onSelectCustomer={setSelectedCustomerAccount}
                onStartOrder={onOpenNewOrderForCustomer ? handleStartOrderForCustomer : undefined}
                onOpenAll={() => setActiveView('customers')}
                onExport={handleExportExcel}
              />
            </div>

            <div className="xl:col-span-4">
              <CustomerInsightRail
                customers={customerInsights}
                selected={selectedCustomer}
                alerts={alerts}
                recentOrders={recentOrders}
                selectedMonth={selectedMonth}
                monthlyAmounts={selectedCustomerMonthlySales}
                financial={selectedCustomerFinancials}
                onSelectCustomer={setSelectedCustomerAccount}
                onStartOrder={onOpenNewOrderForCustomer ? handleStartOrderForCustomer : undefined}
                onOpenDetails={openCustomerDetails}
              />
            </div>
          </div>
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

      {/* SQL schema modal */}
      {isSQLModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          dir="rtl"
        >
          <div className="bg-slate-900 text-white rounded-3xl max-w-3xl w-full p-5 shadow-2xl border border-slate-700 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black text-white">
                  كود SQL لجدول مبيعات العملاء بالصنف (PostgreSQL / Supabase)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSQLModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              نفّذ الكود في <strong>Supabase SQL Editor</strong> لإنشاء الجدول والفهارس وسياسات
              الأمان RLS، ثم اربط المزامنة بالجدول بدل التخزين المحلي.
            </p>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
              <pre className="p-4 text-[10px] font-mono text-emerald-400 leading-relaxed overflow-y-auto max-h-[50vh]" dir="ltr">
                {sqlSchemaText}
              </pre>
              <button
                type="button"
                onClick={handleCopySQL}
                className="absolute top-3 left-3 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSQL ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    تم النسخ
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    نسخ SQL
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-slate-400">
                يشمل الحقول: Customer account, Invoicing name, Item, Quantity, Amount…
              </span>
              <button
                type="button"
                onClick={() => setIsSQLModalOpen(false)}
                className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};
