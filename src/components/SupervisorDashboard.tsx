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
  ShoppingCart,
  Send,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  X,
  XCircle,
  Trash2
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatGrid } from './ui/StatGrid';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
import { isBranchMatch, isArabicNameMatch } from '../services/arabicMatchingService';
import { Invoice, OrderStatus } from '../types';
import { CreditAuditModal } from './CreditAuditModal';
import { CreditStatusBadge } from './CreditStatusBadge';
import { OrderReturnModal } from './OrderReturnModal';

interface SupervisorDashboardProps {
  onOpenNewOrder?: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({
  onOpenNewOrder,
  onViewInvoice,
}) => {
  const {
    invoices,
    getVisibleInvoices,
    products,
    users,
    currentUser,
    branches,
    selectedBranchFilter,
    setSelectedBranchFilter,
    updateOrderStatus,
    approveOrder,
    resendInvoiceEmail,
    forwardOrderToManager,
    rejectOrder,
    deleteInvoice,
  } = useApp();

  const [activeStatusTab, setActiveStatusTab] = useState<string>('الكل');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRepFilter, setSelectedRepFilter] = useState('الكل');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Pagination state for responsive performance
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(15);

  // Credit & Financial Audit Modal State
  const [auditInvoice, setAuditInvoice] = useState<Invoice | null>(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  // Return Modal State
  const [returnModalInvoice, setReturnModalInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState('رفض الاستلام من العميل / مرتجع بضاعة');

  // Reject Modal State
  const [rejectModalInvoice, setRejectModalInvoice] = useState<Invoice | null>(null);
  const [rejectReason, setRejectReason] = useState('نفاذ الكمية أو عدم استيفاء الشروط');

  // Real-Time Branch Sales Performance Calculation (Strict Branch Isolation)
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

    const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';
    const sourceInvoices = isAdminOrDev ? invoices : getVisibleInvoices();

    // 1. Initialize branches based on permission
    const allowedBranches = isAdminOrDev
      ? branches
      : branches.filter((b) => currentUser?.branchName && isBranchMatch(b.name, currentUser.branchName, { allowUnassigned: false }));

    if (allowedBranches.length === 0 && currentUser?.branchName) {
      branchMap.set(currentUser.branchName, {
        name: currentUser.branchName,
        code: '',
        city: currentUser.branchName.replace('فرع ', ''),
        totalSales: 0,
        totalCartons: 0,
        ordersCount: 0,
        deliveredCount: 0,
        deliveredSales: 0,
        pendingCount: 0,
      });
    } else {
      allowedBranches.forEach((b) => {
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
    }

    // 2. Populate strictly from accessible invoices in real-time
    sourceInvoices.forEach((inv) => {
      const bName = inv.branchName || currentUser?.branchName || 'الفرع الرئيسي (المخزن المركزي - 6 أكتوبر)';
      
      // If non-admin, ensure invoice matches user's branch
      if (!isAdminOrDev && currentUser?.branchName && !isBranchMatch(bName, currentUser.branchName, { allowUnassigned: false })) {
        return;
      }

      if (!branchMap.has(bName)) {
        if (isAdminOrDev) {
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
        } else {
          return;
        }
      }

      const branchData = branchMap.get(bName);
      if (!branchData) return;

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
  }, [branches, invoices, getVisibleInvoices, currentUser]);

  // Overall aggregate sales across visible branches
  const totalAllBranchSales = useMemo(() => {
    return branchSalesSummary.reduce((acc, b) => acc + b.totalSales, 0);
  }, [branchSalesSummary]);

  // Filter accessible invoices based on user role and branch selection (STRICT PRIVACY)
  const accessibleInvoices = useMemo(() => {
    // Start strictly from getVisibleInvoices() which enforces role-based privacy and branch isolation
    const baseInvoices = getVisibleInvoices();

    return baseInvoices.filter((inv) => {
      // 1. Branch filter (Dropdown & quick-chip selection for Admin/Developer)
      if (
        (currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
        selectedBranchFilter !== 'الكل' &&
        inv.branchName !== selectedBranchFilter
      ) {
        return false;
      }

      // 2. Status filter
      if (activeStatusTab !== 'الكل') {
        if (activeStatusTab === 'فواتير النواقص') {
          if (!inv.isShortageInvoice && !(inv.invoiceNumber && inv.invoiceNumber.endsWith('-NQ'))) return false;
        } else if (inv.status !== activeStatusTab) {
          return false;
        }
      }

      // 3. Rep filter
      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      // 4. Search term
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
  }, [getVisibleInvoices, currentUser, selectedBranchFilter, activeStatusTab, selectedRepFilter, searchTerm]);

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
  inv.status === 'تم التسليم' ||
  inv.status === 'إغلاق الطلبية';

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
  } else if (inv.status === 'تم التسليم' || inv.status === 'إغلاق الطلبية') {
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
      shortageInvoicesCount: accessibleInvoices.filter((i) => i.isShortageInvoice || (i.invoiceNumber && i.invoiceNumber.endsWith('-NQ'))).length,
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

  // List of unique reps in accessible invoices (Strict branch privacy)
  const repsList = useMemo(() => {
    const set = new Set<string>();
    accessibleInvoices.forEach((i) => i.repName && set.add(i.repName));
    return ['الكل', ...Array.from(set)];
  }, [accessibleInvoices]);

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

  const getStageNumber = (status: OrderStatus): number => {
    if (status === 'قيد مراجعة المشرف' || status === 'معلقة بانتظار اعتماد الفرع' || status === 'قيد المراجعة') return 1;
    if (status === 'جاري تحضير المنتجات' || status === 'معتمدة ومصروفة من المخزن' || status === 'معتمدة') return 2;
    if (status === 'تم وصول المنتجات') return 3;
    if (status === 'قيد التوصيل') return 4;
    if (status === 'تم التسليم') return 5;
    if (status === 'إغلاق الطلبية') return 6;
    return 0; // Returned or Rejected
  };

  const statusBadges: Record<string, { bg: string; text: string; label: string }> = {
    'قيد مراجعة المشرف': { bg: 'tint-warn', text: '', label: 'قيد مراجعة المشرف' },
    'معلقة بانتظار اعتماد الفرع': { bg: 'tint-navy', text: '', label: 'بانتظار مدير الفرع' },
    'جاري تحضير المنتجات': { bg: 'tint-warn', text: '', label: 'جاري تحضير المنتجات' },
    'تم وصول المنتجات': { bg: 'tint-ok', text: '', label: 'تم وصول المنتجات' },
    'معتمدة ومصروفة من المخزن': { bg: 'tint-navy', text: '', label: 'معتمدة ومصروفة' },
    'قيد التوصيل': { bg: 'tint-navy', text: '', label: 'قيد التوصيل' },
    'تم التسليم': { bg: 'tint-ok', text: '', label: 'تم التسليم بنجاح' },
    'إغلاق الطلبية': { bg: 'bg-[#f4f7fa] text-slate-700', text: 'border-slate-200', label: 'تم إغلاق الطلبية' },
    'مرتجع': { bg: 'tint-risk', text: '', label: 'مرتجع للمخزن' },
    'مرفوضة / ملغاة': { bg: 'tint-risk', text: '', label: 'ملغاة / مرفوضة' },
  };

  return (
    <div className="tantawy-screen space-y-5 pb-20">
      
      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-[var(--app-ok)] text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between text-xs sm:text-sm font-bold animate-in fade-in sticky top-20 z-40">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-white/80 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-white/80 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Header & Role Welcome */}
      <div className="bg-[#102b4e] text-white rounded-3xl p-5 sm:p-6 shadow-sm border border-[#23496f] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-brass-dark text-xs font-black px-2.5 py-1 rounded-lg">
                {currentUser?.role === 'sales_rep'
                  ? 'لوحة تحكم وطلبيات المندوب (Rep Command Center)'
                  : currentUser?.role === 'supervisor'
                  ? 'لوحة إشراف واعتماد الطلبيات (Supervisor Hub)'
                  : currentUser?.role === 'branch_manager'
                  ? 'لوحة إدارة الفرع والاعتمادات (Branch Manager Hub)'
                  : 'لوحة الإدارة العامة والتحكم المركزي (HQ Command Center)'}
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white">
                {currentUser?.role === 'sales_rep'
                  ? `مرحباً بك: ${currentUser.name} — متابعة مبيعاتك وطلبياتك والتسليم`
                  : 'متابعة طلبيات المناديب والتسليم والمرتجعات'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              {currentUser?.role === 'sales_rep'
                ? `فرعك: ${currentUser.branchName || 'الفرع المحدد'} | متابعة فورية لحالات طلبياتك ومراحل الصرف والتوصيل للعملاء.`
                : 'متابعة مباشرة لحالات الصرف، التوصيل، التسليم للعملاء، واسترداد المخزون تلقائياً عند تسجيل المرتجع.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenNewOrder && (
              <button
                onClick={onOpenNewOrder}
                className="btn-brass px-4 py-2.5 text-xs shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء طلبية جديدة</span>
              </button>
            )}
          </div>
        </div>

        {/* Aggregate KPI Stats Grid - Top Row: Orders Workflow */}
        <StatGrid visible={4} tone="dark" className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2" moreLabel="عرض باقي المؤشرات">

          {/* Total Revenue */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">{currentUser?.role === 'sales_rep' ? 'إجمالي مبيعاتي' : 'إجمالي المبيعات'}</span>
              <div className="w-7 h-7 rounded-lg bg-[var(--app-navy)] text-white flex items-center justify-center shrink-0">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-lg dream-amt text-[var(--app-navy)]">
              {formatCurrency(metrics.totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold">
              {metrics.totalCartons} كرتونة مباعة
            </div>
          </div>

          {/* Completed Invoices */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">{currentUser?.role === 'sales_rep' ? 'طلبياتي المسلّمة' : 'الفواتير المكتملة'}</span>
              <div className="w-7 h-7 rounded-lg bg-[#e8f3ee] t-ok flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-lg dream-amt text-[var(--app-navy)]">
              {metrics.completedInvoices} فاتورة
            </div>
            <div className="text-[10px] dream-amt t-ok font-bold">
              {metrics.deliveredCount} مسلّمة • {metrics.approvedCount} معتمدة
            </div>
          </div>

          {/* In-Progress / Under Prep Invoices */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">قيد التحضير والتنفيذ</span>
              <div className="w-7 h-7 rounded-lg bg-[var(--app-navy)] text-white flex items-center justify-center shrink-0">
                <Truck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-lg dream-amt text-[var(--app-navy)]">
              {metrics.inProgressInvoices} طلبية
            </div>
            <div className="text-[10px] text-slate-500 font-semibold dream-amt">
              <span className="t-ok">{metrics.outForDelivery} توصيل</span> • <span className="t-warn">{metrics.preparingCount} تجهيز</span>
            </div>
          </div>

          {/* Pending Approvals — the single brass-tinted KPI highlight */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] dream-amt t-warn font-bold">بانتظار الاعتماد</span>
              <div className="w-7 h-7 rounded-lg icon-brass flex items-center justify-center shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-lg dream-amt text-[var(--app-navy)]">
              {metrics.pendingApprovals} طلبية
            </div>
            <div className="text-[10px] text-[var(--app-warn)] font-semibold">
              مراجعة المشرف والفرع
            </div>
          </div>

          {/* Shortages & Backorders */}
          <button
            type="button"
            onClick={() => setActiveStatusTab(activeStatusTab === 'فواتير النواقص' ? 'الكل' : 'فواتير النواقص')}
            className={`p-3.5 rounded-2xl border space-y-1.5 text-right transition cursor-pointer ${
              activeStatusTab === 'فواتير النواقص'
                ? 'navy-panel text-white border-transparent shadow-[inset_0_-3px_0_var(--app-accent)]'
                : 'bg-white hover:bg-[#f8fafc] text-slate-600 border-slate-200'
            }`}
          >
            <div className={`flex items-center justify-between gap-1 text-[11px] font-bold ${activeStatusTab === 'فواتير النواقص' ? 'text-[#ecc987]' : 'text-slate-500'}`}>
              <span>فواتير النواقص (-NQ)</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${activeStatusTab === 'فواتير النواقص' ? 'bg-white/10 text-[#ecc987]' : 'bg-[var(--app-navy)] text-white'}`}>
                <Boxes className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className={`text-base sm:text-lg dream-amt ${activeStatusTab === 'فواتير النواقص' ? 'text-white' : 'text-[var(--app-navy)]'}`}>
              {metrics.shortageInvoicesCount} فاتورة
            </div>
            <div className={`text-[10px] font-semibold ${activeStatusTab === 'فواتير النواقص' ? 'text-white/70' : 'text-slate-500'}`}>
              طلب توريد من أكتوبر (اضغط للتصفية)
            </div>
          </button>

          {/* Returns & Auto Stock Restored */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-500 font-bold">المرتجعات (المستردة)</span>
              <div className="w-7 h-7 rounded-lg bg-[#f9eaea] t-risk flex items-center justify-center shrink-0">
                <RotateCcw className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-base sm:text-lg dream-amt text-[var(--app-navy)]">
              {metrics.returnedCount} طلبية
            </div>
            <div className="text-[10px] dream-amt t-risk font-semibold">
              مسترجع {metrics.returnedCartons} كرتونة
            </div>
          </div>

        </StatGrid>

        {/* Product Inventory Summary Cards for Admin & Management */}
        <div className="pt-3 border-t border-white/15">
          <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
            <Package className="w-4 h-4 t-brass" />
            <span>موقف المخزون وحالة توفر المنتجات لشركة دريم:</span>
          </div>

          <StatGrid visible={0} tone="dark" className="grid grid-cols-2 sm:grid-cols-4 gap-3" moreLabel="عرض موقف المخزون">
            {/* Total Products */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 font-bold">إجمالي الأصناف</div>
                <div className="text-lg dream-amt text-[var(--app-navy)]">{productMetrics.total} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[var(--app-navy)] text-white flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" />
              </div>
            </div>

            {/* Available In Stock */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 font-bold">متوفر بالمخازن</div>
                <div className="text-lg dream-amt t-ok">{productMetrics.availableCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#e8f3ee] t-ok flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            {/* Out of Stock (0 units) */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 font-bold">غير متوفر (0 رصيد)</div>
                <div className="text-lg dream-amt t-risk">{productMetrics.outOfStockCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#f9eaea] t-risk flex items-center justify-center shrink-0">
                <XCircle className="w-4 h-4" />
              </div>
            </div>

            {/* Low Stock Alerts */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-500 font-bold">رصيد حرج (قرب النفاذ)</div>
                <div className="text-lg dream-amt t-warn">{productMetrics.lowStockCount} صنف</div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-[#f7f0e1] t-warn flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
          </StatGrid>
        </div>
      </div>

      {/* Real-Time Branch Sales Performance Tracker (Admin & Developer Overview) */}
      {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl icon-brass-dark flex items-center justify-center shrink-0">
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

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500">إجمالي مبيعات كافة الفروع:</span>
              <span className="navy-panel text-[#ecc987] dream-amt px-3 py-1 rounded-xl text-xs sm:text-sm">
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
                      ? 'navy-panel text-white border-transparent shadow-[inset_0_-3px_0_var(--app-accent),0_4px_12px_rgba(16,43,78,.22)]'
                      : 'bg-white hover:bg-[#f8fafc] text-slate-900 border-slate-200 hover:border-[#b8c9db]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div className="space-y-0.5">
                      <div className={`text-xs font-black truncate ${isSelected ? 'text-[#ecc987]' : 'text-slate-900'}`}>
                        {b.name}
                      </div>
                      <div className={`text-[10px] font-medium ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        {b.city || 'الفرع'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isSelected
                          ? 'bg-[var(--app-accent)] text-[#231a05]'
                          : 'bg-[#f4f7fa] text-slate-600 border border-slate-200'
                      }`}
                    >
                      {b.ordersCount} طلبية
                    </span>
                  </div>

                  <div className="pt-3 border-t border-current/10 mt-3 flex items-end justify-between gap-2 w-full">
                    <div>
                      <span className={`text-[10px] block font-bold ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        إجمالي المبيعات:
                      </span>
                      <strong className={`text-sm sm:text-base dream-amt ${isSelected ? 'text-white' : 'text-[var(--app-navy)]'}`}>
                        {formatCurrency(b.totalSales)}
                      </strong>
                    </div>
                    <div className={`text-[10px] dream-amt font-bold ${isSelected ? 'text-[#a9d3bd]' : 't-ok'}`}>
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
              <span className="tint-brass text-xs px-2.5 py-0.5 rounded-full dream-amt">
                {accessibleInvoices.length} طلبية
              </span>
              {selectedBranchFilter !== 'الكل' && (
                <span className="navy-panel text-[#ecc987] text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
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
                <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <Building className="w-3.5 h-3.5 text-[var(--app-warn)] shrink-0" />
                  <span className="text-slate-500 font-bold whitespace-nowrap">الفرع:</span>
                  <select
                    value={selectedBranchFilter}
                    onChange={(e) => setSelectedBranchFilter(e.target.value)}
                    className="bg-transparent font-black text-slate-900 focus:outline-none cursor-pointer text-xs"
                  >
                    <option value="الكل">
                      جميع الفروع ({formatCurrency(totalAllBranchSales)})
                    </option>
                    {branchSalesSummary.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} — ({formatCurrency(b.totalSales)} | {b.totalCartons} كرتونة)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <Building className="w-3.5 h-3.5 text-[var(--app-warn)] shrink-0" />
                  <span className="t-warn font-bold whitespace-nowrap">فرعك:</span>
                  <span className="dream-amt text-[var(--app-navy)] text-xs">
                    {currentUser?.branchName || 'الفرع المحدد'}
                  </span>
                </div>
              )}

              {/* Rep Filter if Supervisor / Manager */}
              {currentUser?.role !== 'sales_rep' && (
                <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
              { id: 'الكل', label: 'جميع الحالات', count: accessibleInvoices.length },
              { id: 'قيد مراجعة المشرف', label: 'مراجعة المشرف', count: accessibleInvoices.filter((i) => i.status === 'قيد مراجعة المشرف').length },
              { id: 'معلقة بانتظار اعتماد الفرع', label: 'اعتماد الفرع', count: accessibleInvoices.filter((i) => i.status === 'معلقة بانتظار اعتماد الفرع').length },
              { id: 'جاري تحضير المنتجات', label: 'جاري التحضير', count: accessibleInvoices.filter((i) => i.status === 'جاري تحضير المنتجات').length },
              { id: 'تم وصول المنتجات', label: 'وصول المنتجات', count: accessibleInvoices.filter((i) => i.status === 'تم وصول المنتجات').length },
              { id: 'معتمدة ومصروفة من المخزن', label: 'معتمدة ومصروفة', count: accessibleInvoices.filter((i) => i.status === 'معتمدة ومصروفة من المخزن').length },
              { id: 'قيد التوصيل', label: 'قيد التوصيل', count: accessibleInvoices.filter((i) => i.status === 'قيد التوصيل').length },
              { id: 'تم التسليم', label: 'تم التسليم', count: accessibleInvoices.filter((i) => i.status === 'تم التسليم').length },
              { id: 'إغلاق الطلبية', label: 'إغلاق الطلبية', count: accessibleInvoices.filter((i) => i.status === 'إغلاق الطلبية').length },
              { id: 'فواتير النواقص', label: 'فواتير النواقص (-NQ)', count: accessibleInvoices.filter((i) => i.isShortageInvoice || (i.invoiceNumber && i.invoiceNumber.endsWith('-NQ'))).length },
              { id: 'مرتجع', label: 'مرتجع', count: accessibleInvoices.filter((i) => i.status === 'مرتجع').length },
              { id: 'مرفوضة / ملغاة', label: 'ملغاة', count: accessibleInvoices.filter((i) => i.status === 'مرفوضة / ملغاة').length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStatusTab(tab.id)}
                className={`px-3 py-1.5 pill-filter text-xs whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  activeStatusTab === tab.id ? 'on' : ''
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeStatusTab === tab.id ? 'bg-white/15 text-white' : 'bg-[#f2f6fa] text-[var(--app-muted)]'
                  }`}>
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
              className="w-full pl-3 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none text-xs font-medium"
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
                  <th className="p-3.5">العميل وموقف المديونية</th>
                  <th className="p-3.5">المندوب والفرع</th>
                  <th className="p-3.5 text-center">الكمية (كراتين)</th>
                  <th className="p-3.5 text-left">قيمة الفاتورة</th>
                  <th className="p-3.5 text-center">حالة الطلبية</th>
                  <th className="p-3.5 text-center">مسار ودورة الطلبية (Lifecycle)</th>
                  <th className="p-3.5 text-center">إجراءات المتابعة والتحكم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((inv) => {
                  const badge = statusBadges[inv.status] || {
                    bg: 'bg-[#f4f7fa] text-slate-700',
                    text: 'border-slate-200',
                    label: inv.status,
                  };

                  const isPendingApproval =
                    inv.status === 'قيد مراجعة المشرف' ||
                    inv.status === 'معلقة بانتظار اعتماد الفرع' ||
                    inv.status === 'قيد المراجعة';

                  const canManage =
                    currentUser?.role === 'admin' ||
                    currentUser?.role === 'developer' ||
                    currentUser?.role === 'branch_manager' ||
                    currentUser?.role === 'supervisor';

                  const isRep = currentUser?.role === 'sales_rep';

                  const debtBefore = inv.customerBalanceBefore || 0;
                  const debtAfter = inv.customerBalanceAfter || (debtBefore + inv.estimatedGrandTotal);
                  const creditLimit = Number(inv.customerCreditLimit || 0);
                  const hasNoCredit = creditLimit <= 0;
                  const isExceeded = !hasNoCredit && (inv.creditLimitExceeded ?? (debtAfter > creditLimit));
                  const stageNum = getStageNumber(inv.status);

                  return (
                    <tr key={inv.id} className="transition">
                      
                      {/* Order Code */}
                      <td className="p-3 font-mono font-black text-slate-900">
                        <span className="bg-[#f4f7fa] px-2 py-1 rounded-md text-[var(--app-navy)] border border-slate-200 dream-amt block w-fit">
                          {inv.invoiceNumber}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{inv.date}</div>
                        {inv.isShortageInvoice && (
                          <span className="tint-warn text-[9px] font-bold px-1.5 py-0.5 rounded block w-fit mt-1">
                            فاتورة نواقص (مخزن أكتوبر)
                          </span>
                        )}
                        {inv.hasShortageSplit && (
                          <span className="tint-ok text-[9px] font-bold px-1.5 py-0.5 rounded block w-fit mt-1">
                            أصناف متوفرة (بالمخزن)
                          </span>
                        )}
                        {!inv.isShortageInvoice && !inv.hasShortageSplit && (
                          <span className="tint-ok text-[9px] font-bold px-1.5 py-0.5 rounded block w-fit mt-1">
                            فاتورة مكتملة متوفرة بالمخزن
                          </span>
                        )}
                      </td>

                      {/* Customer & Debt Breakdown with Distinctive Credit Widget */}
                      <td className="p-3 min-w-[200px]">
                        <div className="font-black text-slate-900 text-xs sm:text-sm mb-1">{inv.customerName}</div>
                        
                        {/* Financial Snapshot Widget (الحد الائتماني والمديونية وقيمة الفاتورة والتجاوز) */}
                        <CreditStatusBadge
                          invoice={inv}
                          onClick={() => {
                            setAuditInvoice(inv);
                            setIsAuditOpen(true);
                          }}
                        />
                      </td>

                      {/* Rep & Branch */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{inv.repName}</div>
                        <div className="text-[10px] text-slate-400">{inv.branchName}</div>
                      </td>

                      {/* Quantities in Cartons */}
                      <td className="p-3 text-center">
                        <div className="dream-amt text-[var(--app-navy)] text-sm">{inv.totalCartons} كرتونة</div>
                        <div className="text-[10px] text-slate-500 font-medium dream-amt">({inv.totalPieces} قطعة)</div>
                      </td>

                      {/* Grand Total */}
                      <td className="p-3 text-left">
                        <div className="dream-amt text-[var(--app-navy)] text-sm">
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

                      {/* Order Lifecycle Progress Stepper */}
                      <td className="p-3">
                        <div className="min-w-[200px] max-w-[240px] mx-auto space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                            <span className={stageNum >= 1 ? 't-navy font-black' : ''}>مراجعة</span>
                            <span className={stageNum >= 2 ? 't-navy font-black' : ''}>تحضير</span>
                            <span className={stageNum >= 3 ? 't-navy font-black' : ''}>وصول</span>
                            <span className={stageNum >= 4 ? 't-navy font-black' : ''}>توصيل</span>
                            <span className={stageNum >= 5 ? 't-ok font-black' : ''}>تسليم</span>
                            <span className={stageNum >= 6 ? 't-navy font-black' : ''}>إغلاق</span>
                          </div>

                          {/* Progress Line */}
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                            <div
                              className={`h-full transition-all duration-300 ${
                                inv.status === 'مرتجع'
                                  ? 'bg-[var(--app-warn)] w-full'
                                  : inv.status === 'مرفوضة / ملغاة'
                                  ? 'bg-[var(--app-risk)] w-full'
                                  : stageNum === 6
                                  ? 'bg-[var(--app-navy)] w-full'
                                  : stageNum === 5
                                  ? 'bg-[var(--app-ok)] w-[83%]'
                                  : stageNum === 4
                                  ? 'bg-[var(--app-navy)] w-[66%]'
                                  : stageNum === 3
                                  ? 'bg-[var(--app-navy)] w-[50%]'
                                  : stageNum === 2
                                  ? 'bg-[var(--app-navy)] w-[33%]'
                                  : 'bg-[var(--app-accent)] w-[16%]'
                              }`}
                            />
                          </div>

                          <div className="text-[10px] text-center font-bold">
                            {inv.status === 'مرتجع' && <span className="t-warn">مرتجع إلى مخزن الفرع</span>}
                            {inv.status === 'مرفوضة / ملغاة' && <span className="t-risk">ملغاة / مرفوضة</span>}
                            {inv.status === 'قيد مراجعة المشرف' && <span className="t-warn">بانتظار موافقة المشرف</span>}
                            {inv.status === 'معلقة بانتظار اعتماد الفرع' && <span className="t-navy">بانتظار مدير الفرع</span>}
                            {inv.status === 'جاري تحضير المنتجات' && <span className="t-warn">جاري التجهيز بالمخزن</span>}
                            {inv.status === 'معتمدة ومصروفة من المخزن' && <span className="t-navy">تم الصرف من المخزن</span>}
                            {inv.status === 'تم وصول المنتجات' && <span className="t-ok">جاهزة بالفرع للتوزيع</span>}
                            {inv.status === 'قيد التوصيل' && <span className="t-navy font-black animate-pulse">جاري التوصيل للعميل</span>}
                            {inv.status === 'تم التسليم' && <span className="t-ok font-black">تم الاستلام والتحصيل</span>}
                            {inv.status === 'إغلاق الطلبية' && <span className="t-navy font-black">تم التقفيل والتسوية المالية</span>}
                          </div>
                        </div>
                      </td>

                      {/* Delivery & Workflow Action Controls */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          
                          {/* 1. If Pending Approval: Approve -> (جاري تحضير المنتجات) or Reject */}
                          {isPendingApproval && canManage && (
                            <>
                              <button
                                onClick={() => {
                                  approveOrder(inv.id);
                                  updateOrderStatus(inv.id, 'جاري تحضير المنتجات');
                                      setSuccessToast(`تم اعتماد الطلبية رقم ${inv.invoiceNumber} وبدء تحضير المنتجات`);
                                  setTimeout(() => setSuccessToast(null), 4000);
                                }}
                                className="app-btn app-btn-ok px-2 py-1 text-xs"
                                title="اعتماد وبدء تحضير المنتجات"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد وتحضير</span>
                              </button>

                              <button
                                onClick={() => setRejectModalInvoice(inv)}
                                className="app-btn app-btn-risk-soft px-2 py-1 text-xs"
                                title="رفض وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}

                          {/* Active stages (Preparation, Stock Dispatched, Arrived, Out for Delivery): Supervisor / Manager can cancel anytime */}
                          {!isPendingApproval && inv.status !== 'تم التسليم' && inv.status !== 'إغلاق الطلبية' && inv.status !== 'مرتجع' && inv.status !== 'مرفوضة / ملغاة' && canManage && (
                            <button
                              onClick={() => setRejectModalInvoice(inv)}
                              className="app-btn app-btn-risk-soft px-2 py-1 text-xs"
                              title="إلغاء الطلبية في أي وقت وإرجاع الكميات للمخزن"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>إلغاء الطلبية</span>
                            </button>
                          )}
                          {(inv.status === 'جاري تحضير المنتجات' || inv.status === 'معتمدة ومصروفة من المخزن') && canManage && (
                            <>
                              <button
                                onClick={() => {
                                  const res = updateOrderStatus(inv.id, 'تم وصول المنتجات');
                                  if (res.success) {
                                    setSuccessToast(`تم تسجيل وصول منتجات الطلبية ${inv.invoiceNumber}`);
                                    setTimeout(() => setSuccessToast(null), 4000);
                                  }
                                }}
                                className="app-btn app-btn-primary px-2 py-1 text-xs"
                                title="تأكيد وصول المنتجات للفرع/المنطقة"
                              >
                                <Building className="w-3.5 h-3.5" />
                                <span>وصول بالفرع</span>
                              </button>

                              <button
                                onClick={() => handleSetOutForDelivery(inv)}
                                className="app-btn app-btn-primary px-2 py-1 text-xs"
                                title="تسليم للسائق / بدء التوصيل"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>قيد التوصيل</span>
                              </button>
                            </>
                          )}

                          {/* 3. If Arrived: Move to Out for Delivery or Direct Delivery */}
                          {inv.status === 'تم وصول المنتجات' && canManage && (
                            <>
                              <button
                                onClick={() => handleSetOutForDelivery(inv)}
                                className="app-btn app-btn-primary px-2 py-1 text-xs"
                                title="تسليم للسائق / بدء التوصيل"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>خروج للتوصيل</span>
                              </button>

                              <button
                                onClick={() => handleSetDelivered(inv)}
                                className="app-btn app-btn-ok px-2 py-1 text-xs"
                                title="تأكيد تسليم الطلبية للعميل"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تم التسليم</span>
                              </button>
                            </>
                          )}

                          {/* 4. If Out for Delivery: Both Rep and Manager can mark Delivered or Returned */}
                          {inv.status === 'قيد التوصيل' && (
                            <>
                              <button
                                onClick={() => handleSetDelivered(inv)}
                                className="app-btn app-btn-primary px-2.5 py-1 text-xs"
                                title="تأكيد تسليم الطلبية للعميل وتحصيل المبلغ"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>تم التسليم</span>
                              </button>

                              <button
                                onClick={() => setReturnModalInvoice(inv)}
                                className="app-btn app-btn-warn-soft px-2 py-1 text-xs"
                                title="تسجيل مرتجع وإعادة البضاعة للمخزن"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>مرتجع</span>
                              </button>
                            </>
                          )}

                          {/* 5. If Delivered: Close Order or Return */}
                          {inv.status === 'تم التسليم' && (
                            <>
                              {canManage && (
                                <button
                                  onClick={() => {
                                    const res = updateOrderStatus(inv.id, 'إغلاق الطلبية');
                                    if (res.success) {
                                      setSuccessToast(`تم إغلاق وتسوية الطلبية ${inv.invoiceNumber} بنجاح`);
                                      setTimeout(() => setSuccessToast(null), 4000);
                                    }
                                  }}
                                  className="app-btn app-btn-primary px-2 py-1 text-xs"
                                  title="إغلاق وتسوية الطلبية نهائياً"
                                >
                                  <span>إغلاق الطلبية</span>
                                </button>
                              )}

                              <button
                                onClick={() => setReturnModalInvoice(inv)}
                                className="app-btn app-btn-warn-soft px-2 py-1 text-xs"
                                title="تسجيل مرتجع بعد الاستلام"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>مرتجع لاحق</span>
                              </button>
                            </>
                          )}

                          {/* 6. If Closed: Display Final Closed Badge with Return Option */}
                          {inv.status === 'إغلاق الطلبية' && (
                            <div className="flex items-center gap-1.5">
                              <span className="t-navy bg-[#f4f7fa] text-[10px] dream-amt px-2 py-0.5 rounded-md border border-slate-200">
                                مغلقة ومكتملة
                              </span>
                              {canManage && (
                                <button
                                  onClick={() => setReturnModalInvoice(inv)}
                                  className="app-btn app-btn-warn-soft px-2 py-1 text-xs"
                                  title="تسجيل إذن مرتجع مبيعات (كلي أو جزئي) على طلبية مغلقة"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>مرتجع</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* If Partially Returned: Display Badge and Option to Add Another Return */}
                          {inv.status === 'مرتجع جزئي' && (
                            <div className="flex items-center gap-1.5">
                              <span className="tint-warn text-[10px] dream-amt px-2 py-0.5 rounded-md">
                                مرتجع جزئي
                              </span>
                              {canManage && (
                                <button
                                  onClick={() => setReturnModalInvoice(inv)}
                                  className="app-btn app-btn-warn-soft px-2 py-1 text-xs"
                                  title="تسجيل إذن مرتجع إضافي لباقي الأصناف"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>إضافة مرتجع</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* If Returned: Indicate restored */}
                          {inv.status === 'مرتجع' && (
                            <span className="tint-warn text-[10px] dream-amt px-2 py-0.5 rounded-md font-bold">
                              تم استرداد {inv.totalCartons} كرتونة للمخزن
                            </span>
                          )}

                          {/* General Actions: View, Excel, PDF */}
  {['admin', 'developer', 'branch_manager', 'supervisor'].includes(currentUser?.role || '') &&
  ['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(inv.status) && (
  <button
  onClick={async () => {
  const result = await resendInvoiceEmail(inv.id);
  setSuccessToast(result.message);
  setTimeout(() => setSuccessToast(null), 4500);
  }}
  className="app-btn app-btn-ghost px-2 py-1 text-xs"
  title="إعادة إرسال الفاتورة بالبريد مع PDF وExcel"
  >
  <Send className="w-3.5 h-3.5" />
  <span>إعادة الإرسال على الميل</span>
  </button>
  )}

  {onViewInvoice && (
  <button
  onClick={() => onViewInvoice(inv)}
                              className="app-btn app-btn-primary px-2 py-1 text-xs"
                              title="معاينة الفاتورة الإلكترونية"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>عرض</span>
                            </button>
                          )}

                          <button
                            onClick={() => exportElectronicInvoiceToExcel(inv)}
                            className="chip-btn p-1.5"
                            title="تصدير شيت إكسل منسق"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => downloadInvoicePDF(inv)}
                            className="chip-btn p-1.5"
                            title="تحميل فاتورة PDF رسمية"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete (Admin & Developer only) */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`هل أنت متأكد من حذف الفاتورة رقم ${inv.invoiceNumber} نهائياً من النظام والسيرفر؟`)) {
                                  await deleteInvoice(inv.id);
                                  setSuccessToast(`تم حذف الفاتورة رقم ${inv.invoiceNumber} نهائياً بنجاح`);
                                  setTimeout(() => setSuccessToast(null), 3500);
                                }
                              }}
                              className="chip-btn danger p-1.5"
                              title="حذف الفاتورة نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}

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
              <span className="font-bold text-slate-700 dream-amt">
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
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-slate-800 focus:outline-none cursor-pointer dream-amt"
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
                  className="chip-btn p-1.5 disabled:opacity-40"
                  title="الصفحة الأولى"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="chip-btn px-2.5 py-1 font-bold disabled:opacity-40"
                >
                  السابق
                </button>
                <span className="px-2 dream-amt text-[var(--app-navy)]">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="chip-btn px-2.5 py-1 font-bold disabled:opacity-40"
                >
                  التالي
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="chip-btn p-1.5 disabled:opacity-40"
                  title="الصفحة الأخيرة"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Advanced Return Modal: Supports Itemized & Full Returns on Delivered/Closed/Active Orders */}
      {returnModalInvoice && (
        <OrderReturnModal
          invoice={returnModalInvoice}
          isOpen={Boolean(returnModalInvoice)}
          onClose={() => setReturnModalInvoice(null)}
          onSuccess={(msg) => {
            setSuccessToast(msg);
            setTimeout(() => setSuccessToast(null), 6000);
          }}
        />
      )}

      {/* Reject / Cancel Order Modal */}
      {rejectModalInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-[var(--app-risk)]">
                <XCircle className="w-6 h-6" />
                <div>
                  <h3 className="font-black text-base">إلغاء أو رفض الطلبية #{rejectModalInvoice.invoiceNumber}</h3>
                  <div className="text-[11px] text-slate-500 font-medium">العميل: {rejectModalInvoice.customerName} ({rejectModalInvoice.branchName || 'الفرع'})</div>
                </div>
              </div>
              <button onClick={() => setRejectModalInvoice(null)} className="p-1 hover:bg-slate-100 rounded-xl transition cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="bg-[#fdf1f1] border border-[rgba(179,74,74,.28)] text-[#9c4343] p-3.5 rounded-2xl text-xs space-y-1.5">
              <div className="font-black flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>إرجاع البضاعة والمخزون فوراً:</span>
              </div>
              <p className="leading-relaxed">
                سيقوم النظام فوراً بإلغاء الطلبية وإرجاع <strong className="font-black">{rejectModalInvoice.totalCartons} كرتونة ({rejectModalInvoice.totalPieces} قطعة)</strong> إلى رصيد المخزن الفعلي والمحجوز وإتاحتها للبيع فوراً لباقي المناديب.
              </p>
            </div>

            {/* Quick Reason Presets */}
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700 text-xs">أسباب الإلغاء الشائعة (اختر سريعاً):</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'طلب العميل إلغاء الطلبية',
                  'عدم توافر وسيلة نقل / تأجيل خط السير',
                  'تجاوز الحد الائتماني وتعديل الأصناف',
                  'خطأ في تسجيل الكميات أو الأصناف',
                  'قرار إداري من مدير الفرع / المشرف',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setRejectReason(reasonText)}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                      rejectReason === reasonText
                        ? 'tint-risk font-black'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-[#f8fafc]'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-1">
              <label className="block font-bold text-slate-700">بيان وسبب الإلغاء:</label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="اكتب سبب إلغاء أو رفض الطلبية بالتفصيل..."
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleConfirmReject}
                className="app-btn app-btn-risk flex-1 py-2.5 text-xs"
              >
                <XCircle className="w-4 h-4" />
                <span>تأكيد إلغاء الطلبية واسترجاع المخزون</span>
              </button>
              <button
                onClick={() => setRejectModalInvoice(null)}
                className="btn-ghost px-4 py-2.5 text-xs"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit & Financial Audit Modal */}
      {isAuditOpen && auditInvoice && (
        <CreditAuditModal
          invoice={auditInvoice}
          isOpen={isAuditOpen}
          onClose={() => {
            setIsAuditOpen(false);
            setAuditInvoice(null);
          }}
          onViewInvoice={onViewInvoice}
          onApprove={(id) => {
            updateOrderStatus(id, 'جاري تحضير المنتجات');
            setSuccessToast('تم اعتماد الطلبية بنجاح وتحويلها للمخزن!');
          }}
          onReject={(inv) => {
            setRejectModalInvoice(inv);
          }}
        />
      )}

    </div>
  );
};
