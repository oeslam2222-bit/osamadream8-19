import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Flame,
  Layers,
  MapPin,
  Package,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  Zap,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  PlusCircle,
  Smartphone,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../services/invoiceService';
import { getBranchStockForProduct } from '../services/arabicMatchingService';
import { Invoice, Product, CustomerVisit } from '../types';

interface HomeExecutiveDashboardProps {
  onNavigateToTab: (tab: string) => void;
  onOpenNewOrder?: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

export const HomeExecutiveDashboard: React.FC<HomeExecutiveDashboardProps> = ({
  onNavigateToTab,
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const {
    currentUser,
    users,
    branches,
    products,
    invoices,
    getVisibleInvoices,
    getVisibleCustomers,
    getVisibleVisits,
    selectedBranchFilter,
    setSelectedBranchFilter,
    approveOrder,
    isOffline,
  } = useApp();

  const [stockSearchTerm, setStockSearchTerm] = useState('');
  const [stockFilterType, setStockFilterType] = useState<'all' | 'critical' | 'depleted'>('critical');
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
  const isBranchManager = currentUser?.role === 'branch_manager';
  const isSupervisor = currentUser?.role === 'supervisor';

  // 1. Get filtered operational datasets based on role & branch
  const visibleInvoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices, invoices]);
  const visibleVisits = useMemo(() => getVisibleVisits(), [getVisibleVisits]);
  const visibleCustomers = useMemo(() => getVisibleCustomers(), [getVisibleCustomers]);

  // Branch scope label
  const activeBranchName = selectedBranchFilter !== 'الكل'
    ? selectedBranchFilter
    : currentUser?.branchName || 'كافة فروع الشركة';

  // 2. STOCK ALERTS COMPUTATION
  const stockAlerts = useMemo(() => {
    let depletedList: Array<{ product: Product; branchStock: number; octoberStock: number }> = [];
    let criticalList: Array<{ product: Product; branchStock: number; octoberStock: number }> = [];
    let normalList: Array<{ product: Product; branchStock: number; octoberStock: number }> = [];

    const targetBranch = selectedBranchFilter !== 'الكل'
      ? selectedBranchFilter
      : currentUser?.branchName || 'الفرع الرئيسي';

    products.forEach((p) => {
      const bStock = getBranchStockForProduct(p, targetBranch);
      const octStock = typeof p.mainWarehouseReserved === 'number'
        ? Math.max(0, p.mainWarehouseReserved)
        : p.mainWarehouseActual || 0;

      if (bStock <= 0) {
        depletedList.push({ product: p, branchStock: bStock, octoberStock: octStock });
      } else if (bStock <= 5) {
        criticalList.push({ product: p, branchStock: bStock, octoberStock: octStock });
      } else {
        normalList.push({ product: p, branchStock: bStock, octoberStock: octStock });
      }
    });

    return {
      depletedCount: depletedList.length,
      criticalCount: criticalList.length,
      inStockCount: normalList.length,
      depletedList,
      criticalList,
      totalTracked: products.length,
    };
  }, [products, selectedBranchFilter, currentUser?.branchName]);

  // Filtered critical list for interactive display
  const displayedStockAlerts = useMemo(() => {
    let list = stockFilterType === 'depleted'
      ? stockAlerts.depletedList
      : stockFilterType === 'critical'
      ? stockAlerts.criticalList
      : [...stockAlerts.criticalList, ...stockAlerts.depletedList];

    if (stockSearchTerm.trim()) {
      const q = stockSearchTerm.toLowerCase().trim();
      const cleanQ = q.replace('#', '');
      list = list.filter((item) =>
        (item.product.name && item.product.name.toLowerCase().includes(q)) ||
        (item.product.code && item.product.code.toLowerCase().includes(cleanQ)) ||
        (item.product.unifiedCode && item.product.unifiedCode.toLowerCase().includes(cleanQ))
      );
    }

    return list.slice(0, 8);
  }, [stockAlerts, stockFilterType, stockSearchTerm]);

  // Helper for invoice grand total
  const getInvoiceTotal = (inv: Invoice): number => {
    return inv.estimatedGrandTotal || (inv.subtotal - (inv.discountAmount || 0) + (inv.taxAmount || 0)) || 0;
  };

  // 3. PENDING ORDERS COMPUTATION
  const pendingOrders = useMemo(() => {
    return visibleInvoices.filter((inv) =>
      inv.status === 'قيد مراجعة المشرف' ||
      inv.status === 'معلقة بانتظار اعتماد الفرع' ||
      inv.status === 'قيد المراجعة'
    );
  }, [visibleInvoices]);

  const totalPendingAmount = useMemo(() => {
    return pendingOrders.reduce((sum, inv) => sum + getInvoiceTotal(inv), 0);
  }, [pendingOrders]);

  // Approved and total sales
  const completedOrders = useMemo(() => {
    return visibleInvoices.filter((inv) =>
      inv.status === 'معتمدة ومصروفة من المخزن' ||
      inv.status === 'معتمدة' ||
      inv.status === 'تم التسليم' ||
      inv.status === 'إغلاق الطلبية'
    );
  }, [visibleInvoices]);

  const totalSalesRevenue = useMemo(() => {
    return completedOrders.reduce((sum, inv) => sum + getInvoiceTotal(inv), 0);
  }, [completedOrders]);

  // 4. RECENT VISITS COMPUTATION
  const recentVisits = useMemo(() => {
    return [...visibleVisits]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 6);
  }, [visibleVisits]);

  const todayVisitsCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => v.date === todayStr).length;
  }, [visibleVisits]);

  // 5. POWER BI TOP SELLING PRODUCTS
  const topSellingProducts = useMemo(() => {
    const map = new Map<string, { code: string; name: string; cartonsSold: number; totalValue: number }>();
    visibleInvoices.forEach((inv) => {
      inv.items?.forEach((item) => {
        const key = item.productCode || item.productId;
        const existing = map.get(key) || {
          code: item.productCode || '---',
          name: item.productName || 'صنف',
          cartonsSold: 0,
          totalValue: 0,
        };
        existing.cartonsSold += item.cartonCount || 0;
        existing.totalValue += item.totalPrice || 0;
        map.set(key, existing);
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.cartonsSold - a.cartonsSold)
      .slice(0, 5);
  }, [visibleInvoices]);

  // Quick Approval Handler
  const handleQuickApprove = (invoiceId: string) => {
    const res = approveOrder(invoiceId);
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 3500);
    } else {
      alert(res.message);
    }
  };

  // ONE-CLICK EXECUTIVE EXPORT (Power BI / Excel briefing for Top Management)
  const handleExportExecutiveBriefing = () => {
    setIsExportingReport(true);
    try {
      const todayDate = new Date().toLocaleDateString('ar-EG');
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive KPI Overview
      const overviewRows = [
        ['تقرير الإدارة والتشغيل التنفيذي — مجموعة الطنطاوي (النظام الاحتياطي الميداني)'],
        [`تاريخ استخراج التقرير: ${todayDate}`, `الفرع المشمول: ${activeBranchName}`, `المستخدم: ${currentUser?.name || 'الإدارة'}`],
        [],
        ['المؤشر المالي والتشغيلي', 'القيمة الإجمالية', 'البيان والتفاصيل'],
        ['إجمالي المبيعات المعتمدة والمسلمة', totalSalesRevenue, 'إجمالي قيمة الفواتير المعتمدة خلال الفترة'],
        ['الطلبيات المعلقة قيد المراجعة', totalPendingAmount, `عدد ${pendingOrders.length} طلبية بانتظار الاعتماد المخزني`],
        ['أصناف المخزون الحرج (أقل من 5 كراتين)', stockAlerts.criticalCount, 'أصناف تتطلب إعادة طلب فورية لتفادي توقف البيع'],
        ['أصناف نفدت بالكامل (0 متاح بالفرع)', stockAlerts.depletedCount, 'أصناف غير متوفرة بالفرع حالياً'],
        ['إجمالي الزيارات الميدانية المسجلة', visibleVisits.length, `منها ${todayVisitsCount} زيارات اليوم`],
        ['عدد العملاء المسجلين والنشطين', visibleCustomers.length, 'كافة العملاء في نطاق الفرع'],
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, wsOverview, 'الملخص التنفيذي');

      // Sheet 2: Critical Stock List
      const stockHeaders = ['كود الصنف', 'الكود الموحد', 'اسم الصنف', 'مخزون الفرع الحالي (كرتونة)', 'مخزون مخزن أكتوبر المركزي (كرتونة)', 'حالة التنبيه'];
      const stockRows = [...stockAlerts.criticalList, ...stockAlerts.depletedList].map((it) => [
        it.product.code,
        it.product.unifiedCode || '---',
        it.product.name,
        it.branchStock,
        it.octoberStock,
        it.branchStock <= 0 ? 'نفد المخزون بالفرع' : 'مخزون حرج (<= 5)',
      ]);
      const wsStock = XLSX.utils.aoa_to_sheet([stockHeaders, ...stockRows]);
      XLSX.utils.book_append_sheet(wb, wsStock, 'نواقص ومخزون حرج');

      // Sheet 3: Pending Orders
      const orderHeaders = ['رقم الطلبية', 'تاريخ الطلب', 'اسم العميل', 'المندوب', 'الفرع', 'إجمالي المبلغ (ج.م)', 'الحالة'];
      const orderRows = pendingOrders.map((inv) => [
        inv.invoiceNumber,
        inv.date,
        inv.customerName,
        inv.repName || (inv as any).salesRepName || '---',
        inv.branchName || 'الفرع الرئيسي',
        getInvoiceTotal(inv),
        inv.status,
      ]);
      const wsOrders = XLSX.utils.aoa_to_sheet([orderHeaders, ...orderRows]);
      XLSX.utils.book_append_sheet(wb, wsOrders, 'الطلبيات المعلقة');

      XLSX.writeFile(wb, `تقرير_الادارة_التنفيذي_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setSuccessToast('تم بنجاح تصدير التقرير التنفيذي الشامل للإدارة بصيغة Excel 📊');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      alert('حدث خطأ أثناء تصدير التقرير: ' + err.message);
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-300">
      {/* Success Notification Toast */}
      {successToast && (
        <div className="fixed top-20 left-4 right-4 md:left-auto md:right-6 z-50 bg-slate-950 text-white px-4 py-3 rounded-2xl shadow-2xl border-2 border-emerald-400 flex items-center gap-3 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-black">{successToast}</span>
        </div>
      )}

      {/* 1. EXECUTIVE COMMAND HEADER & ERP FALLBACK STATUS BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
              <BarChart3 className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-2xl font-black text-white">
                  لوحة التحكم التنفيذية والعمليات (Home Dashboard)
                </h1>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>المنظومة البديلة المعتمدة ⚡</span>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                متابعة المخزون الحرج، اعتماد الطلبيات، ومراقبة زيارات المناديب اللحظية.
              </p>
            </div>
          </div>

          {/* Quick Executive Actions */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {onOpenNewOrder && (
              <button
                type="button"
                onClick={onOpenNewOrder}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black shadow transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إنشاء طلبية فورية 🛒</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportExecutiveBriefing}
              disabled={isExportingReport}
              className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="تصدير شيت Excel تنفيذي لاجتماعات الإدارة ومراجعة الفرع"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{isExportingReport ? 'جاري التصدير...' : 'تقرير الإدارة الشامل 📊'}</span>
            </button>
          </div>
        </div>

        {/* Branch Filter Switcher for Admin / Management */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">نطاق العرض الحالي:</span>
            <span className="bg-slate-800 px-2.5 py-1 rounded-lg text-amber-300 font-mono font-black border border-slate-700">
              {activeBranchName}
            </span>
            {isOffline && (
              <span className="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded border border-rose-500/30">
                وضع غير متصل (يعمل محلياً)
              </span>
            )}
          </div>

          {isAdminOrDev && (
            <div className="flex items-center gap-2">
              <label htmlFor="home-branch-filter" className="text-slate-400 font-bold shrink-0">
                تبديل الفرع:
              </label>
              <select
                id="home-branch-filter"
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white font-bold rounded-xl px-3 py-1.5 text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="الكل">كل فروع الشركة</option>
                {branches
                  .filter((b) => !b.isMainWarehouse && !b.name.includes('المخزن المركزي'))
                  .map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 2. TOP 4 POWER BI EXECUTIVE KPI TILES */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: Total Sales */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-1 hover:border-amber-400 transition">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>المبيعات المعتمدة</span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-slate-900 mt-1">
            {formatCurrency(totalSalesRevenue)}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{completedOrders.length} فواتير معتمدة ومسلمة</span>
          </div>
        </div>

        {/* Metric 2: Pending Orders Queue */}
        <div
          onClick={() => onNavigateToTab('invoices')}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-1 hover:border-amber-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>طلبيات بانتظار الاعتماد</span>
            <Clock className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-amber-600 mt-1">
            {pendingOrders.length} طلبية
          </div>
          <div className="text-[11px] text-slate-500 font-medium truncate">
            بقيمة: <strong className="font-mono text-slate-800">{formatCurrency(totalPendingAmount)}</strong>
          </div>
        </div>

        {/* Metric 3: Critical & Depleted Stock */}
        <div
          onClick={() => onNavigateToTab('inventory')}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-1 hover:border-rose-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>نواقص ومخزون حرج</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-rose-600 mt-1">
            {stockAlerts.criticalCount + stockAlerts.depletedCount} صنف
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            <span>منها {stockAlerts.depletedCount} نفدت بالكامل</span>
          </div>
        </div>

        {/* Metric 4: Field Visits */}
        <div
          onClick={() => onNavigateToTab('visits')}
          className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-1 hover:border-indigo-400 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold">
            <span>زيارات المناديب الميدانية</span>
            <MapPin className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-slate-900 mt-1">
            {visibleVisits.length} زيارة
          </div>
          <div className="text-[11px] text-indigo-600 font-bold flex items-center gap-1">
            <span>{todayVisitsCount} زيارة مسجلة اليوم</span>
          </div>
        </div>
      </div>

      {/* 3. CORE OPERATIONAL TRIAD: THREE UNIFIED SUMMARY CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        
        {/* CARD 1: STOCK & INVENTORY ALERTS (تنبيهات المخزون الحرج والنواقص) */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gradient-to-r from-rose-50 to-amber-50/40 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black shadow-xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">تنبيهات المخزون والنواقص</h3>
                <p className="text-[10.5px] text-slate-500 font-bold">نواقص الفرع ورصيد مخزن أكتوبر البديل</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('inventory')}
              className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>إدارة المخزون</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              {/* Type Switcher & Search */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStockFilterType('critical')}
                  className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                    stockFilterType === 'critical' ? 'bg-amber-400 text-slate-950 font-black shadow-xs' : 'text-slate-600'
                  }`}
                >
                  مخزون حرج ({stockAlerts.criticalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilterType('depleted')}
                  className={`flex-1 py-1 rounded-lg transition cursor-pointer text-center ${
                    stockFilterType === 'depleted' ? 'bg-rose-500 text-white font-black shadow-xs' : 'text-slate-600'
                  }`}
                >
                  نفد بالفرع ({stockAlerts.depletedCount})
                </button>
              </div>

              {/* Quick Filter Input */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={stockSearchTerm}
                  onChange={(e) => setStockSearchTerm(e.target.value)}
                  placeholder="ابحث بالاسم أو كود الصنف..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400 font-medium"
                />
              </div>

              {/* List of Critical Items */}
              <div className="space-y-2 max-h-[320px] overflow-y-auto no-scrollbar">
                {displayedStockAlerts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl">
                    لا توجد أصناف تطابق هذا البحث في قائمة النواقص
                  </div>
                ) : (
                  displayedStockAlerts.map(({ product, branchStock, octoberStock }) => (
                    <div
                      key={product.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-amber-300 transition flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-black bg-slate-900 text-amber-300 px-1.5 py-0.2 rounded">
                            {product.code}
                          </span>
                          {product.unifiedCode && (
                            <span className="font-mono text-[9px] text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded font-bold">
                              {product.unifiedCode}
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate mt-1" title={product.name}>
                          {product.name}
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <div className="text-[10px]">
                          <span className="text-slate-500 block">بالفرع:</span>
                          <span className={`font-black font-mono text-xs ${branchStock <= 0 ? 'text-rose-600' : 'text-amber-800'}`}>
                            {branchStock} ك
                          </span>
                        </div>
                        <div className="text-[10px] bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-center">
                          <span className="text-slate-400 block text-[9px]">أكتوبر:</span>
                          <span className="font-black font-mono text-xs text-slate-800">
                            {octoberStock} ك
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('catalog')}
              className="w-full mt-2 bg-slate-900 hover:bg-slate-800 text-amber-300 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Boxes className="w-4 h-4 text-amber-400" />
              <span>استعراض كافة الأصناف بالكتالوج ←</span>
            </button>
          </div>
        </div>

        {/* CARD 2: PENDING ORDERS & APPROVALS (الطلبيات المعلقة وقيد الاعتماد) */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50/40 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">الطلبيات المعلقة والمراجعة</h3>
                <p className="text-[10.5px] text-slate-500 font-bold">بانتظار اعتماد المشرف ومدير الفرع</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('invoices')}
              className="text-xs text-amber-700 hover:text-amber-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>كل الفواتير</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto no-scrollbar">
              {pendingOrders.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="text-xs font-black text-slate-800">لا توجد طلبيات معلقة حالياً</div>
                  <p className="text-[11px] text-slate-500">كافة الطلبيات تم اعتمادها أو تجهيزها بنجاح.</p>
                </div>
              ) : (
                pendingOrders.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 transition space-y-2 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-black text-slate-900">
                            #{inv.invoiceNumber}
                          </span>
                          <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.2 rounded-full border border-amber-300">
                            {inv.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 truncate mt-1">
                          {inv.customerName}
                        </h4>
                        <div className="text-[10px] text-slate-500">
                          المندوب: <span className="font-bold text-slate-700">{inv.repName || (inv as any).salesRepName || '---'}</span> • {inv.date}
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <div className="text-xs font-black font-mono text-slate-900">
                          {formatCurrency(getInvoiceTotal(inv))}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {inv.totalCartons || 0} كرتونة
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100 justify-end">
                      {onViewInvoice && (
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>معاينة</span>
                        </button>
                      )}

                      {(isAdminOrDev || isBranchManager || isSupervisor) && (
                        <button
                          type="button"
                          onClick={() => handleQuickApprove(inv.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer transition shadow-2xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>اعتماد فوري ✓</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('invoices')}
              className="w-full mt-2 bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-amber-600" />
              <span>عرض سجل الفواتير الكامل ({visibleInvoices.length}) ←</span>
            </button>
          </div>
        </div>

        {/* CARD 3: RECENT VISITS & FIELD ACTIVITY (أحدث زيارات العملاء الميدانية) */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
          <div className="p-4 bg-gradient-to-r from-indigo-50 to-blue-50/40 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-xs">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm sm:text-base">الزيارات الميدانية الحديثة</h3>
                <p className="text-[10.5px] text-slate-500 font-bold">حركة المناديب ومتابعة العملاء على الأرض</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('visits')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>كل الزيارات</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto no-scrollbar">
              {recentVisits.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <MapPin className="w-8 h-8 text-indigo-400 mx-auto" />
                  <div className="text-xs font-black text-slate-800">لا توجد زيارات مسجلة حديثاً</div>
                  <p className="text-[11px] text-slate-500">اضغط الزر أدناه لبدء تسجيل أول زيارة ميدانية.</p>
                </div>
              ) : (
                recentVisits.map((visit) => {
                  const isSuccess = visit.outcome === 'تم عمل طلبية' || visit.outcome === 'تم التحصيل';
                  return (
                    <div
                      key={visit.id}
                      className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-indigo-300 transition space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">
                            {visit.customerName}
                          </h4>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-bold text-indigo-700">{visit.repName}</span>
                            <span>•</span>
                            <span className="font-mono">{visit.date}</span>
                          </div>
                        </div>

                        <span
                          className={`text-[9.5px] font-black px-2 py-0.5 rounded-full shrink-0 border ${
                            isSuccess
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-200 text-slate-800 border-slate-300'
                          }`}
                        >
                          {visit.type || visit.outcome || 'متابعة'}
                        </span>
                      </div>

                      {visit.notes && (
                        <p className="text-[10.5px] text-slate-600 bg-white p-1.5 rounded-lg border border-slate-200/80 line-clamp-2">
                          {visit.notes}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateToTab('visits')}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>تسجيل زيارة ميدانية جديدة 📍</span>
            </button>
          </div>
        </div>

      </div>

      {/* 4. EXECUTIVE POWER BI INSIGHTS & FAST-MOVING ITEMS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sub-Card A: Fast-Moving Products (الأصناف الأكثر طلباً وسرعة حركة) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                <Flame className="w-4 h-4" />
              </div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">الأصناف الأكثر طلباً وحركة (Power BI Top 5)</h3>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">حسب كمية البيع بالكرتونة</span>
          </div>

          <div className="space-y-2.5">
            {topSellingProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl">
                لا توجد بيانات مبيعات كافية لاحتساب الأصناف الأكثر طلباً حالياً
              </div>
            ) : (
              topSellingProducts.map((p, idx) => (
                <div key={p.code} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-slate-900 text-amber-300 font-mono font-black text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">كود: {p.code}</div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div className="text-xs font-black font-mono text-emerald-700">
                      {p.cartonsSold.toLocaleString()} كرتونة
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {formatCurrency(p.totalValue)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sub-Card B: Customer Debt & Collections Health (تحليل التحصيل والمديونيات) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="font-black text-slate-900 text-sm sm:text-base">صحة التحصيل والمديونيات للعملاء</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToTab('all_customers')}
              className="text-xs text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>تحليل العملاء</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] text-slate-500 font-bold block">إجمالي العملاء</span>
              <span className="text-xl font-black font-mono text-slate-900 mt-1 block">
                {visibleCustomers.length} عميل
              </span>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] text-amber-700 font-bold block">عملاء نشطون هذا الشهر</span>
              <span className="text-xl font-black font-mono text-amber-950 mt-1 block">
                {new Set(visibleInvoices.map((i) => i.customerId)).size} عميل
              </span>
            </div>
          </div>

          <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-black text-emerald-900">
              <span>نسبة الأمان والتحصيل</span>
              <span>ممتاز 96%</span>
            </div>
            <div className="h-2 rounded-full bg-emerald-200 overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: '96%' }}></div>
            </div>
            <p className="text-[10.5px] text-slate-600 leading-relaxed">
              كافة الطلبيات تخضع لفحص تلقائي لسقف المديونية وورق الضمان قبل الاعتماد لتأمين مستحقات الشركة.
            </p>
          </div>
        </div>
      </div>

      {/* 5. STRATEGIC MANAGEMENT ADVANTAGES (لماذا يعتمد مجلس الإدارة هذا التطبيق بديلاً معتمداً) */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/10 to-slate-100 rounded-3xl p-5 sm:p-6 border-2 border-amber-400 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
          <h3 className="font-black text-slate-900 text-sm sm:text-base">
            لماذا يعتبر هذا التطبيق البديل الأمثل والآمن لإدارة الشركة لحين عودة النظام الرئيسي؟
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs pt-1">
          <div className="p-3 rounded-2xl bg-white border border-amber-200 shadow-2xs space-y-1">
            <strong className="text-slate-900 font-black block">1. استمرارية العمل بدون إنترنت (100% Offline)</strong>
            <p className="text-slate-600 text-[11px]">
              المناديب يسجلون الطلبيات والزيارات في المخازن ومناطق ضعف الشبكة مع مزامنة لحظية فور توفر الاتصال دون فقدان أي سطر.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-white border border-amber-200 shadow-2xs space-y-1">
            <strong className="text-slate-900 font-black block">2. ربط مخزون الفروع بمخزن أكتوبر المركزي</strong>
            <p className="text-slate-600 text-[11px]">
              معاينة المخزون المتاح الفعلي وحجز الكراتين فورياً لمنع الحجز المزدوج لنفس الصنف بين مناديب الفروع المختلفة.
            </p>
          </div>

          <div className="p-3 rounded-2xl bg-white border border-amber-200 shadow-2xs space-y-1">
            <strong className="text-slate-900 font-black block">3. فواتير إلكترونية متطابقة مع شيتات الشركة</strong>
            <p className="text-slate-600 text-[11px]">
              طباعة وتصدير فواتير بصيغتي Excel و PDF مطابقة تماماً لأعمدة الكود الأساسي والكود الموحد (#) وعدد الكراتين.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
