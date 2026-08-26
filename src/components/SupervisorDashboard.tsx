import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Building,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Layers,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Warehouse,
  X,
  XCircle
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
import { Invoice, OrderStatus } from '../types';

interface SupervisorDashboardProps {
  onOpenNewOrder?: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
}

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const {
    invoices,
    products,
    users,
    currentUser,
    branches,
    selectedBranchFilter,
    setSelectedBranchFilter,
    updateOrderStatus,
    approveOrder,
    forwardOrderToManager,
    rejectOrder,
  } = useApp();

  const [activeStatusTab, setActiveStatusTab] = useState<string>('الكل');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepFilter, setSelectedRepFilter] = useState('الكل');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination state for responsive performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(15);

  // Return Modal State
  const [returnModalInvoice, setReturnModalInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('رفض الاستلام من العميل / مرتجع بضاعة');

  // Reject Modal State
  const [rejectModalInvoice, setRejectModalInvoice] = useState<Invoice | null>(null);
  const [rejectReason, setRejectReason] = useState('نفاذ الكمية أو عدم استيفاء الشروط');

  // Real-Time Branch Sales Performance Calculation across all branches
  const branchSalesSummary = useMemo(() => {
    const branchMap = new Map<string, {
      name: string;
      code: string;
      city: string;
      totalSales: number;
      totalCartons: number;
      ordersCount: number;
      deliveredCount: number;
      deliveredSales: number;
      pendingCount: number;
    }>();

    // 1. Initialize from registered branches
    branches.forEach((b) => {
      branchMap.set(b.name, {
        name: b.name,
        code: b.code || '',
        city: b.city || '',
        totalSales: 0,
        totalCartons: 0,
        ordersCount: 0,
        deliveredCount: 0,
        deliveredSales: 0,
        pendingCount: 0,
      });
    });

    // 2. Populate from invoices in real-time
    invoices.forEach((inv) => {
      const bName = inv.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
      if (!branchMap.has(bName)) {
        branchMap.set(bName, {
          name: bName,
          code: '',
          city: bName.replace('فرع ', ''),
          totalSales: 0,
          totalCartons: 0,
          ordersCount: 0,
          deliveredCount: 0,
          deliveredSales: 0,
          pendingCount: 0,
        });
      }

      const branchData = branchMap.get(bName)!;
      branchData.ordersCount += 1;

      if (inv.status !== 'مرفوضة / ملغاة' && inv.status !== 'ملغاة') {
        branchData.totalSales += inv.estimatedGrandTotal || 0;
        branchData.totalCartons += inv.totalCartons || 0;
      }
      if (inv.status === 'تم التسليم') {
        branchData.deliveredCount += 1;
        branchData.deliveredSales += inv.estimatedGrandTotal || 0;
      }
      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة'
      ) {
        branchData.pendingCount += 1;
      }
    });

    return Array.from(branchMap.values());
  }, [branches, invoices]);

  // Overall aggregate sales across all branches
  const totalAllBranchSales = useMemo(() => {
    return branchSalesSummary.reduce((acc, b) => acc + b.totalSales, 0);
  }, [branchSalesSummary]);

  // Filter accessible invoices based on user role and branch selection
  const accessibleInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Branch filter (Dropdown & quick-chip selection)
      if (selectedBranchFilter !== 'الكل' && inv.branchName !== selectedBranchFilter) {
        return false;
      }

      // 2. Strict Role-based scoping (Branch Isolation)
      if (currentUser?.role === 'sales_rep') {
        if (inv.repId !== currentUser.id) return false;
      } else if (currentUser?.role === 'supervisor') {
        // Supervisor STRICTLY sees ONLY his branch and reps under him
        const isSupervisedRep = users.some(
          (u) => u.id === inv.repId && u.supervisorId === currentUser.id
        );
        const isSameBranch = inv.branchName === currentUser.branchName;
        if (!isSameBranch && !isSupervisedRep) return false;
      } else if (currentUser?.role === 'branch_manager') {
        // Branch Manager STRICTLY sees ONLY his own branch
        if (inv.branchName !== currentUser.branchName) return false;
      }

      // 3. Status filter
      if (activeStatusTab !== 'الكل' && inv.status !== activeStatusTab) {
        return false;
      }

      // 4. Rep filter
      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      // 5. Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const numMatch = inv.invoiceNumber?.toLowerCase().includes(q);
        const nameMatch = inv.customerName?.toLowerCase().includes(q);
        const phoneMatch = inv.customerPhone?.includes(q);
        const repMatch = inv.repName?.toLowerCase().includes(q);
        const branchMatch = inv.branchName?.toLowerCase().includes(q);
        if (!numMatch && !nameMatch && !phoneMatch && !repMatch && !branchMatch) {
          return false;
        }
      }

      return true;
    });
  }, [invoices, currentUser, users, selectedBranchFilter, activeStatusTab, selectedRepFilter, searchTerm]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranchFilter, activeStatusTab, selectedRepFilter, searchTerm]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(accessibleInvoices.length / itemsPerPage));
  }, [accessibleInvoices.length, itemsPerPage]);

  const displayedInvoices = useMemo(() => {
    if (itemsPerPage === 'all') return accessibleInvoices;
    const start = (currentPage - 1) * itemsPerPage;
    return accessibleInvoices.slice(start, start + itemsPerPage);
  }, [accessibleInvoices, currentPage, itemsPerPage]);

  // High-Level Dashboard Metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCartons = 0;
    let pendingApprovals = 0;
    let outForDelivery = 0;
    let deliveredCount = 0;
    let deliveredRevenue = 0;
    let returnedCount = 0;
    let returnedRevenue = 0;
    let returnedCartons = 0;

    let approvedCount = 0;
    let preparingCount = 0;

    accessibleInvoices.forEach((inv) => {
      const isApprovedOrActive =
        inv.status === 'معتمدة ومصروفة من المخزن' ||
        inv.status === 'معتمدة' ||
        inv.status === 'جاري التجهيز' ||
        inv.status === 'قيد التوصيل' ||
        inv.status === 'تم التسليم';

      if (isApprovedOrActive) {
        totalRevenue += inv.estimatedGrandTotal || 0;
        totalCartons += inv.totalCartons || 0;
      }

      if (inv.status === 'معتمدة ومصروفة من المخزن' || inv.status === 'معتمدة') {
        approvedCount += 1;
      } else if (inv.status === 'جاري التجهيز') {
        preparingCount += 1;
      }

      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة'
      ) {
        pendingApprovals += 1;
      } else if (inv.status === 'قيد التوصيل') {
        outForDelivery += 1;
      } else if (inv.status === 'تم التسليم') {
        deliveredCount += 1;
        deliveredRevenue += inv.estimatedGrandTotal || 0;
      } else if (inv.status === 'مرتجع') {
        returnedCount += 1;
        returnedRevenue += inv.estimatedGrandTotal || 0;
        returnedCartons += inv.totalCartons || 0;
      }
    });

    const completedInvoices = deliveredCount + approvedCount;
    const inProgressInvoices = preparingCount + outForDelivery + pendingApprovals;
    const totalProcessed = deliveredCount + returnedCount + outForDelivery;
    const deliveryRate = totalProcessed > 0 ? Math.round((deliveredCount / totalProcessed) * 100) : 100;

    return {
      totalRevenue,
      totalCartons,
      pendingApprovals,
      outForDelivery,
      preparingCount,
      approvedCount,
      completedInvoices,
      inProgressInvoices,
      deliveredCount,
      deliveredRevenue,
      returnedCount,
      returnedRevenue,
      returnedCartons,
      deliveryRate,
      shortageInvoicesCount: accessibleInvoices.filter((i) => i.isShortageInvoice || i.hasShortageSplit).length,
    };
  }, [accessibleInvoices]);

  // Product Inventory Metrics
  const productMetrics = useMemo(() => {
    const total = products.length;
    let availableCount = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;

    products.forEach((p) => {
      const branchUnits = p.branchStockActual || 0;
      const mainUnits = p.mainWarehouseActual || 0;
      const totalUnits = branchUnits + mainUnits;
      const cartonUnits = p.cartonQuantity || 1;

      if (totalUnits <= 0) {
        outOfStockCount += 1;
      } else {
        availableCount += 1;
        if (totalUnits <= cartonUnits * 5) {
          lowStockCount += 1;
        }
      }
    });

    return {
      total,
      availableCount,
      outOfStockCount,
      lowStockCount,
    };
  }, [products]);

  // List of unique reps in accessible invoices
  const repsList = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i) => i.repName && set.add(i.repName));
    return ['الكل', ...Array.from(set)];
  }, [invoices]);

  // Reps Performance Table
  const repPerformance = useMemo(() => {
    const map = new Map<string, { name: string; branch: string; orders: number; revenue: number; cartons: number; delivered: number; returned: number }>();
    
    accessibleInvoices.forEach((inv) => {
      const repKey = inv.repName || 'غير محدد';
      const existing = map.get(repKey) || {
        name: repKey,
        branch: inv.branchName || 'الفرع',
        orders: 0,
        revenue: 0,
        cartons: 0,
        delivered: 0,
        returned: 0,
      };

      existing.orders += 1;
      if (inv.status !== 'مرفوضة / ملغاة' && inv.status !== 'ملغاة') {
        existing.revenue += inv.estimatedGrandTotal || 0;
        existing.cartons += inv.totalCartons || 0;
      }
      if (inv.status === 'تم التسليم') existing.delivered += 1;
      if (inv.status === 'مرتجع') existing.returned += 1;

      map.set(repKey, existing);
    });

    return Array.from(map.values());
  }, [accessibleInvoices]);

  // Handlers for Delivery / Return Status Changes
  const handleSetDelivered = (invoice: Invoice) => {
    const res = updateOrderStatus(invoice.id, 'تم التسليم');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleSetOutForDelivery = (invoice: Invoice) => {
    const res = updateOrderStatus(invoice.id, 'قيد التوصيل');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleConfirmReturn = () => {
    if (!returnModalInvoice) return;
    const res = updateOrderStatus(returnModalInvoice.id, 'مرتجع', returnReason);
    if (res.success) {
      setSuccessToast(res.message);
      setReturnModalInvoice(null);
      setTimeout(() => setSuccessToast(null), 4500);
    }
  };

  const handleConfirmReject = () => {
    if (!rejectModalInvoice) return;
    const res = rejectOrder(rejectModalInvoice.id, rejectReason);
    if (res.success) {
      setSuccessToast(res.message);
      setRejectModalInvoice(null);
      setTimeout(() => setSuccessToast(null), 4500);
    }
  };

  const handleApprove = (invoiceId: string) => {
    const res = approveOrder(invoiceId);
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
    'قيد مراجعة المشرف': { bg: 'bg-amber-100 border-amber-300', text: 'text-amber-900', label: 'قيد مراجعة المشرف ⏳' },
    'معلقة بانتظار اعتماد الفرع': { bg: 'bg-blue-100 border-blue-300', text: 'text-blue-900', label: 'بانتظار مدير الفرع 🏛️' },
    'معتمدة ومصروفة من المخزن': { bg: 'bg-indigo-100 border-indigo-300', text: 'text-indigo-900', label: 'معتمدة ومصروفة 📦' },
    'قيد التوصيل': { bg: 'bg-cyan-100 border-cyan-300', text: 'text-cyan-900', label: 'قيد التوصيل 🚚' },
    'تم التسليم': { bg: 'bg-emerald-100 border-emerald-300', text: 'text-emerald-900', label: 'تم التسليم بنجاح ✅' },
    'مرتجع': { bg: 'bg-purple-100 border-purple-300', text: 'text-purple-900', label: 'مرتجع للمخزن ↩️' },
    'مرفوضة / ملغاة': { bg: 'bg-rose-100 border-rose-300', text: 'text-rose-900', label: 'ملغاة / مرفوضة ❌' },
  };

  return (
    <div className="space-y-5 pb-20">
      
      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between text-xs sm:text-sm font-bold animate-in fade-in sticky top-20 z-40">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-emerald-200 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & Role Welcome */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-amber-400 text-slate-950 text-xs font-black px-2.5 py-1 rounded-lg">
                لوحة تحكم المشرفين ومدراء الفروع
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white">
                متابعة طلبيات المناديب والتسليم والمرتجعات
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              متابعة مباشرة لحالات الصرف، التوصيل، التسليم للعملاء، واسترداد المخزون تلقائياً عند تسجيل المرتجع
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenNewOrder && (
              <button
                onClick={onOpenNewOrder}
                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition transform active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء طلبية جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Aggregate KPI Stats Grid - Top Row: Orders Workflow */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          
          {/* Total Revenue */}
          <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 space-y-1">
            <div className="text-[11px] text-slate-400 font-bold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span>إجمالي المبيعات</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-300">
              {formatCurrency(metrics.totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {metrics.totalCartons} كرتونة مباعة
            </div>
          </div>

          {/* Completed Invoices */}
          <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/30 space-y-1">
            <div className="text-[11px] text-emerald-300 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>الفواتير المكتملة</span>
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-400">
              {metrics.completedInvoices} فاتورة
            </div>
            <div className="text-[10px] text-emerald-300/80 font-medium">
              {metrics.deliveredCount} مسلّمة • {metrics.approvedCount} معتمدة
            </div>
          </div>

          {/* In-Progress / Under Prep Invoices */}
          <div className="bg-cyan-500/10 p-3.5 rounded-2xl border border-cyan-500/30 space-y-1">
            <div className="text-[11px] text-cyan-300 font-bold flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-cyan-400" />
              <span>قيد التحضير والتنفيذ</span>
            </div>
            <div className="text-base sm:text-lg font-black text-cyan-300">
              {metrics.inProgressInvoices} طلبية
            </div>
            <div className="text-[10px] text-cyan-300/70 font-medium">
              {metrics.outForDelivery} توصيل • {metrics.preparingCount} تجهيز
            </div>
          </div>

          {/* Pending Approvals */}
          <div className="bg-amber-500/10 p-3.5 rounded-2xl border border-amber-500/30 space-y-1">
            <div className="text-[11px] text-amber-300 font-bold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>بانتظار الاعتماد</span>
            </div>
            <div className="text-base sm:text-lg font-black text-amber-400">
              {metrics.pendingApprovals} طلبية
            </div>
            <div className="text-[10px] text-amber-300/70 font-medium">
              مراجعة المشرف والفرع
            </div>
          </div>

          {/* Shortages & Backorders */}
          <div className="bg-indigo-500/10 p-3.5 rounded-2xl border border-indigo-500/30 space-y-1">
            <div className="text-[11px] text-indigo-300 font-bold flex items-center gap-1">
              <Boxes className="w-3.5 h-3.5 text-indigo-400" />
              <span>فواتير النواقص (-NQ)</span>
            </div>
            <div className="text-base sm:text-lg font-black text-indigo-300">
              {metrics.shortageInvoicesCount} فاتورة
            </div>
            <div className="text-[10px] text-indigo-300/80 font-medium">
              طلب توريد من أكتوبر
            </div>
          </div>

          {/* Returns & Auto Stock Restored */}
          <div className="bg-purple-500/10 p-3.5 rounded-2xl border border-purple-500/30 space-y-1">
            <div className="text-[11px] text-purple-300 font-bold flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
              <span>المرتجعات (المستردة)</span>
            </div>
            <div className="text-base sm:text-lg font-black text-purple-300">
              {metrics.returnedCount} طلبية
            </div>
            <div className="text-[10px] text-purple-300/80 font-medium">
              مسترجع {metrics.returnedCartons} كرتونة
            </div>
          </div>

        </div>

        {/* Product Inventory Summary Cards for Admin & Management */}
        <div className="pt-3 border-t border-slate-800/80">
          <div className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-400" />
            <span>موقف المخزون وحالة توفر المنتجات لشركة دريم:</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Products */}
            <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-700/60 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400 font-bold">إجمالي الأصناف</div>
                <div className="text-lg font-black text-white">{productMetrics.total} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-700/60 text-slate-300 flex items-center justify-center font-bold">
                <Package className="w-4 h-4" />
              </div>
            </div>

            {/* Available In Stock */}
            <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/30 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-emerald-300 font-bold">متوفر بالمخازن</div>
                <div className="text-lg font-black text-emerald-400">{productMetrics.availableCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            {/* Out of Stock (0 units) */}
            <div className="bg-rose-500/10 p-3 rounded-2xl border border-rose-500/30 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-rose-300 font-bold">غير متوفر (0 رصيد)</div>
                <div className="text-lg font-black text-rose-400">{productMetrics.outOfStockCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center font-bold">
                <XCircle className="w-4 h-4" />
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/30 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-amber-300 font-bold">رصيد حرج (قرب النفاذ)</div>
                <div className="text-lg font-black text-amber-400">{productMetrics.lowStockCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stock Level Visibility: Local Branch Stock vs October Central Warehouse */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-amber-500" />
            <h3 className="font-black text-sm text-slate-900">
              متابعة أرصدة المخازن الحالية (مخزن الفرع vs مخزن أكتوبر المركزي)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            تحديث لحظي لجميع الأصناف بالكرتونة والقطع
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {products.slice(0, 4).map((p) => {
            const branchCartons = Math.floor(p.branchStockActual / (p.cartonQuantity || 1));
            const mainCartons = Math.floor(p.mainWarehouseActual / (p.cartonQuantity || 1));
            return (
              <div key={p.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="bg-slate-900 text-amber-300 font-mono text-[10px] px-2 py-0.5 rounded font-black">
                    {p.code}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">شدة: {p.cartonQuantity} ق</span>
                </div>
                <div className="font-bold text-slate-900 text-xs truncate" title={p.name}>
                  {p.name}
                </div>
                
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200">
                  <div className="bg-emerald-50 p-1.5 rounded-xl border border-emerald-200">
                    <div className="text-[9px] text-emerald-800 font-bold">فرعك الحالي:</div>
                    <div className="text-xs font-black text-emerald-950">{branchCartons} كرتونة</div>
                    <div className="text-[9px] text-emerald-700">({p.branchStockActual} قطعة)</div>
                  </div>

                  <div className="bg-amber-50 p-1.5 rounded-xl border border-amber-200">
                    <div className="text-[9px] text-amber-800 font-bold">مخزن أكتوبر:</div>
                    <div className="text-xs font-black text-amber-950">{mainCartons} كرتونة</div>
                    <div className="text-[9px] text-amber-700">({p.mainWarehouseActual} قطعة)</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-Time Branch Sales Performance Tracker (Admin & Developer Overview) */}
      {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <Building className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-slate-900">
                  متابعة مبيعات وأداء الفروع لحظياً (Real-Time Branch Performance)
                </h3>
                <p className="text-xs text-slate-500">
                  إجمالي مبيعات كل فرع، عدد الكراتين المحجوزة، ونسبة التنفيذ المباشرة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">إجمالي مبيعات كافة الفروع:</span>
              <span className="bg-slate-900 text-amber-300 font-black px-3 py-1 rounded-xl text-xs sm:text-sm">
                {formatCurrency(totalAllBranchSales)}
              </span>
            </div>
          </div>

          {/* Branch Interactive Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {branchSalesSummary.map((b) => {
              const isSelected = selectedBranchFilter === b.name;
              return (
                <button
                  key={b.name}
                  onClick={() => setSelectedBranchFilter(isSelected ? 'الكل' : b.name)}
                  className={`text-right p-3.5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-amber-400 shadow-md transform scale-[1.01]'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="space-y-0.5">
                      <div className={`text-xs font-black truncate ${isSelected ? 'text-amber-300' : 'text-slate-900'}`}>
                        {b.name}
                      </div>
                      <div className={`text-[10px] font-medium ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                        {b.city || 'الفرع'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {b.ordersCount} طلبية
                    </span>
                  </div>

                  <div className="pt-3 border-t border-current/10 mt-3 flex items-end justify-between gap-2 w-full">
                    <div>
                      <span className={`text-[10px] block font-bold ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                        إجمالي المبيعات:
                      </span>
                      <strong className={`text-sm sm:text-base font-black ${isSelected ? 'text-white' : 'text-amber-950'}`}>
                        {formatCurrency(b.totalSales)}
                      </strong>
                    </div>
                    <div className={`text-[10px] font-bold text-left ${isSelected ? 'text-emerald-300' : 'text-emerald-700'}`}>
                      {b.totalCartons} كرتونة
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Orders Management Table with Delivery & Return Action Controls */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        
        {/* Table Search & Status Filter Tabs */}
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <span>قائمة الطلبيات ومتابعة دورة التسليم</span>
              <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-0.5 rounded-full font-bold">
                {accessibleInvoices.length} طلبية
              </span>
              {selectedBranchFilter !== 'الكل' && (
                <span className="bg-slate-900 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <span>فرع: {selectedBranchFilter}</span>
                  <button
                    onClick={() => setSelectedBranchFilter('الكل')}
                    className="hover:text-white p-0.5"
                    title="إلغاء تصفية الفرع"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </h3>

            {/* Dropdown Filters: Branch Filter + Rep Filter */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              
              {/* Branch Filter Dropdown for Admin/Developer, Fixed Badge for Branch Users */}
              {(currentUser?.role === 'admin' || currentUser?.role === 'developer') ? (
                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <Building className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-slate-500 font-bold whitespace-nowrap">الفرع:</span>
                  <select
                    value={selectedBranchFilter}
                    onChange={(e) => setSelectedBranchFilter(e.target.value)}
                    className="bg-transparent font-black text-slate-900 focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="الكل">
                      🏢 جميع الفروع ({formatCurrency(totalAllBranchSales)})
                    </option>
                    {branchSalesSummary.map((b) => (
                      <option key={b.name} value={b.name}>
                        📍 {b.name} — ({formatCurrency(b.totalSales)} | {b.totalCartons} كرتونة)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-amber-50/60 px-3 py-2 rounded-xl border border-amber-200">
                  <Building className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span className="text-amber-800 font-bold whitespace-nowrap">فرعك:</span>
                  <span className="font-black text-amber-950 text-xs">
                    {currentUser?.branchName || 'الفرع المحدد'}
                  </span>
                </div>
              )}

              {/* Rep Filter if Supervisor / Manager */}
              {currentUser?.role !== 'sales_rep' && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                  <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-500 font-bold whitespace-nowrap">المندوب:</span>
                  <select
                    value={selectedRepFilter}
                    onChange={(e) => setSelectedRepFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
                  >
                    {repsList.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            </div>
          </div>

          {/* Status Tab Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs">
            {[
              { id: 'الكل', label: 'جميع الحالات', count: invoices.length },
              { id: 'قيد مراجعة المشرف', label: '⏳ مراجعة المشرف', count: invoices.filter((i) => i.status === 'قيد مراجعة المشرف').length },
              { id: 'معلقة بانتظار اعتماد الفرع', label: '🏛️ اعتماد الفرع', count: invoices.filter((i) => i.status === 'معلقة بانتظار اعتماد الفرع').length },
              { id: 'معتمدة ومصروفة من المخزن', label: '📦 معتمدة ومصروفة', count: invoices.filter((i) => i.status === 'معتمدة ومصروفة من المخزن').length },
              { id: 'قيد التوصيل', label: '🚚 قيد التوصيل', count: invoices.filter((i) => i.status === 'قيد التوصيل').length },
              { id: 'تم التسليم', label: '✅ تم التسليم', count: invoices.filter((i) => i.status === 'تم التسليم').length },
              { id: 'مرتجع', label: '↩️ مرتجع', count: invoices.filter((i) => i.status === 'مرتجع').length },
              { id: 'مرفوضة / ملغاة', label: '❌ ملغاة', count: invoices.filter((i) => i.status === 'مرفوضة / ملغاة').length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStatusTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  activeStatusTab === tab.id
                    ? 'bg-slate-900 text-amber-300 shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className="text-[10px] bg-slate-950/20 text-current px-1.5 py-0.2 rounded-full font-bold">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative text-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الفاتورة، اسم العميل، الهاتف، المندوب، الفرع..."
              className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs font-medium"
            />
          </div>
        </div>

        {/* Orders Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          {accessibleInvoices.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="font-bold text-slate-700 text-sm">لا توجد طلبيات مطابقة للفلتر المحدد</div>
              <p className="text-xs text-slate-400">اختر حالة أخرى أو ابحث باسم العميل أو رقم الفاتورة</p>
            </div>
          ) : (
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">رقم الطلبية</th>
                  <th className="p-3.5">العميل / المحل</th>
                  <th className="p-3.5">المندوب والفرع</th>
                  <th className="p-3.5 text-center">الكمية (كراتين)</th>
                  <th className="p-3.5 text-left">قيمة الفاتورة</th>
                  <th className="p-3.5 text-center">حالة الطلبية</th>
                  <th className="p-3.5 text-center">متابعة التسليم والمرتجعات</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((inv) => {
                  const badge = statusBadges[inv.status] || {
                    bg: 'bg-slate-100 border-slate-300',
                    text: 'text-slate-800',
                    label: inv.status,
                  };

                  const isPendingApproval =
                    inv.status === 'قيد مراجعة المشرف' ||
                    inv.status === 'معلقة بانتظار اعتماد الفرع' ||
                    inv.status === 'قيد المراجعة';

                  const canManage =
                    currentUser?.role === 'admin' ||
                    currentUser?.role === 'branch_manager' ||
                    currentUser?.role === 'supervisor';

                  return (
                    <tr key={inv.id} className="hover:bg-amber-50/30 transition">
                      
                      {/* Order Code */}
                      <td className="p-3 font-mono font-black text-slate-900">
                        <span className="bg-slate-100 px-2 py-1 rounded-md text-amber-900 border border-slate-200">
                          {inv.invoiceNumber}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{inv.date}</div>
                      </td>

                      {/* Customer */}
                      <td className="p-3">
                        <div className="font-black text-slate-900 text-xs sm:text-sm">{inv.customerName}</div>
                        <div className="text-[10px] text-slate-400">{inv.customerPhone || '---'}</div>
                      </td>

                      {/* Rep & Branch */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{inv.repName}</div>
                        <div className="text-[10px] text-slate-400">{inv.branchName}</div>
                      </td>

                      {/* Quantities in Cartons */}
                      <td className="p-3 text-center">
                        <div className="font-black text-amber-900 text-sm">{inv.totalCartons} كرتونة</div>
                        <div className="text-[10px] text-slate-500 font-medium">({inv.totalPieces} قطعة)</div>
                      </td>

                      {/* Grand Total */}
                      <td className="p-3 text-left">
                        <div className="font-black text-slate-900 text-sm">
                          {formatCurrency(inv.estimatedGrandTotal)}
                        </div>
                        <div className="text-[10px] text-slate-400">{inv.paymentMethod}</div>
                      </td>

                      {/* Status Badge */}
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Delivery & Return Quick Controls */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          
                          {/* If pending approval: Show Approve / Forward / Reject */}
                          {isPendingApproval && canManage && (
                            <>
                              <button
                                onClick={() => handleApprove(inv.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="اعتماد وصرف المخزون"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>

                              <button
                                onClick={() => setRejectModalInvoice(inv)}
                                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 border border-rose-300 cursor-pointer"
                                title="رفض وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}

                          {/* If approved/dispatched: Show Out for Delivery */}
                          {inv.status === 'معتمدة ومصروفة من المخزن' && (
                            <button
                              onClick={() => handleSetOutForDelivery(inv)}
                              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                              title="تسليم للسائق / بدء التوصيل"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>قيد التوصيل</span>
                            </button>
                          )}

                          {/* If Out for Delivery: Show Delivered or Returned */}
                          {(inv.status === 'قيد التوصيل' || inv.status === 'معتمدة ومصروفة من المخزن') && (
                            <>
                              <button
                                onClick={() => handleSetDelivered(inv)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                title="تأكيد تسليم الطلبية للعميل"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تم التسليم ✅</span>
                              </button>

                              <button
                                onClick={() => setReturnModalInvoice(inv)}
                                className="bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                                title="تسجيل مرتجع وإعادة البضاعة للمخزن"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-purple-700" />
                                <span>مرتجع ↩️</span>
                              </button>
                            </>
                          )}

                          {/* If Delivered: Allow Return in case customer returned later */}
                          {inv.status === 'تم التسليم' && (
                            <button
                              onClick={() => setReturnModalInvoice(inv)}
                              className="bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-900 font-bold px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer border border-slate-200"
                              title="تسجيل مرتجع بعد الاستلام"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
                              <span>مرتجع لاحق</span>
                            </button>
                          )}

                          {/* If Returned: Indicate restored */}
                          {inv.status === 'مرتجع' && (
                            <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded-md border border-purple-200">
                              تم استرداد {inv.totalCartons} كرتونة للمخزن
                            </span>
                          )}

                        </div>
                      </td>

                      {/* General Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {onViewInvoice && (
                            <button
                              onClick={() => onViewInvoice(inv)}
                              className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
                              title="معاينة الفاتورة الإلكترونية"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>عرض</span>
                            </button>
                          )}

                          <button
                            onClick={() => exportElectronicInvoiceToExcel(inv)}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white p-1.5 rounded-lg transition cursor-pointer"
                            title="تصدير شيت إكسل منسق"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => downloadInvoicePDF(inv)}
                            className="bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-lg transition cursor-pointer"
                            title="تحميل فاتورة PDF رسمية"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        {accessibleInvoices.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-700">
                عرض {itemsPerPage === 'all' ? `كافة الطلبيات (${accessibleInvoices.length})` : `${Math.min(accessibleInvoices.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(accessibleInvoices.length, currentPage * itemsPerPage)} من أصل ${accessibleInvoices.length}`}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">في الصفحة:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setItemsPerPage(val);
                  }}
                  className="bg-white border border-slate-300 rounded-xl px-2.5 py-1 font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value={15}>15 طلبية</option>
                  <option value={30}>30 طلبية</option>
                  <option value={50}>50 طلبية</option>
                  <option value="all">عرض الكل ({accessibleInvoices.length})</option>
                </select>
              </div>
            </div>

            {itemsPerPage !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                  title="الصفحة الأولى"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  السابق
                </button>
                <span className="px-2 font-black text-slate-900">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                >
                  التالي
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition cursor-pointer"
                  title="الصفحة الأخيرة"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Return Modal: Automatically Restores Inventory */}
      {returnModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-purple-900">
                <RotateCcw className="w-5 h-5 text-purple-600" />
                <h3 className="font-black text-base">
                  تسجيل مرتجع للطلبية #{returnModalInvoice.invoiceNumber}
                </h3>
              </div>
              <button onClick={() => setReturnModalInvoice(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-200 text-purple-950 p-3.5 rounded-2xl text-xs space-y-1.5">
              <div className="font-black flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-purple-700" />
                <span>إعادة الأصناف للمخزن تلقائياً:</span>
              </div>
              <p className="text-purple-900/90 leading-relaxed">
                سيقوم النظام فوراً بإعادة <strong className="font-black">{returnModalInvoice.totalCartons} كرتونة ({returnModalInvoice.totalPieces} قطعة)</strong> إلى رصيد مخزن الفرع والمخزن الرئيسي وإتاحتها للبيع فوراً لباقي المناديب.
              </p>
            </div>

            {/* Item list breakdown */}
            <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1 text-xs">
              {returnModalInvoice.items.map((item) => (
                <div key={item.productId} className="flex items-center justify-between p-1.5 bg-slate-50 rounded-lg">
                  <div className="font-bold text-slate-800">
                    {item.productName} ({item.productCode})
                  </div>
                  <div className="font-black text-purple-900">
                    +{item.cartonCount} كرتونة ({item.totalUnits} ق)
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1">
              <label className="block font-bold text-slate-700">سبب الإرجاع:</label>
              <textarea
                rows={2}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-400 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleConfirmReturn}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                تأكيد المرتجع وإرجاع المخزون الآن
              </button>
              <button
                onClick={() => setReturnModalInvoice(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-800">
                <XCircle className="w-5 h-5 text-rose-600" />
                <h3 className="font-black text-base">رفض وإلغاء الطلبية</h3>
              </div>
              <button onClick={() => setRejectModalInvoice(null)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              سيتم إلغاء حجز الأصناف وإرجاع الكميات المخصصة للمخزن فوراً.
            </p>

            <div className="text-xs space-y-1">
              <label className="block font-bold text-slate-700">سبب الرفض:</label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-400 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleConfirmReject}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer"
              >
                تأكيد الرفض وفك الحجز
              </button>
              <button
                onClick={() => setRejectModalInvoice(null)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
