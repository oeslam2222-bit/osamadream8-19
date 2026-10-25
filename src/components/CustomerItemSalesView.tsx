import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Boxes,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCheck,
  FileSpreadsheet,
  Filter,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Target,
  Users,
  X
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
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
import { getSavedSourceUrl } from '../services/dataSourceService';
import { formatCurrency } from '../services/invoiceService';
import { Customer, CustomerItemSaleRecord, CustomerItemSalesSummary } from '../types';

interface CustomerItemSalesViewProps {
  onOpenNewOrderForCustomer?: (customer: Customer, prefilledItemCode?: string) => void;
  onNavigateToExcel?: () => void;
}

export const CustomerItemSalesView: React.FC<CustomerItemSalesViewProps> = ({
  onOpenNewOrderForCustomer,
  onNavigateToExcel
}) => {
  const { currentUser, users, customers, branches } = useApp();

  // Raw Item Sales Records
  const [salesRecords, setSalesRecords] = useState<CustomerItemSaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [customerDisplayLimit, setCustomerDisplayLimit] = useState<number>(2); // User requested: "وتظهلي اول 2 عملاء لان البيانات هتكون كتيره جدا"

  // Modals & Panels
  const [isSQLModalOpen, setIsSQLModalOpen] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [expandedCustomerAccounts, setExpandedCustomerAccounts] = useState<Set<string>>(new Set());

  // Load Initial Data
  useEffect(() => {
    const saved = getSavedCustomerItemSales();
    if (saved && saved.length > 0) {
      setSalesRecords(saved);
      setIsLoading(false);
    } else {
      // Seed with rich realistic demo data grounded in existing customers
      const demo = generateDemoCustomerItemSales(customers, users);
      setSalesRecords(demo);
      saveCustomerItemSales(demo);
      setIsLoading(false);
    }
  }, [customers, users]);

  // Sync from saved Google Sheet URL
  const handleSyncFromSheet = async () => {
    const sheetUrl = getSavedSourceUrl('customerSales');
    if (!sheetUrl) {
      setSyncErrorMsg('لم يتم حفظ رابط Google Sheet لمبيعات العملاء بالصنف بعد. يرجى إدخال الرابط في صفحة الإكسل.');
      return;
    }

    setIsSyncing(true);
    setSyncErrorMsg(null);
    setSyncSuccessMsg(null);

    try {
      const res = await fetchCustomerItemSalesFromGoogleSheet(sheetUrl);
      if (res.errors.length > 0 && res.sales.length === 0) {
        throw new Error(res.errors.join(' • '));
      }
      if (res.sales.length > 0) {
        setSalesRecords(res.sales);
        saveCustomerItemSales(res.sales);
        setSyncSuccessMsg(`تم بنجاح جلب وتحديث ${res.sales.length} حركة مبيعات أصناف من Google Sheets!`);
      } else {
        throw new Error('لم يتم العثور على صفوف مبيعات صالحة في الشيت.');
      }
    } catch (err: any) {
      setSyncErrorMsg(err?.message || 'فشلت المزامنة من Google Sheets');
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncSuccessMsg(null), 6000);
    }
  };

  // RBAC Filtered Sales
  const rbacSales = useMemo(() => {
    return filterCustomerItemSalesByRBAC(salesRecords, currentUser, users, customers);
  }, [salesRecords, currentUser, users, customers]);

  // Distinct Filter Options
  const distinctGroups = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((s) => {
      if (s.itemGroup && s.itemGroup !== 'عام') set.add(s.itemGroup);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  const distinctReps = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((s) => {
      if (s.repName && s.repName !== 'غير محدد') set.add(s.repName);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  const distinctWarehouses = useMemo(() => {
    const set = new Set<string>();
    rbacSales.forEach((s) => {
      if (s.warehouse) set.add(s.warehouse);
    });
    return Array.from(set).sort();
  }, [rbacSales]);

  // Filtered Raw Sales
  const filteredSales = useMemo(() => {
    return rbacSales.filter((s) => {
      // Month
      if (selectedMonth !== 'all' && s.month !== selectedMonth) return false;
      // Item Group
      if (selectedGroup !== 'all' && s.itemGroup !== selectedGroup) return false;
      // Rep (for admin/supervisor)
      if (selectedRep !== 'all' && s.repName !== selectedRep) return false;
      // Warehouse
      if (selectedWarehouse !== 'all' && s.warehouse !== selectedWarehouse) return false;
      // Search
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchCust = s.invoicingName?.toLowerCase().includes(q) || s.customerAccount?.toLowerCase().includes(q);
        const matchItem = s.itemName?.toLowerCase().includes(q) || s.itemCode?.toLowerCase().includes(q);
        const matchOrder = s.salesOrder?.toLowerCase().includes(q);
        const matchRep = s.repName?.toLowerCase().includes(q);
        if (!matchCust && !matchItem && !matchOrder && !matchRep) return false;
      }
      return true;
    });
  }, [rbacSales, selectedMonth, selectedGroup, selectedRep, selectedWarehouse, searchTerm]);

  // Aggregated Customer Summaries
  const customerSummaries = useMemo(() => {
    return aggregateCustomerItemSales(filteredSales);
  }, [filteredSales]);

  // Auto-expand first 2 customers on load/search
  useEffect(() => {
    if (customerSummaries.length > 0) {
      const initial = new Set<string>();
      customerSummaries.slice(0, 2).forEach((c) => initial.add(c.customerAccount));
      setExpandedCustomerAccounts(initial);
    }
  }, [customerSummaries.length, searchTerm]);

  // Overall KPIs
  const overallKPIs = useMemo(() => {
    const totalAmount = filteredSales.reduce((acc, s) => acc + s.amount, 0);
    const totalQuantity = filteredSales.reduce((acc, s) => acc + s.quantity, 0);
    const uniqueItems = new Set(filteredSales.map((s) => s.itemCode || s.itemName)).size;
    const uniqueCustomers = new Set(filteredSales.map((s) => s.customerAccount || s.invoicingName)).size;
    const uniqueOrders = new Set(filteredSales.filter((s) => s.salesOrder).map((s) => s.salesOrder)).size;
    const avgOrderValue = uniqueOrders > 0 ? Math.round(totalAmount / uniqueOrders) : 0;

    return {
      totalAmount,
      totalQuantity,
      uniqueItems,
      uniqueCustomers,
      uniqueOrders: uniqueOrders || Math.max(1, Math.ceil(filteredSales.length / 3)),
      avgOrderValue
    };
  }, [filteredSales]);

  // Toggle Customer Expansion
  const toggleCustomerExpand = (account: string) => {
    setExpandedCustomerAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(account)) next.delete(account);
      else next.add(account);
      return next;
    });
  };

  // Expand All / Collapse All
  const handleExpandAll = () => {
    const all = new Set(customerSummaries.map((c) => c.customerAccount));
    setExpandedCustomerAccounts(all);
  };
  const handleCollapseAll = () => {
    setExpandedCustomerAccounts(new Set());
  };

  // Copy SQL Schema
  const sqlSchemaText = useMemo(() => getCustomerItemSalesSQLSchema(), []);
  const handleCopySQL = () => {
    navigator.clipboard.writeText(sqlSchemaText);
    setCopiedSQL(true);
    setTimeout(() => setCopiedSQL(false), 3000);
  };

  // Export to Excel
  const handleExportExcel = () => {
    exportCustomerItemSalesToExcel(filteredSales, customerSummaries, `تحليل_مبيعات_الأصناف_${currentUser?.name || 'الطنطاوي'}`);
  };

  // Find App Customer Object for Order Creation
  const handleStartOrderForCustomer = (account: string, itemCode?: string) => {
    const matched = customers.find((c) => c.code === account || c.name === account);
    if (matched && onOpenNewOrderForCustomer) {
      onOpenNewOrderForCustomer(matched, itemCode);
    }
  };

  return (
    <div className="tantawy-screen space-y-6 pb-20" dir="rtl">
      
      {/* Top Executive Header */}
      <div className="bg-gradient-to-br from-slate-950 via-[#102438] to-[#0a1826] text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/10 border border-amber-400/30 text-amber-300 rounded-xl text-xs font-black">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>تحليل مبيعات الأصناف التفصيلي (ERP Item-Level Sales Engine)</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-amber-400" />
              <span>مبيعات العملاء بالصنف والمجموعات الشهرية</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
              تحليل دقيق ومفصل لما اشتراه كل عميل من كل صنف (Item)، معامل التحويل (Factor)، الكميات، القيمة الإجمالية، والمجموعات التصنيفية (Item Group & Family Dimension) موزعاً على شهور عام 2026.
            </p>

            {/* Role & Scoping Notice */}
            <div className="pt-1 flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-lg text-slate-200 font-bold border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  نطاق الصلاحية: {currentUser?.role === 'sales_rep' ? `مندوب المبيعات (${currentUser.name})` : currentUser?.role === 'supervisor' ? `مشرف الفرع (${currentUser.name})` : currentUser?.role === 'branch_manager' ? `مدير الفرع (${currentUser.branchName})` : 'الإدارة العامة (كامل الصلاحيات)'}
                </span>
              </span>

              {currentUser?.role === 'sales_rep' && (
                <span className="text-[11px] text-amber-300 font-medium">
                  • يعرض حصراً عملاءك المسندين لك لحفظ خصوصية المبيعات
                </span>
              )}
            </div>
          </div>

          {/* Quick Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSyncFromSheet}
              disabled={isSyncing}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة من Google Sheets'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير إكسل تحليلي</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSQLModalOpen(true)}
              className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-400/40 font-bold px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer"
            >
              <Database className="w-4 h-4 text-blue-400" />
              <span>كود SQL للجدول</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCustomerDrawerOpen(true)}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 font-bold px-3.5 py-2.5 rounded-xl text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer"
            >
              <Users className="w-4 h-4 text-purple-300" />
              <span>عملاء الشيت ({customerSummaries.length})</span>
            </button>
          </div>
        </div>

        {/* Sync Success & Error Banners */}
        {syncSuccessMsg && (
          <div className="bg-emerald-950/80 border border-emerald-400 text-emerald-200 p-4 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-bold">{syncSuccessMsg}</span>
          </div>
        )}
        {syncErrorMsg && (
          <div className="bg-rose-950/80 border border-rose-400 text-rose-200 p-4 rounded-2xl text-xs sm:text-sm flex items-center gap-3 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="font-bold">{syncErrorMsg}</span>
          </div>
        )}

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">إجمالي المبيعات</div>
            <div className="text-base sm:text-lg font-black text-amber-300 font-mono mt-1">
              {formatCurrency(overallKPIs.totalAmount)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">صافي مبيعات الأصناف</div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">الكميات المباعة</div>
            <div className="text-base sm:text-lg font-black text-emerald-300 font-mono mt-1">
              {overallKPIs.totalQuantity.toLocaleString('ar-EG')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">كرتونة / شدة</div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">الأصناف المشتراة</div>
            <div className="text-base sm:text-lg font-black text-sky-300 font-mono mt-1">
              {overallKPIs.uniqueItems.toLocaleString('ar-EG')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">صنف مختلف</div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">العملاء المتعاملين</div>
            <div className="text-base sm:text-lg font-black text-purple-300 font-mono mt-1">
              {overallKPIs.uniqueCustomers.toLocaleString('ar-EG')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">عميل اشترى أصناف</div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">أوامر البيع (Sales Orders)</div>
            <div className="text-base sm:text-lg font-black text-rose-300 font-mono mt-1">
              {overallKPIs.uniqueOrders.toLocaleString('ar-EG')}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">أمر بيع منفذ</div>
          </div>

          <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3.5 rounded-2xl">
            <div className="text-[10px] text-slate-300 font-bold">متوسط الفاتورة</div>
            <div className="text-base sm:text-lg font-black text-teal-300 font-mono mt-1">
              {formatCurrency(overallKPIs.avgOrderValue)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">لكل أمر بيع</div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* Smart Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث باسم العميل، كود العميل، اسم الصنف، كود الصنف، أو رقم أمر البيع..."
              className="w-full h-11 pr-10 pl-4 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">جميع مجموعات الأصناف ({distinctGroups.length})</option>
              {distinctGroups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            {/* Warehouse Filter */}
            {distinctWarehouses.length > 1 && (
              <select
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
                className="h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">جميع الفروع والمخازن</option>
                {distinctWarehouses.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            )}

            {/* Rep Filter (Admin / Supervisor only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'developer') && distinctReps.length > 1 && (
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="h-11 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">جميع المناديب ({distinctReps.length})</option>
                {distinctReps.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}

            {/* Display Limit Dropdown - Addressing User Directive: "وتظهلي اول 2 عملاء لان البيانات هتكون كتيره جدا" */}
            <select
              value={customerDisplayLimit}
              onChange={(e) => setCustomerDisplayLimit(Number(e.target.value))}
              aria-label="تحديد عدد بطاقات العملاء المعروضة"
              className="h-11 px-3 bg-amber-50 border border-amber-300 rounded-xl text-xs font-black text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value={2}>عرض أول عميلين فقط (أداء سريع)</option>
              <option value={5}>عرض أول 5 عملاء</option>
              <option value={10}>عرض أول 10 عملاء</option>
              <option value={25}>عرض أول 25 عميل</option>
              <option value={1000}>عرض كافة العملاء ({customerSummaries.length})</option>
            </select>
          </div>
        </div>

        {/* Month Filter Bar (يناير - ديسمبر) */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <span className="text-xs font-bold text-slate-500 shrink-0 ml-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>تصفية بالشهر:</span>
          </span>

          <button
            type="button"
            onClick={() => setSelectedMonth('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              selectedMonth === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            كامل عام 2026
          </button>

          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
            const isSelected = selectedMonth === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-xs font-black'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{MONTH_NAMES_MAP[m]}</span>
              </button>
            );
          })}
        </div>

        {/* Quick View Controls: Expand All / Collapse All & Counter */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <div>
            تم العثور على <strong>{customerSummaries.length}</strong> عميل اشتروا أصنافاً مطابقة للتصفية
            {customerDisplayLimit < customerSummaries.length && (
              <span className="text-amber-700 font-bold mr-1">
                (يتم عرض أول {customerDisplayLimit} عملاء لتسريع التصفح)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExpandAll}
              className="text-xs text-slate-600 hover:text-slate-900 font-bold hover:underline cursor-pointer"
            >
              توسيع كافة الجداول
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="text-xs text-slate-600 hover:text-slate-900 font-bold hover:underline cursor-pointer"
            >
              طي الجداول
            </button>
          </div>
        </div>
      </div>

      {/* CUSTOMER DOSSIERS LIST (معاينة كروت العملاء ومبيعات الأصناف) */}
      <div className="space-y-6">
        {customerSummaries.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-slate-300 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-slate-900">لا توجد مبيعات أصناف مطابقة للبحث</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              تأكد من اختيار الشهر أو مجموعة الصنف الصحيحة، أو قم بتحديث شيت مبيعات العملاء بالصنف من Google Sheets.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedMonth('all');
                setSelectedGroup('all');
                setSelectedRep('all');
              }}
              className="text-xs font-bold text-amber-700 hover:underline cursor-pointer pt-2"
            >
              إعادة تعيين كافة الفلاتر
            </button>
          </div>
        ) : (
          customerSummaries.slice(0, customerDisplayLimit).map((summary, idx) => {
            const isExpanded = expandedCustomerAccounts.has(summary.customerAccount);

            return (
              <div
                key={summary.customerAccount || idx}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden hover:border-slate-300 transition space-y-0"
              >
                {/* Customer Card Header Bar */}
                <div className="p-6 bg-slate-50/70 border-b border-slate-200">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 text-amber-300 flex items-center justify-center font-black text-base shrink-0 shadow-sm">
                        {idx + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-black text-slate-900">
                            {summary.customerName}
                          </h3>
                          <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300">
                            {summary.customerAccount || '---'}
                          </span>
                          <span className="text-xs px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-800 font-bold">
                            {summary.warehouse || 'الفرع الرئيسي'}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap font-medium">
                          <span>المندوب: <strong className="text-slate-800">{summary.repName || 'غير محدد'}</strong></span>
                          <span>•</span>
                          <span>أوامر البيع: <strong className="text-slate-800">{summary.distinctOrdersCount} أمر بيع</strong></span>
                          <span>•</span>
                          <span>الأصناف المختلفة: <strong className="text-slate-800">{summary.distinctItemsCount} صنف</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Customer Totals & Action Buttons */}
                    <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
                      <div className="bg-white border border-slate-200 px-4 py-2 rounded-2xl text-center shadow-2xs">
                        <div className="text-[10px] text-slate-500 font-bold">إجمالي مشتريات العميل</div>
                        <div className="text-base font-black text-emerald-700 font-mono">
                          {formatCurrency(summary.totalAmount)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium">
                          {summary.totalQuantity.toLocaleString('ar-EG')} كرتونة / شدة
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onOpenNewOrderForCustomer && (
                          <button
                            type="button"
                            onClick={() => handleStartOrderForCustomer(summary.customerAccount)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                          >
                            <Plus className="w-4 h-4" />
                            <span>طلب جديد للعميل</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleCustomerExpand(summary.customerAccount)}
                          className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1 transition cursor-pointer"
                        >
                          <span>{isExpanded ? 'طي الأصناف' : 'عرض الأصناف'}</span>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Timeline Mini Bars */}
                  <div className="mt-4 pt-3 border-t border-slate-200/80">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-2">
                      <span>توزيع المبيعات على شهور عام 2026:</span>
                      <span className="text-slate-400 font-normal">اضغط على الشهر للتصفية</span>
                    </div>

                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 text-center">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
                        const mAmount = summary.monthlySales[m] || 0;
                        const mQty = summary.monthlyQuantities[m] || 0;
                        const hasSales = mAmount > 0;

                        return (
                          <div
                            key={m}
                            onClick={() => setSelectedMonth(m)}
                            className={`p-2 rounded-xl border text-[11px] transition cursor-pointer ${
                              hasSales
                                ? 'bg-white border-amber-300 hover:border-amber-500 shadow-2xs'
                                : 'bg-slate-100/60 border-transparent opacity-60'
                            }`}
                          >
                            <div className="text-[10px] text-slate-500 font-bold">{MONTH_NAMES_MAP[m]}</div>
                            <div className={`font-black mt-0.5 ${hasSales ? 'text-emerald-700 font-mono text-[11px]' : 'text-slate-400 text-[10px]'}`}>
                              {hasSales ? `${Math.round(mAmount / 1000)}k` : '---'}
                            </div>
                            {hasSales && (
                              <div className="text-[9px] text-slate-400 font-medium">
                                {mQty} ك
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Item Groups Breakdown for this Customer */}
                  {Object.keys(summary.groupBreakdown).length > 0 && (
                    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-bold text-slate-600 text-[11px]">مجموعات الأصناف:</span>
                      {Object.entries(summary.groupBreakdown).map(([grp, data]) => (
                        <span
                          key={grp}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-medium"
                        >
                          <Tag className="w-3 h-3 text-amber-500" />
                          <strong>{grp}</strong>
                          <span className="text-emerald-600 font-bold">({formatCurrency(data.amount)})</span>
                          <span className="text-slate-400 text-[10px]">{data.quantity} كرتونة</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items Purchased Table (Expanded by Default for First Customers) */}
                {isExpanded && (
                  <div className="overflow-x-auto p-4 sm:p-6 animate-in fade-in">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">كود الصنف</th>
                          <th className="p-3">اسم الصنف (Name)</th>
                          <th className="p-3">المجموعة / العائلة</th>
                          <th className="p-3">الوحدة</th>
                          <th className="p-3">معامل التحويل (factor)</th>
                          <th className="p-3">سعر الوحدة</th>
                          <th className="p-3 text-emerald-800">إجمالي الكمية المباعة</th>
                          <th className="p-3 text-emerald-800">المبلغ الإجمالي (ج.م)</th>
                          <th className="p-3 text-center">أشهر الشراء</th>
                          <th className="p-3 text-center">إجراء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {summary.items.map((item, itemIdx) => {
                          const activeMonths = Object.keys(item.monthlyBreakdown).map(Number).sort((a, b) => a - b);

                          return (
                            <tr key={item.itemCode || itemIdx} className="hover:bg-amber-50/40 transition">
                              <td className="p-3 text-slate-400 font-mono">{itemIdx + 1}</td>
                              <td className="p-3 font-mono font-bold text-amber-900">{item.itemCode}</td>
                              <td className="p-3 font-black text-slate-900">
                                <div>{item.itemName}</div>
                              </td>
                              <td className="p-3 text-slate-600">
                                <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-[11px] font-bold">
                                  {item.itemGroup}
                                </span>
                                {item.familyDimension && item.familyDimension !== item.itemGroup && (
                                  <span className="block text-[10px] text-slate-400 mt-0.5 font-normal">
                                    {item.familyDimension}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-bold text-slate-700">{item.unit || 'كرتونة'}</td>
                              <td className="p-3 font-mono text-slate-700">{item.factor} قطعة</td>
                              <td className="p-3 font-mono text-slate-700">{formatCurrency(item.avgUnitPrice)}</td>
                              <td className="p-3 font-mono font-black text-emerald-700 text-sm">
                                {item.totalQuantity.toLocaleString('ar-EG')}
                              </td>
                              <td className="p-3 font-mono font-black text-emerald-800 text-sm">
                                {formatCurrency(item.totalAmount)}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1 flex-wrap max-w-xs">
                                  {activeMonths.map((m) => (
                                    <span
                                      key={m}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200"
                                      title={`${MONTH_NAMES_MAP[m]}: ${item.monthlyBreakdown[m]?.quantity} كرتونة`}
                                    >
                                      {MONTH_NAMES_MAP[m]}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {onOpenNewOrderForCustomer && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartOrderForCustomer(summary.customerAccount, item.itemCode)}
                                    title="طلب هذا الصنف للعميل"
                                    className="p-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 transition cursor-pointer"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Load More Customers Button */}
        {customerSummaries.length > customerDisplayLimit && (
          <div className="p-6 bg-white rounded-3xl border border-slate-200 text-center space-y-2">
            <p className="text-xs text-slate-500 font-medium">
              يتبقى <strong>{customerSummaries.length - customerDisplayLimit}</strong> عميل إضافي لم يتم عرضهم للحفاظ على سرعة واستجابة الصفحة
            </p>
            <button
              type="button"
              onClick={() => setCustomerDisplayLimit((prev) => prev + 10)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-sm cursor-pointer"
            >
              عرض 10 عملاء إضافيين
            </button>
          </div>
        )}
      </div>

      {/* SQL SCHEMA CODE MODAL (As requested: "وعاوز كود سيكول للجدول عشان يتربط علي طول") */}
      {isSQLModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in" dir="rtl">
          <div className="bg-slate-900 text-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-700 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-black text-white">كود SQL لجدول مبيعات العملاء بالصنف (PostgreSQL / Supabase)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSQLModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              قم بنسخ هذا الكود وتنفيذه مباشرة في لوحة <strong>Supabase SQL Editor</strong> أو <strong>PostgreSQL</strong> لإنشاء الجدول، الفهارس الذكية، وسياسات الأمان RLS المخصصة:
            </p>

            <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
              <pre className="p-4 text-[11px] font-mono text-emerald-400 leading-relaxed overflow-y-auto max-h-[50vh]" dir="ltr">
                {sqlSchemaText}
              </pre>

              <button
                type="button"
                onClick={handleCopySQL}
                className="absolute top-3 left-3 bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                {copiedSQL ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>تم النسخ ✓</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ كود SQL</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400">
                يشمل الجدول كافة الحقول: Customer account, Invoicing name, Item, Quantity, Amount...
              </span>
              <button
                type="button"
                onClick={() => setIsSQLModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMERS DRAWER MODAL */}
      {isCustomerDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-900">
                  قائمة العملاء الموجودين في شيت مبيعات الأصناف ({customerSummaries.length} عميل)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              اضغط على أي عميل للانتقال المباشر وتصفية مبيعات أصنافه:
            </p>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 pr-1">
              {customerSummaries.map((c) => (
                <div
                  key={c.customerAccount}
                  onClick={() => {
                    setSearchTerm(c.customerName || c.customerAccount);
                    setIsCustomerDrawerOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-xl hover:bg-amber-50/60 transition flex items-center justify-between cursor-pointer"
                >
                  <div>
                    <strong className="block text-xs font-black text-slate-900">{c.customerName}</strong>
                    <span className="text-[10px] text-slate-400 font-mono">{c.customerAccount} • {c.repName}</span>
                  </div>
                  <div className="text-left font-mono">
                    <span className="block text-xs font-black text-emerald-700">{formatCurrency(c.totalAmount)}</span>
                    <span className="text-[10px] text-slate-400">{c.distinctItemsCount} صنف</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
