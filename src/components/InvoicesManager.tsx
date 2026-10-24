import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
  XCircle,
  RotateCcw,
  AlertCircle,
  Pencil,
  PlusCircle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Building2
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP, downloadInvoiceBoth } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { Invoice, OrderStatus } from '../types';
import { CreditAuditModal } from './CreditAuditModal';
import { CreditStatusBadge } from './CreditStatusBadge';
import { OrderReturnModal } from './OrderReturnModal';
import { ExcelInvoicePreviewModal } from './ExcelInvoicePreviewModal';

interface InvoicesManagerProps {
  onOpenNewOrder: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
}

export const InvoicesManager: React.FC<InvoicesManagerProps> = ({
  onOpenNewOrder,
  onViewInvoice,
  onEditInvoice,
}) => {
  const {
    invoices,
    currentUser,
    users,
    getVisibleInvoices,
    updateOrderStatus,
    deleteInvoice,
    approveOrder,
    resendInvoiceEmail,
    forwardOrderToManager,
    rejectOrder,
    branches,
    selectedBranchFilter,
    setSelectedBranchFilter,
    refreshInvoicesNow
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewSegment, setViewSegment] = useState<'all' | 'invoices' | 'collections'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');
  const [rejectModalInvoiceId, setRejectModalInvoiceId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('نفاذ الكمية أو طلب العميل إلغاء الطلبية');
  const [returnModalInvoice, setReturnModalInvoice] = useState<Invoice | null>(null);
  const [returnReason, setReturnReason] = useState<string>('مرتجع بطلب العميل واسترجاع البضاعة للمخزن');
  const [auditInvoice, setAuditInvoice] = useState<Invoice | null>(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [previewExcelInvoice, setPreviewExcelInvoice] = useState<Invoice | null>(null);
  const [downloadingBothId, setDownloadingBothId] = useState<string | null>(null);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Auto-refresh invoices on component mount (uses cached data if refreshed recently)
  useEffect(() => {
    let mounted = true;
    refreshInvoicesNow(false).catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await refreshInvoicesNow(true);
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setSuccessToast(`حدث خطأ أثناء التحديث: ${err?.message || ''}`);
      setTimeout(() => setSuccessToast(null), 4000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Pagination state for responsive multi-page browsing
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(15);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter, itemsPerPage]);

  // The context applies the privacy boundary before local filters.
  const userVisibleInvoices = useMemo(() => {
    return getVisibleInvoices();
  }, [invoices, currentUser, users, selectedBranchFilter]);

  // Tab counts calculated accurately on user's visible invoices (optionally filtered by selected rep)
  const tabCounts = useMemo(() => {
    const base = selectedRepFilter !== 'الكل' ? userVisibleInvoices.filter((i) => i.repName === selectedRepFilter) : userVisibleInvoices;
    return {
      all: base.length,
      available: base.filter((i) => !i.isShortageInvoice && !(i.invoiceNumber && i.invoiceNumber.endsWith('-NQ'))).length,
      shortage: base.filter((i) => i.isShortageInvoice || (i.invoiceNumber && i.invoiceNumber.endsWith('-NQ'))).length,
      pending: base.filter(
        (i) => i.status === 'قيد مراجعة المشرف' || i.status === 'معلقة بانتظار اعتماد الفرع' || i.status === 'قيد المراجعة'
      ).length,
      approved: base.filter((i) => i.status === 'معتمدة ومصروفة من المخزن' || i.status === 'معتمدة').length,
      cancelled: base.filter((i) => i.status === 'مرفوضة / ملغاة' || i.status === 'ملغاة').length,
    };
  }, [userVisibleInvoices, selectedRepFilter]);

  const accessibleInvoices = useMemo(() => {
    return userVisibleInvoices.filter((inv) => {
      // Search query filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const numMatch = inv.invoiceNumber.toLowerCase().includes(q);
        const custMatch = inv.customerName.toLowerCase().includes(q);
        const repMatch = inv.repName.toLowerCase().includes(q);
        const phoneMatch = inv.customerPhone?.includes(q);

        if (!numMatch && !custMatch && !repMatch && !phoneMatch) return false;
      }

      // 3. Status filter
      if (selectedStatus !== 'الكل') {
        if (selectedStatus === 'فواتير الأصناف المتوفرة') {
          if (inv.isShortageInvoice || (inv.invoiceNumber && inv.invoiceNumber.endsWith('-NQ'))) return false;
        } else if (selectedStatus === 'فواتير النواقص') {
          if (!inv.isShortageInvoice && !(inv.invoiceNumber && inv.invoiceNumber.endsWith('-NQ'))) return false;
        } else if (selectedStatus === 'قيد مراجعة المشرف') {
          if (inv.status !== 'قيد مراجعة المشرف' && inv.status !== 'معلقة بانتظار اعتماد الفرع' && inv.status !== 'قيد المراجعة') {
            return false;
          }
        } else if (selectedStatus === 'معتمدة ومصروفة من المخزن') {
          if (inv.status !== 'معتمدة ومصروفة من المخزن' && inv.status !== 'معتمدة') {
            return false;
          }
        } else if (selectedStatus === 'مرفوضة / ملغاة') {
          if (inv.status !== 'مرفوضة / ملغاة' && inv.status !== 'ملغاة') {
            return false;
          }
        } else if (inv.status !== selectedStatus) {
          return false;
        }
      }

      // 4. Rep filter (for supervisor / manager / admin)
      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      // 5. Segment filter (Invoices vs Collections)
      if (viewSegment === 'collections') {
        const isCollectionRelevant = inv.paymentMethod === 'نقدي (كاش)' || inv.status === 'معتمدة ومصروفة من المخزن' || inv.status === 'معتمدة';
        if (!isCollectionRelevant) return false;
      }

      return true;
    });
  }, [userVisibleInvoices, searchTerm, selectedStatus, selectedRepFilter, viewSegment]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalCartons = 0;
    let totalPieces = 0;
    let pendingCount = 0;

    accessibleInvoices.forEach((inv) => {
      totalRevenue += inv.estimatedGrandTotal;
      totalCartons += inv.totalCartons;
      totalPieces += inv.totalPieces;
      if (
        inv.status === 'قيد مراجعة المشرف' ||
        inv.status === 'معلقة بانتظار اعتماد الفرع' ||
        inv.status === 'قيد المراجعة'
      ) {
        pendingCount++;
      }
    });

    return { totalRevenue, totalCartons, totalPieces, pendingCount, count: accessibleInvoices.length };
  }, [accessibleInvoices]);

  const repsList = useMemo(() => {
    const set = new Set<string>();
    accessibleInvoices.forEach((inv) => {
      if (inv.repName) set.add(inv.repName);
    });
    return ['الكل', ...Array.from(set)];
  }, [accessibleInvoices]);

  // Paginated Slices
  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(accessibleInvoices.length / itemsPerPage));
  }, [accessibleInvoices.length, itemsPerPage]);

  const displayedInvoices = useMemo(() => {
    if (itemsPerPage === 'all') return accessibleInvoices;
    const start = (currentPage - 1) * itemsPerPage;
    return accessibleInvoices.slice(start, start + itemsPerPage);
  }, [accessibleInvoices, currentPage, itemsPerPage]);

  const statusStyles: Record<string, { bg: string; text?: string; label?: string }> = {
    'مسودة': { bg: 'app-badge neutral' },
    'قيد مراجعة المشرف': { bg: 'app-badge warn animate-pulse', label: 'قيد مراجعة المشرف' },
    'معلقة بانتظار اعتماد الفرع': { bg: 'app-badge warn animate-pulse', label: 'بانتظار مدير الفرع' },
    'قيد المراجعة': { bg: 'app-badge warn' },
    'معتمدة ومصروفة من المخزن': { bg: 'app-badge ok', label: 'معتمدة ومصروفة' },
    'معتمدة': { bg: 'app-badge ok' },
    'جاري التجهيز': { bg: 'app-badge warn' },
    'تم التسليم': { bg: 'app-badge ok' },
    'مرفوضة / ملغاة': { bg: 'app-badge risk', label: 'مرفوضة / ملغاة' },
    'ملغاة': { bg: 'app-badge risk' },
  };

  const handleApproveClick = (invoiceId: string) => {
    const res = approveOrder(invoiceId, 'تم اعتماد الطلبية وصرف الرصيد من المخزن');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  const handleResendInvoice = async (invoice: Invoice) => {
    const result = await resendInvoiceEmail(invoice.id);
    setSuccessToast(result.message);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  const handleForwardClick = (invoiceId: string) => {
    const res = forwardOrderToManager(invoiceId, 'تم إرسال الطلبية لمدير الفرع للموافقة النهائية');
    if (res.success) {
      setSuccessToast(res.message);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleRejectConfirm = () => {
    if (!rejectModalInvoiceId) return;
    const selectedInvoice = invoices.find((invoice) => invoice.id === rejectModalInvoiceId);
    const pendingStatuses = ['قيد مراجعة المشرف', 'معلقة بانتظار اعتماد الفرع', 'قيد المراجعة', 'مسودة'];
    const res = selectedInvoice && pendingStatuses.includes(selectedInvoice.status)
      ? rejectOrder(rejectModalInvoiceId, rejectReason)
      : updateOrderStatus(rejectModalInvoiceId, 'ملغاة', rejectReason);
    if (res.success) {
      setSuccessToast(res.message);
      setRejectModalInvoiceId(null);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleReturnConfirm = () => {
    if (!returnModalInvoice) return;
    setIsSubmittingReturn(true);
    try {
      const res = updateOrderStatus(returnModalInvoice.id, 'مرتجع', returnReason);
      if (res.success) {
        setSuccessToast(`تم تسجيل الفاتورة #${returnModalInvoice.invoiceNumber} كمرتجع بنجاح! تمت إعادة ${returnModalInvoice.totalCartons} كرتونة إلى رصيد المخزن، وخصم ${formatCurrency(returnModalInvoice.estimatedGrandTotal)} من حساب ومديونية العميل.`);
        setReturnModalInvoice(null);
        setTimeout(() => setSuccessToast(null), 5000);
      }
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  return (
    <div className="tantawy-screen space-y-4 pb-16">
      
      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-[var(--app-ok)] text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in sticky top-20 z-30">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-5 h-5 text-white/70" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & High Level Metrics Cards */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <span>سجل الفواتير وطلبيات المبيعات</span>
              <span className="border border-[rgba(201,154,67,.3)] bg-[rgba(201,154,67,.13)] text-[#8a6420] text-xs px-2.5 py-0.5 rounded-full font-bold app-num">
                {accessibleInvoices.length} فاتورة
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              متابعة طلبات المناديب والعملاء • دورة الاعتماد والصرف المخزني • تصدير إكسل رسمي
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="app-btn app-btn-ghost px-3 text-xs active:scale-95"
              title="تحديث ومزامنة الفواتير مباشرة من قاعدة بيانات السيرفر"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-600' : 'text-slate-500'}`} />
              <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث من السيرفر'}</span>
            </button>

            <button
              onClick={onOpenNewOrder}
              className="app-btn app-btn-primary px-4 h-11 text-xs active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء فاتورة / طلبية جديدة</span>
            </button>
          </div>
        </div>

        {/* Segmented Control [الفواتير | التحصيلات] matching architectural mockup */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="inline-flex p-1 rounded-2xl bg-slate-100 border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewSegment('invoices')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                viewSegment === 'invoices' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الفواتير
            </button>
            <button
              type="button"
              onClick={() => setViewSegment('collections')}
              className={`px-4 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                viewSegment === 'collections' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              التحصيلات
            </button>
            <button
              type="button"
              onClick={() => setViewSegment('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer ${
                viewSegment === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عرض الكل
            </button>
          </div>
        </div>

        {/* Dashboard Aggregate Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي مبيعات الفواتير</div>
            <div className="text-base sm:text-lg app-num app-ink-brass">
              {formatCurrency(metrics.totalRevenue)}
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي الكراتين المطلوبة</div>
            <div className="text-base sm:text-lg app-num text-[var(--app-warn)]">
              {metrics.totalCartons} كرتونة
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1">
            <div className="text-[11px] text-slate-500 font-bold">إجمالي القطع</div>
            <div className="text-base sm:text-lg app-num text-[var(--app-navy)]">
              {metrics.totalPieces} قطعة
            </div>
          </div>

          <div className="bg-[#f7f0e1] p-3.5 rounded-2xl border border-[rgba(155,112,39,.25)] space-y-1">
            <div className="text-[11px] text-[#9b7027] font-bold">طلبيات معلقة بانتظار الاعتماد</div>
            <div className="text-base sm:text-lg app-num text-[#8a6420]">
              {metrics.pendingCount} طلبية
            </div>
          </div>
        </div>

        {/* Quick Filter Categories Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            onClick={() => setSelectedStatus('الكل')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'الكل'
                ? 'on'
                : ''
            }`}
          >
            كافة الفواتير ({tabCounts.all})
          </button>

          <button
            onClick={() => setSelectedStatus('فواتير الأصناف المتوفرة')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'فواتير الأصناف المتوفرة'
                ? 'on'
                : ''
            }`}
            title="عرض فواتير البضاعة المتوفرة بالفرع فقط"
          >
            فواتير المتوفر ({tabCounts.available})
          </button>

          <button
            onClick={() => setSelectedStatus('فواتير النواقص')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'فواتير النواقص'
                ? 'on'
                : ''
            }`}
            title="عرض فواتير النواقص المحولة للمخزن المركزي بأكتوبر"
          >
            فواتير النواقص (-NQ) ({tabCounts.shortage})
          </button>

          <button
            onClick={() => setSelectedStatus('قيد مراجعة المشرف')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'قيد مراجعة المشرف'
                ? 'on'
                : ''
            }`}
          >
            بانتظار الاعتماد ({tabCounts.pending})
          </button>

          <button
            onClick={() => setSelectedStatus('معتمدة ومصروفة من المخزن')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'معتمدة ومصروفة من المخزن'
                ? 'on'
                : ''
            }`}
          >
            معتمدة ومصروفة ({tabCounts.approved})
          </button>

          <button
            onClick={() => setSelectedStatus('مرفوضة / ملغاة')}
            className={`app-pill px-3 py-1.5 text-xs whitespace-nowrap text-right ${
              selectedStatus === 'مرفوضة / ملغاة'
                ? 'on'
                : ''
            }`}
          >
            الملغية والمرفوضة ({tabCounts.cancelled})
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم الفاتورة، اسم العميل، الهاتف، المندوب..."
              className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border border-slate-200">
            <span className="text-slate-500 font-bold whitespace-nowrap">الحالة:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
            >
              <option value="الكل">كل الفواتير</option>
              <option value="فواتير الأصناف المتوفرة">فواتير الأصناف المتوفرة فقط</option>
              <option value="فواتير النواقص">فواتير النواقص فقط (-NQ)</option>
              <option value="قيد مراجعة المشرف">قيد مراجعة المشرف</option>
              <option value="معلقة بانتظار اعتماد الفرع">بانتظار مدير الفرع</option>
              <option value="معتمدة ومصروفة من المخزن">معتمدة ومصروفة</option>
              <option value="مرفوضة / ملغاة">مرفوضة / ملغاة</option>
            </select>
          </div>

          {/* Branch Filter for Admin, Developer & Supervisor */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && (
            <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-bold whitespace-nowrap">الفرع:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
              >
                <option value="الكل">كل الفروع</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentUser?.role !== 'sales_rep' && (
            <div className="flex items-center gap-1.5 bg-white px-3 py-2 rounded-lg border border-slate-200">
              <span className="text-slate-500 font-bold whitespace-nowrap">المندوب:</span>
              <select
                value={selectedRepFilter}
                onChange={(e) => setSelectedRepFilter(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full"
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

        {/* Active Branch Notification for Admin/Dev */}
        {selectedBranchFilter !== 'الكل' && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
          <div className="bg-[#f7f0e1] border border-[rgba(155,112,39,.25)] rounded-2xl p-3 flex items-center justify-between text-xs text-[var(--app-warn)] font-bold">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#9b7027]" />
              <span>
                يتم الآن تصفية الفواتير بحسب الفرع: <span className="underline decoration-[#c99a43] underline-offset-4">{selectedBranchFilter}</span>. أي فواتير لمندوبين من فروع أخرى لن تظهر حتى تلغي التصفية.
              </span>
            </div>
            <button
              onClick={() => setSelectedBranchFilter('الكل')}
              className="app-btn app-btn-primary px-3 text-[11px]"
            >
              عرض فواتير كل الفروع
            </button>
          </div>
        )}

      </div>

      {/* Invoices List Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        
        {accessibleInvoices.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700">لا توجد فواتير مطابقة للبحث</h3>
            <p className="text-xs text-slate-400">اضغط على زر (إنشاء فاتورة / طلبية جديدة) لإصدار فاتورة جديدة للعميل</p>
          </div>
        ) : (
          <>
            {/* Dedicated Mobile Cards Layout matching Tantawy Group Mockup */}
            <div className="md:hidden p-3 flex flex-col gap-3">
              {displayedInvoices.map((invoice) => {
                const style = statusStyles[invoice.status] || {
                  bg: 'app-badge neutral',
                  label: invoice.status
                };
                const isPending =
                  invoice.status === 'قيد مراجعة المشرف' ||
                  invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
                  invoice.status === 'قيد المراجعة' ||
                  invoice.status === 'مسودة';

                const isOwnerRep = currentUser?.role === 'sales_rep' && (invoice.repId === currentUser.id || invoice.repName === currentUser.name);

                const canEditPending = Boolean(
                  onEditInvoice &&
                  isPending &&
                  (isOwnerRep || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer')
                );

                const canApprove =
                  (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
                  isPending;

                return (
                  <div
                    key={invoice.id}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 space-y-3 hover:border-teal-500/50 transition"
                  >
                    {/* Header: Number + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                          #{invoice.invoiceNumber}
                        </span>
                        {invoice.isShortageInvoice && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            نواقص
                          </span>
                        )}
                      </div>
                      <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-black ${style.bg} ${style.text || ''}`}>
                        {style.label || invoice.status}
                      </span>
                    </div>

                    {/* Customer & Rep Details */}
                    <div>
                      <div className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="truncate">{invoice.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-2 flex-wrap">
                        <span>المندوب: <strong className="text-slate-700">{invoice.repName}</strong></span>
                        <span>·</span>
                        <span>{invoice.branchName}</span>
                        <span>·</span>
                        <span className="font-mono">{invoice.date}</span>
                      </div>
                    </div>

                    {/* Stats Strip */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold">الكميات المطلوبة</div>
                        <div className="text-xs font-black text-slate-800 mt-0.5">
                          {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-slate-400 font-bold">إجمالي الفاتورة</div>
                        <div className="text-sm font-black text-teal-700 mt-0.5 font-mono">
                          {formatCurrency(invoice.estimatedGrandTotal)}
                        </div>
                      </div>
                    </div>

                    {/* Actions Strip */}
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(invoice)}
                          className="h-8 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض</span>
                        </button>

                        {canEditPending && onEditInvoice && (
                          <button
                            type="button"
                            onClick={() => onEditInvoice(invoice)}
                            className="h-8 px-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                        )}

                        {canApprove && (
                          <button
                            type="button"
                            onClick={() => handleApproveClick(invoice.id)}
                            className="h-8 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>اعتماد</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => downloadInvoicePDF(invoice)}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                          title="تحميل PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewExcelInvoice(invoice)}
                          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition cursor-pointer"
                          title="معاينة إكسل"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-200 font-bold">
                <tr>
                  <th className="p-3.5">رقم الفاتورة</th>
                  <th className="p-3.5">اسم العميل / المحل</th>
                  <th className="p-3.5">المندوب والفرع</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5 text-center">الكميات (كراتين/قطع)</th>
                  <th className="p-3.5 text-left">إجمالي الفاتورة</th>
                  <th className="p-3.5 text-center">طريقة السداد</th>
                  <th className="p-3.5 text-center">حالة الفاتورة والاعتماد</th>
                  <th className="p-3.5 text-center">الإجراءات والعمليات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedInvoices.map((invoice) => {
                  const style = statusStyles[invoice.status] || {
                    bg: 'app-badge neutral',
                    label: invoice.status
                  };
                  const isPending =
                    invoice.status === 'قيد مراجعة المشرف' ||
                    invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
                    invoice.status === 'قيد المراجعة' ||
                    invoice.status === 'مسودة';

                  const isOwnerRep = currentUser?.role === 'sales_rep' && (invoice.repId === currentUser.id || invoice.repName === currentUser.name);
                  
                  const canEditPending = Boolean(
                    onEditInvoice &&
                    isPending &&
                    (isOwnerRep || currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer')
                  );

                  const canRepCancel = isPending && isOwnerRep;

                  const canApprove =
                    (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
                    isPending;

  const canCancelAnytime =
    (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
    !isPending &&
    !['مرتجع', 'مرتجع جزئي', 'مرفوضة / ملغاة', 'ملغاة'].includes(invoice.status);

                  const canMakeReturn =
                    (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') &&
                    (invoice.status === 'معتمدة ومصروفة من المخزن' ||
                     invoice.status === 'معتمدة' ||
                     invoice.status === 'جاري التجهيز' ||
                     invoice.status === 'جاري تحضير المنتجات' ||
                     invoice.status === 'تم وصول المنتجات' ||
                     invoice.status === 'قيد التوصيل' ||
                     invoice.status === 'تم التسليم' ||
                     invoice.status === 'إغلاق الطلبية' ||
                     invoice.status === 'مرتجع جزئي');

                  return (
                    <tr key={invoice.id} className="transition">
                      
                      {/* Invoice Number */}
                      <td className="p-3 font-mono font-black text-slate-900">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="bg-white px-2 py-1 rounded-md text-[var(--app-navy)] border border-slate-200 font-black app-num">
                            {invoice.invoiceNumber}
                          </span>
                          {invoice.isShortageInvoice && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (invoice.parentInvoiceNumber) setSearchTerm(invoice.parentInvoiceNumber);
                              }}
                              className="bg-[#f7f0e1] hover:bg-[#f0e5cb] text-[#9b7027] px-2 py-1 rounded-md text-[10px] font-black border border-[rgba(155,112,39,.25)] flex flex-col gap-0.5 transition cursor-pointer text-right shadow-2xs group"
                              title="فاتورة نواقص محولة لمخزن أكتوبر المركزي - انقر للبحث عن الفاتورة الأساسية"
                            >
                              <div className="flex items-center gap-1 text-[#8a6420] font-black">
                                <span>فاتورة نواقص (مخزن أكتوبر)</span>
                              </div>
                              {invoice.parentInvoiceNumber && (
                                <div className="flex items-center gap-1 text-[9px] text-[#9b7027] font-mono">
                                  <span>الأصلية:</span>
                                  <span className="font-bold underline">#{invoice.parentInvoiceNumber}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#9b7027]" />
                                </div>
                              )}
                            </button>
                          )}
                          {invoice.hasShortageSplit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (invoice.shortageInvoiceNumber) setSearchTerm(invoice.shortageInvoiceNumber);
                              }}
                              className="bg-[#e8f3ee] hover:bg-[#dfeeda] text-[#2e7d5b] px-2 py-1 rounded-md text-[10px] font-black border border-[rgba(46,125,91,.22)] flex flex-col gap-0.5 transition cursor-pointer text-right shadow-2xs group"
                              title="فاتورة الأصناف المتوفرة بالمخزن - تم فصل النواقص - انقر للبحث عن فاتورة النواقص"
                            >
                              <div className="flex items-center gap-1 text-[#2e7d5b] font-black">
                                <span>أصناف متوفرة (بالمخزن)</span>
                              </div>
                              {invoice.shortageInvoiceNumber && (
                                <div className="flex items-center gap-1 text-[9px] text-[#2e7d5b] font-mono">
                                  <span>نواقص:</span>
                                  <span className="font-bold underline">#{invoice.shortageInvoiceNumber}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 text-[#2e7d5b]" />
                                </div>
                              )}
                            </button>
                          )}
                          {!invoice.isShortageInvoice && !invoice.hasShortageSplit && (
                            <span className="bg-[#e8f3ee] text-[#2e7d5b] px-2 py-1 rounded-md text-[10px] font-black border border-[rgba(46,125,91,.22)] flex items-center gap-1 shadow-2xs">
                              <span>فاتورة مكتملة متوفرة بالمخزن</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Customer Name & Credit Summary */}
                      <td className="p-3 min-w-[190px]">
                        <div className="font-extrabold text-slate-900 text-sm mb-1">{invoice.customerName}</div>
                        <CreditStatusBadge
                          invoice={invoice}
                          onClick={() => {
                            setAuditInvoice(invoice);
                            setIsAuditOpen(true);
                          }}
                        />
                      </td>

                      {/* Rep & Branch */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{invoice.repName}</div>
                        <div className="text-[10px] text-slate-400">{invoice.branchName}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="p-3 text-slate-600">
                        <div>{invoice.date}</div>
                        <div className="text-[10px] text-slate-400">{invoice.time}</div>
                      </td>

                      {/* Quantities */}
                      <td className="p-3 text-center">
                        <div className="app-num text-[var(--app-navy)]">{invoice.totalCartons} كرتونة</div>
                        <div className="text-[10px] text-slate-500">{invoice.totalPieces} قطعة</div>
                      </td>

                      {/* Estimated Grand Total */}
                      <td className="p-3 text-left">
                        <div className="app-num app-ink-brass text-sm">
                          {formatCurrency(invoice.estimatedGrandTotal)}
                        </div>
                        <div className="text-[10px] text-[var(--app-ok)]">خصم: {formatCurrency(invoice.discountAmount)}</div>
                      </td>

                      {/* Payment Method */}
                      <td className="p-3 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {invoice.paymentMethod}
                        </span>
                      </td>

                      {/* Status Dropdown / Badge */}
                      <td className="p-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`${style.bg} ${style.text || ''}`}>
                            {style.label || invoice.status}
                          </span>
                          {(invoice.status === 'مرفوضة / ملغاة' || invoice.status === 'ملغاة') && invoice.cancellationReason && (
                            <div className="text-[10px] text-[var(--app-risk)] max-w-[140px] truncate" title={`سبب الرفض: ${invoice.cancellationReason} | ${invoice.restoredStockDetails || ''}`}>
                              {invoice.cancellationReason}
                            </div>
                          )}
                          {invoice.restoredStockDetails && (invoice.status === 'مرفوضة / ملغاة' || invoice.status === 'ملغاة' || invoice.status === 'مرتجع') && (
                            <span className="text-[9px] bg-[#e8f3ee] text-[#2e7d5b] px-1.5 py-0.5 rounded font-bold border border-[rgba(46,125,91,.22)]">
                              تم استرجاع الرصيد للمخزن
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          
                          {/* Edit / Add Items Button for Sales Rep / Supervisor on Pending Orders */}
                          {canEditPending && (
                            <button
                              onClick={() => onEditInvoice && onEditInvoice(invoice)}
                              className="app-btn app-btn-ghost px-2.5 text-xs"
                              title="تعديل الطلبية وإضافة أو حذف أصناف في السلة"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>تعديل/إضافة</span>
                            </button>
                          )}

                          {/* Fast Approval Action for Supervisor/Manager */}
                          {canApprove && (
                            <>
                              <button
                                onClick={() => handleApproveClick(invoice.id)}
                                className="app-btn app-btn-ok px-2 text-xs"
                                title="اعتماد وصرف المخزون"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>

                              {currentUser?.role === 'supervisor' && invoice.status === 'قيد مراجعة المشرف' && (
                                <button
                                  onClick={() => handleForwardClick(invoice.id)}
                                  className="app-btn app-btn-ghost px-2 text-xs"
                                  title="إرسال لمدير الفرع"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>للمدير</span>
                                </button>
                              )}

                              <button
                                onClick={() => setRejectModalInvoiceId(invoice.id)}
                                className="app-btn app-btn-risk-soft px-2 text-xs"
                                title="رفض وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}

                          {/* Rep cancel pending order button */}
                          {!canApprove && canRepCancel && (
                            <button
                              onClick={() => setRejectModalInvoiceId(invoice.id)}
                              className="app-btn app-btn-risk-soft px-2 text-xs"
                              title="إلغاء طلبيتي قبل الاعتماد وفك حجز البضاعة"
                            >
                              <XCircle className="w-3.5 h-3.5 text-[var(--app-risk)]" />
                              <span>إلغاء الطلبية</span>
                            </button>
                          )}

                          {/* If not pending, but active: Supervisor / Manager / Admin can cancel anytime */}
                          {!canApprove && !canRepCancel && canCancelAnytime && (
                            <button
                              onClick={() => setRejectModalInvoiceId(invoice.id)}
                              className="app-btn app-btn-risk-soft px-2 text-xs"
                              title="إلغاء الطلبية في أي وقت وإرجاع المخزون"
                            >
                              <XCircle className="w-3.5 h-3.5 text-[var(--app-risk)]" />
                              <span>إلغاء</span>
                            </button>
                          )}
                          {/* Return Button for Manager/Supervisor/Admin on approved or completed orders */}
                          {canMakeReturn && (
                            <button
                              onClick={() => {
                                setReturnModalInvoice(invoice);
                                setReturnReason('مرتجع بطلب العميل واسترجاع البضاعة للمخزن');
                              }}
                              className="app-btn app-btn-warn-soft px-2 text-xs"
                              title="تسجيل مرتجع للطلبية وإرجاع المخزون وتعديل المديونية"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-[#9b7027]" />
                              <span>مرتجع</span>
                            </button>
                          )}

                          <button
                            onClick={() => onViewInvoice(invoice)}
                            className="app-btn app-btn-primary px-2.5 text-xs"
                            title="عرض الفاتورة الإلكترونية والباركود"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض</span>
                          </button>

                          {['admin', 'developer', 'branch_manager', 'supervisor'].includes(currentUser?.role || '') &&
                            ['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(invoice.status) && (
                            <button
                              onClick={() => void handleResendInvoice(invoice)}
                              className="app-btn app-btn-ghost px-2 text-xs"
                              title="إعادة إرسال الفاتورة بالبريد مع PDF وExcel"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>إعادة الإرسال على الميل</span>
                            </button>
                          )}

                          {/* Download Both (PDF + Excel) directly to device */}
                          <button
                            onClick={async () => {
                              try {
                                setDownloadingBothId(invoice.id);
                                await downloadInvoiceBoth(invoice);
                                setSuccessToast(`تم تنزيل ملف PDF وملف Excel للفاتورة #${invoice.invoiceNumber} مباشرة على جهازك!`);
                                setTimeout(() => setSuccessToast(null), 4000);
                              } catch (e) {
                                setSuccessToast('تم إرسال أمر تنزيل الملفات إلى جهازك.');
                                setTimeout(() => setSuccessToast(null), 3000);
                              } finally {
                                setDownloadingBothId(null);
                              }
                            }}
                            disabled={downloadingBothId === invoice.id}
                            className="app-btn app-btn-ghost app-ink-brass px-2 text-xs active:scale-95"
                            title="تحميل ملف PDF وملف Excel معاً مباشرة على جهازك بضغطة واحدة"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">{downloadingBothId === invoice.id ? '...' : 'PDF + Excel'}</span>
                          </button>

                          {/* Download PDF directly to mobile/desktop */}
                          <button
                            onClick={async () => {
                              await downloadInvoicePDF(invoice);
                              setSuccessToast(`تم تنزيل ملف PDF للفاتورة #${invoice.invoiceNumber} على جهازك بنجاح!`);
                              setTimeout(() => setSuccessToast(null), 3500);
                            }}
                            className="app-btn app-btn-risk p-1.5"
                            title="تحميل فاتورة PDF مباشرة على الهاتف أو الكمبيوتر"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Preview Excel Modal */}
                          <button
                            onClick={() => setPreviewExcelInvoice(invoice)}
                            className="app-btn app-btn-ok p-1.5"
                            title="معاينة شيت الإكسل المطور وتفاصيله قبل التنزيل"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          {/* Export Standard Excel (.xlsx) direct */}
                          <button
                            onClick={() => {
                              exportElectronicInvoiceToExcel(invoice);
                              setSuccessToast(`تم تنزيل ملف إكسل للفاتورة #${invoice.invoiceNumber} على جهازك`);
                              setTimeout(() => setSuccessToast(null), 3000);
                            }}
                            className="app-btn app-btn-ghost p-1.5"
                            title="تحميل شيت إكسل رسمي فوري على جهازك"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Export Excel ERP Format */}
                          <button
                            onClick={() => {
                              exportInvoiceForERP(invoice);
                              setSuccessToast(`تم تصدير ملف إكسل منسق للسيستم الرئيسي (ERP) للفاتورة ${invoice.invoiceNumber}`);
                              setTimeout(() => setSuccessToast(null), 3000);
                            }}
                            className="app-btn app-btn-warn-soft p-1.5 hidden sm:inline-flex"
                            title="تصدير شيت إكسل جاهز للرفع على السيستم الرئيسي (ERP)"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete (Admin & Developer only) */}
                          {(currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`هل أنت متأكد من حذف الفاتورة رقم ${invoice.invoiceNumber} نهائياً من النظام والسيرفر؟`)) {
                                  try {
                                    await deleteInvoice(invoice.id);
                                    setSuccessToast(`تم حذف الفاتورة #${invoice.invoiceNumber} نهائياً بنجاح`);
                                    setTimeout(() => setSuccessToast(null), 3500);
                                  } catch (error: any) {
                                    alert(`تم إخفاء الفاتورة محلياً، لكن تعذر حذفها من قاعدة البيانات: ${error?.message || 'تحقق من اتصال Supabase وصلاحيات الحذف.'}`);
                                  }
                                }
                              }}
                              className="text-slate-400 hover:text-[var(--app-risk)] p-1.5 rounded-lg transition cursor-pointer"
                              title="حذف الفاتورة نهائياً من السيرفر والنظام"
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
          </div>
          </>
        )}

      {/* Mobile Floating Action Button to create order */}
      <div className="md:hidden fixed bottom-20 left-4 z-40">
        <button
          type="button"
          onClick={onOpenNewOrder}
          className="w-12 h-12 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition"
          aria-label="فاتورة جديدة"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

        {/* Pagination & Progressive Loading Controller */}
        {accessibleInvoices.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            
            {/* Left: Info & Per-Page Selector */}
            <div className="flex flex-wrap items-center justify-between sm:justify-start gap-3 w-full sm:w-auto text-xs">
              <div className="text-slate-600 font-bold flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-400 font-normal">عرض الفواتير:</span>
                <strong className="text-slate-900">
                  {itemsPerPage === 'all'
                    ? `كافة الفواتير (${accessibleInvoices.length})`
                    : `${Math.min(accessibleInvoices.length, (currentPage - 1) * itemsPerPage + 1)} - ${Math.min(accessibleInvoices.length, currentPage * itemsPerPage)} من أصل ${accessibleInvoices.length}`}
                </strong>
              </div>

              {/* Per page dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">عدد الفواتير بالصفحة:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setItemsPerPage(val);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-800 cursor-pointer shadow-xs"
                >
                  <option value={15}>15 فاتورة (سريع)</option>
                  <option value={30}>30 فاتورة</option>
                  <option value={50}>50 فاتورة</option>
                  <option value={100}>100 فاتورة</option>
                  <option value="all">عرض الكل ({accessibleInvoices.length})</option>
                </select>
              </div>
            </div>

            {/* Right: Page Navigation Buttons */}
            {itemsPerPage !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                
                {/* First page */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-xs"
                  title="الصفحة الأولى"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>

                {/* Previous page */}
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>السابق</span>
                </button>

                {/* Page numbers (smart window) */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | string)[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) => {
                      if (item === '...') {
                        return (
                          <span key={`dots-inv-${idx}`} className="px-1.5 text-slate-400 text-xs font-black">
                            ...
                          </span>
                        );
                      }
                      const pageNum = item as number;
                      const isActive = pageNum === currentPage;
                      return (
                        <button
                          key={`page-inv-${pageNum}`}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                            isActive
                              ? 'app-pill w-8 h-8 inline-grid place-items-center p-0'
                              : 'app-pill w-8 h-8 inline-grid place-items-center p-0 bg-white text-slate-700'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                </div>

                {/* Next page */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer flex items-center gap-1 shadow-xs"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Last page */}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-700 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer shadow-xs"
                  title="الصفحة الأخيرة"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Reject / Cancel Order Reason Prompt Modal */}
      {rejectModalInvoiceId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-[var(--app-risk)] flex items-center gap-2">
                <XCircle className="w-5 h-5 text-[var(--app-risk)]" />
                <span>إلغاء أو رفض الطلبية وإرجاع المخزون</span>
              </h3>
              <button onClick={() => setRejectModalInvoiceId(null)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-700 cursor-pointer" />
              </button>
            </div>

            <div className="bg-[#f9eaea] border border-[rgba(179,74,74,.25)] text-[var(--app-risk)] p-3 rounded-2xl text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-[var(--app-risk)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--app-risk)]" />
                <span>إرجاع البضاعة تلقائياً للمخزن:</span>
              </div>
              <p className="text-[var(--app-risk)] leading-relaxed">
                سيقوم النظام فوراً بإلغاء الطلبية وفك الحجز وإرجاع كافة الكراتين إلى رصيد المخزن المتاح للبيع.
              </p>
            </div>

            {/* Quick Presets */}
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
                        ? 'bg-[var(--app-risk)] text-white border-transparent'
                        : 'bg-white text-[#526780] border-slate-200 hover:border-[#b8c9db]'
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
                placeholder="اكتب سبب إلغاء أو رفض الطلبية..."
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleRejectConfirm}
                className="app-btn app-btn-risk flex-1 py-2.5 text-xs"
              >
                <XCircle className="w-4 h-4" />
                <span>تأكيد الإلغاء وإرجاع المخزون</span>
              </button>
              <button
                onClick={() => setRejectModalInvoiceId(null)}
                className="app-btn app-btn-ghost px-4 text-xs"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Order Return Modal (Full & Partial Itemized Returns) */}
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
        />
      )}

      {/* Excel Invoice Preview & Direct Download Modal */}
      {previewExcelInvoice && (
        <ExcelInvoicePreviewModal
          invoice={previewExcelInvoice}
          isOpen={Boolean(previewExcelInvoice)}
          onClose={() => setPreviewExcelInvoice(null)}
        />
      )}

    </div>
  );
};
