import {
  AlertTriangle,
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
  Sparkles,
  Building2,
  Boxes,
  Truck,
  RefreshCw
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP, downloadInvoiceBoth, exportInvoicesListToExcel } from '../services/excelService';
import { downloadInvoicePDF } from '../services/pdfService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { Invoice, OrderStatus } from '../types';
import { CreditAuditModal } from './CreditAuditModal';
import { CreditStatusBadge } from './CreditStatusBadge';
import { OrderReturnModal } from './OrderReturnModal';
import { ExcelInvoicePreviewModal } from './ExcelInvoicePreviewModal';

interface InvoicesManagerProps {
  onOpenNewOrder: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
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
  // فلتر التاريخ (من / إلى) زي شريط الفلاتر في التصميم
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  // الفاتورة المحددة اللي بتظهر في لوحة "الموقف المالي للعميل" تحت الجدول
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
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
  }, [searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter, itemsPerPage, dateFrom, dateTo]);

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
        (i) => i.status === 'قيد مراجعة المشرف' || i.status === 'معلقة بانتظار اعتماد الفرع' || i.status === 'قيد المراجعة' || i.status === 'في انتظار اعتماد الإدارة'
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
        const branchMatch = inv.branchName?.toLowerCase().includes(q);
        const codeMatch = (inv as any).customerCode?.toLowerCase().includes(q);

        if (!numMatch && !custMatch && !repMatch && !phoneMatch && !branchMatch && !codeMatch) return false;
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

      // 4.b Date range (من / إلى) — التاريخ في الفاتورة نص ISO، فالمقارنة النصية آمنة
      const invDay = String(inv.date || '').slice(0, 10);
      if (dateFrom && invDay && invDay < dateFrom) return false;
      if (dateTo && invDay && invDay > dateTo) return false;

      // 5. Segment filter (Invoices vs Collections)
      if (viewSegment === 'collections') {
        const isCollectionRelevant = inv.paymentMethod === 'نقدي (كاش)' || inv.status === 'معتمدة ومصروفة من المخزن' || inv.status === 'معتمدة';
        if (!isCollectionRelevant) return false;
      }

      return true;
    });
  }, [userVisibleInvoices, searchTerm, selectedStatus, selectedRepFilter, viewSegment, dateFrom, dateTo]);

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
        inv.status === 'قيد المراجعة' ||
        inv.status === 'في انتظار اعتماد الإدارة'
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

  // الفاتورة اللي لوحة "الموقف المالي" بتعرضها: اللي المستخدم اختارها،
  // وإلا أول فاتورة في الصفحة — عشان اللوحة تبقى مفيدة من غير ما يدوس حاجة.
  const activeInvoice = useMemo(() => {
    const picked = selectedInvoiceId ? displayedInvoices.find((i) => i.id === selectedInvoiceId) : null;
    return picked || displayedInvoices[0] || null;
  }, [displayedInvoices, selectedInvoiceId]);

  // ملخص الائتمان للفاتورة المعروضة (نفس أرقام الفاتورة المحفوظة وقت الإنشاء)
  const creditSummary = useMemo(() => {
    if (!activeInvoice) return null;
    const limit = Number(activeInvoice.customerCreditLimit || 0);
    const before = Number(activeInvoice.customerBalanceBefore || 0);
    const total = Number(activeInvoice.estimatedGrandTotal || 0);
    const after = Number(activeInvoice.customerBalanceAfter ?? before + total);
    const usagePct = limit > 0 ? Math.min(100, Math.round((after / limit) * 100)) : 0;
    const exceeded = limit > 0 && after > limit;
    return { limit, before, total, after, usagePct, exceeded };
  }, [activeInvoice]);

  const handleExportList = () => {
    if (accessibleInvoices.length === 0) {
      setSuccessToast('لا توجد فواتير مطابقة للفلاتر الحالية لتصديرها.');
      setTimeout(() => setSuccessToast(null), 4000);
      return;
    }
    exportInvoicesListToExcel(accessibleInvoices, 'سجل_الفواتير');
    setSuccessToast(`تم تصدير ${accessibleInvoices.length} فاتورة إلى ملف Excel بنفس الفلاتر المعروضة.`);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  const statusStyles: Record<string, { bg: string; text?: string; label?: string }> = {
    'مسودة': { bg: 'app-badge neutral' },
    'قيد مراجعة المشرف': { bg: 'app-badge warn animate-pulse', label: 'قيد مراجعة المشرف' },
    'معلقة بانتظار اعتماد الفرع': { bg: 'app-badge warn animate-pulse', label: 'بانتظار مدير الفرع' },
    'قيد المراجعة': { bg: 'app-badge warn' },
    'في انتظار اعتماد الإدارة': { bg: 'app-badge warn animate-pulse', label: 'في انتظار الإدارة' },
    'معتمدة ومصروفة من المخزن': { bg: 'app-badge ok', label: 'معتمدة ومصروفة' },
    'معتمدة': { bg: 'app-badge ok' },
    'جاري التجهيز': { bg: 'app-badge warn' },
    'جاري تحضير المنتجات': { bg: 'app-badge info', label: 'جارٍ التحضير' },
    'تم التسليم': { bg: 'app-badge ok' },
    'إغلاق الطلبية': { bg: 'app-badge ok', label: 'مغلقة' },
    'مرفوضة / ملغاة': { bg: 'app-badge risk', label: 'مرفوضة / ملغاة' },
    'ملغاة': { bg: 'app-badge risk' },
  };

  // المرحلة 1: اعتماد المشرف -> تحويل إلى "معلقة بانتظار اعتماد الفرع"
  const handleSupervisorApprove = (invoiceId: string) => {
    const res = updateOrderStatus(invoiceId, 'معلقة بانتظار اعتماد الفرع', `اعتماد المشرف (${currentUser?.name || 'المشرف'}) - تم توجيه الطلبية للاعتماد الثاني لمدير الفرع.`);
    if (res.success) {
      setSuccessToast(`تم اعتماد المشرف (1/3) بنجاح وتوجيه الطلبية لمدير الفرع.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  // المرحلة 2: اعتماد مدير الفرع -> تحويل إلى "في انتظار اعتماد الإدارة"
  const handleBranchManagerApprove = (invoiceId: string) => {
    const res = updateOrderStatus(invoiceId, 'في انتظار اعتماد الإدارة', `اعتماد مدير الفرع (${currentUser?.name || 'مدير الفرع'}) - تم توجيه الطلبية للاعتماد النهائي للإدارة.`);
    if (res.success) {
      setSuccessToast(`تم اعتماد مدير الفرع (2/3) بنجاح وتوجيه الطلبية للإدارة العامة.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  // المرحلة 3: الاعتماد النهائي للإدارة -> "معتمدة ومصروفة من المخزن"
  const handleAdminFinalApprove = (invoiceId: string) => {
    const res = approveOrder(invoiceId, `الاعتماد النهائي للإدارة العامة (${currentUser?.name || 'الإدارة'}) وصرف المخزون.`);
    if (res.success) {
      setSuccessToast(`تم الاعتماد النهائي للإدارة (3/3) بنجاح واكتمال الفاتورة رسمياً!`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  // تجاوز قرار الرفض السابق واعتماد الفاتورة نهائياً بقرار الإدارة
  const handleAdminOverrideApprove = (invoice: Invoice) => {
    if (window.confirm(`هل أنت متأكد من تجاوز قرار الرفض السابق واعتماد الفاتورة #${invoice.invoiceNumber} نهائياً بقرار الإدارة العامة؟`)) {
      const res = approveOrder(invoice.id, `تم تجاوز قرار الرفض السابق واعتماد الفاتورة نهائياً بواسطة الإدارة العامة (${currentUser?.name || 'الإدارة'}).`);
      if (res.success) {
        setSuccessToast(`تم بنجاح تجاوز الرفض واعتماد الفاتورة #${invoice.invoiceNumber} نهائياً واكتمال أمر البيع!`);
        setTimeout(() => setSuccessToast(null), 5000);
      } else {
        alert(res.message);
      }
    }
  };

  const handleApproveClick = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return;
    if (inv.status === 'قيد مراجعة المشرف') {
      handleSupervisorApprove(invoiceId);
    } else if (inv.status === 'معلقة بانتظار اعتماد الفرع') {
      handleBranchManagerApprove(invoiceId);
    } else {
      handleAdminFinalApprove(invoiceId);
    }
  };

  const handleResendInvoice = async (invoice: Invoice) => {
    const result = await resendInvoiceEmail(invoice.id);
    setSuccessToast(result.message);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  const handleForwardClick = (invoiceId: string) => {
    handleSupervisorApprove(invoiceId);
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
      <div className="space-y-3">
        {/* Breadcrumb + title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 px-1">
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-1">
              الرئيسية <span className="mx-1 text-slate-300">›</span> الفواتير والاعتمادات
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <span className="w-9 h-9 rounded-xl bg-[var(--app-navy)] text-white flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5" />
              </span>
              <span>الفواتير والاعتمادات</span>
              <span className="border border-[rgba(201,154,67,.3)] bg-[rgba(201,154,67,.13)] text-warn text-[11px] px-2.5 py-0.5 rounded-full font-bold app-num">
                {accessibleInvoices.length} فاتورة
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="app-btn app-btn-ghost px-3 text-xs active:scale-95"
              title="تحديث ومزامنة الفواتير مباشرة من قاعدة بيانات السيرفر"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[var(--app-warn-text)]' : 'text-slate-500'}`} />
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


        {/* KPI cards: إجمالي / معلقة / معتمدة / نواقص */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => { setSelectedStatus('الكل'); setCurrentPage(1); }}
            className="text-right bg-[#eaf2fd] border border-[#cfe1f8] rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
          >
            <span className="w-12 h-12 rounded-xl bg-white/80 text-[#1d4ed8] flex items-center justify-center shrink-0">
              <Receipt className="w-6 h-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-slate-600">إجمالي الفواتير</span>
              <span className="block text-2xl font-black text-[#1d4ed8] leading-tight app-num">
                {tabCounts.all.toLocaleString('en-US')}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#1d4ed8]">
                عرض التفاصيل <ChevronLeft className="w-3 h-3" />
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedStatus('قيد مراجعة المشرف'); setCurrentPage(1); }}
            className="text-right bg-[#fdf3e3] border border-[#f7e0b5] rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
          >
            <span className="w-12 h-12 rounded-xl bg-white/80 text-[#b45309] flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-slate-600">الفواتير المعلقة</span>
              <span className="block text-2xl font-black text-[#b45309] leading-tight app-num">
                {tabCounts.pending.toLocaleString('en-US')}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#b45309]">
                عرض التفاصيل <ChevronLeft className="w-3 h-3" />
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedStatus('معتمدة ومصروفة من المخزن'); setCurrentPage(1); }}
            className="text-right bg-[#e9f7ee] border border-[#c9ebd5] rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
          >
            <span className="w-12 h-12 rounded-xl bg-white/80 text-[#15803d] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-slate-600">الفواتير المعتمدة</span>
              <span className="block text-2xl font-black text-[#15803d] leading-tight app-num">
                {tabCounts.approved.toLocaleString('en-US')}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#15803d]">
                عرض التفاصيل <ChevronLeft className="w-3 h-3" />
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setSelectedStatus('فواتير النواقص'); setCurrentPage(1); }}
            className="text-right bg-[#fdeceb] border border-[#f8d3d0] rounded-2xl p-4 flex items-center gap-3 hover:shadow-sm transition cursor-pointer"
          >
            <span className="w-12 h-12 rounded-xl bg-white/80 text-[#b91c1c] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-black text-slate-600">فواتير بها نواقص</span>
              <span className="block text-2xl font-black text-[#b91c1c] leading-tight app-num">
                {tabCounts.shortage.toLocaleString('en-US')}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#b91c1c]">
                عرض التفاصيل <ChevronLeft className="w-3 h-3" />
              </span>
            </span>
          </button>
        </div>
      </div>
      {/* Filters + quick tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* تصدير Excel */}
          <button
            type="button"
            onClick={handleExportList}
            title="تصدير الفواتير المعروضة حالياً (بنفس الفلاتر) إلى ملف Excel"
            className="flex items-center gap-2 bg-[#1d4ed8] hover:bg-[#1a45bf] text-white px-3.5 py-2.5 rounded-xl text-xs font-black shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          {/* بحث */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل..."
              className="w-full pl-3 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          {/* حالة الفاتورة */}
          <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[140px]">
            <span className="text-[9px] text-slate-400 font-bold leading-none mb-0.5">حالة الفاتورة</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-black text-slate-800 text-xs focus:outline-none cursor-pointer w-full"
            >
              <option value="الكل">الكل</option>
              <option value="فواتير الأصناف المتوفرة">الأصناف المتوفرة</option>
              <option value="فواتير النواقص">النواقص (-NQ)</option>
              <option value="قيد مراجعة المشرف">قيد مراجعة المشرف</option>
              <option value="معلقة بانتظار اعتماد الفرع">بانتظار مدير الفرع</option>
              <option value="في انتظار اعتماد الإدارة">في انتظار الإدارة</option>
              <option value="معتمدة ومصروفة من المخزن">معتمدة ومصروفة</option>
              <option value="مرفوضة / ملغاة">مرفوضة / ملغاة</option>
            </select>
          </div>

          {/* المندوب */}
          {currentUser?.role !== 'sales_rep' && (
            <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[140px]">
              <span className="text-[9px] text-slate-400 font-bold leading-none mb-0.5">المندوب</span>
              <select
                value={selectedRepFilter}
                onChange={(e) => setSelectedRepFilter(e.target.value)}
                className="bg-transparent font-black text-slate-800 text-xs focus:outline-none cursor-pointer w-full"
              >
                {repsList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* الفرع */}
          {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && (
            <div className="flex flex-col justify-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 min-w-[140px]">
              <span className="text-[9px] text-slate-400 font-bold leading-none mb-0.5">الفرع</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => setSelectedBranchFilter(e.target.value)}
                className="bg-transparent font-black text-slate-800 text-xs focus:outline-none cursor-pointer w-full"
              >
                <option value="الكل">الكل</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* التاريخ من / إلى */}
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400 mb-1.5 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold leading-none mb-0.5">من</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="من تاريخ"
                className="bg-transparent font-black text-slate-800 text-[11px] focus:outline-none cursor-pointer"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-slate-400 font-bold leading-none mb-0.5">إلى</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="إلى تاريخ"
                className="bg-transparent font-black text-slate-800 text-[11px] focus:outline-none cursor-pointer"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                title="مسح فلتر التاريخ"
                className="text-slate-400 hover:text-rose-600 mb-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

        {/* Quick filter tabs (شكل أزرار الموديل الكحلية) + مبدّل الفواتير/التحصيلات */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
            {[
              { key: 'الكل', label: 'كافة الفواتير', count: tabCounts.all },
              { key: 'فواتير الأصناف المتوفرة', label: 'فواتير المتوفر', count: tabCounts.available },
              { key: 'فواتير النواقص', label: 'فواتير النواقص (-NQ)', count: tabCounts.shortage },
              { key: 'قيد مراجعة المشرف', label: 'بانتظار الاعتماد', count: tabCounts.pending },
              { key: 'معتمدة ومصروفة من المخزن', label: 'معتمدة ومصروفة', count: tabCounts.approved },
              { key: 'مرفوضة / ملغاة', label: 'الملغية والمرفوضة', count: tabCounts.cancelled },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedStatus(tab.key)}
                className={`px-3.5 py-2 rounded-xl text-[11px] font-black whitespace-nowrap transition cursor-pointer border ${
                  selectedStatus === tab.key
                    ? 'bg-[var(--app-navy)] text-white border-[var(--app-navy)] shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            {[
              { key: 'all' as const, label: 'عرض الكل' },
              { key: 'invoices' as const, label: 'الفواتير' },
              { key: 'collections' as const, label: 'التحصيلات' },
            ].map((seg) => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setViewSegment(seg.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer ${
                  viewSegment === seg.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>

        {/* ملخص الأرقام (كان كروت فوق، بقى سطر تحت التابات) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500 border-t border-slate-100 pt-2">
          <span>
            إجمالي المبيعات: <span className="text-slate-900 font-black app-num">{formatCurrency(metrics.totalRevenue)}</span>
          </span>
          <span>
            الكراتين: <span className="text-slate-900 font-black app-num">{metrics.totalCartons.toLocaleString('en-US')}</span>
          </span>
          <span>
            القطع: <span className="text-slate-900 font-black app-num">{metrics.totalPieces.toLocaleString('en-US')}</span>
          </span>
          <span>
            عدد الفواتير المعروضة: <span className="text-slate-900 font-black app-num">{metrics.count.toLocaleString('en-US')}</span>
          </span>
        </div>

        {/* Active Branch Notification for Admin/Dev */}
        {selectedBranchFilter !== 'الكل' && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
          <div className="bg-warn-soft border border-[rgba(155,112,39,.25)] rounded-2xl p-3 flex items-center justify-between gap-2 text-xs text-[var(--app-warn)] font-bold">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-warn-deep shrink-0" />
              <span>
                يتم الآن تصفية الفواتير بحسب الفرع: <span className="underline decoration-[#c99a43] underline-offset-4">{selectedBranchFilter}</span>. أي فواتير لمندوبين من فروع أخرى لن تظهر حتى تلغي التصفية.
              </span>
            </div>
            <button
              onClick={() => setSelectedBranchFilter('الكل')}
              className="app-btn app-btn-primary px-3 text-[11px] whitespace-nowrap"
            >
              عرض كل الفروع
            </button>
          </div>
        )}
      </div>

          </div>
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
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 space-y-3 hover:border-[var(--app-ok)] transition"
                  >
                    {/* Header: Number + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                          #{invoice.invoiceNumber}
                        </span>
                        {invoice.isShortageInvoice && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border border-[var(--app-warn-line)]">
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
                        <Building2 className="w-3.5 h-3.5 text-[var(--app-ok-text)] shrink-0" />
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
                        <div className="text-sm font-black text-[var(--app-ok-text)] mt-0.5 font-mono">
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
                          className="h-8 px-3 rounded-xl bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض</span>
                        </button>

                        {canEditPending && onEditInvoice && (
                          <button
                            type="button"
                            onClick={() => onEditInvoice(invoice)}
                            className="h-8 px-2.5 rounded-xl bg-[var(--app-warn-tint)] hover:bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border border-[var(--app-warn-line)] font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                        )}

                        {canApprove && (
                          <button
                            type="button"
                            onClick={() => handleApproveClick(invoice.id)}
                            className="h-8 px-2.5 rounded-xl bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
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
              <thead className="bg-[var(--app-navy)] text-white/90 font-black">
                <tr>
                  <th className="p-3 text-[11px] whitespace-nowrap">رقم الفاتورة</th>
                  <th className="p-3 text-[11px] whitespace-nowrap">العميل</th>
                  <th className="p-3 text-[11px] whitespace-nowrap">المندوب</th>
                  <th className="p-3 text-[11px] whitespace-nowrap">الفرع</th>
                  <th className="p-3 text-[11px] whitespace-nowrap">التاريخ</th>
                  <th className="p-3 text-[11px] text-center whitespace-nowrap">الكميات</th>
                  <th className="p-3 text-[11px] text-left whitespace-nowrap">الإجمالي</th>
                  <th className="p-3 text-[11px] text-center whitespace-nowrap">طريقة الدفع</th>
                  <th className="p-3 text-[11px] text-center whitespace-nowrap">الحالة</th>
                  <th className="p-3 text-[11px] text-center whitespace-nowrap">الإجراءات</th>
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

                    <tr key={invoice.id} className="transition border-b border-slate-50 hover:bg-slate-25">

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
                              className="bg-warn-soft hover:bg-warn-soft-hover text-warn-deep px-2 py-1 rounded-md text-[10px] font-black border border-[rgba(155,112,39,.25)] flex flex-col gap-0.5 transition cursor-pointer text-right shadow-2xs group"
                              title="فاتورة نواقص محولة لمخزن أكتوبر المركزي - انقر للبحث عن الفاتورة الأساسية"
                            >
                              <div className="flex items-center gap-1 text-warn font-black">
                                <span>فاتورة نواقص (مخزن أكتوبر)</span>
                              </div>
                              {invoice.parentInvoiceNumber && (
                                <div className="flex items-center gap-1 text-[9px] text-warn-deep font-mono">
                                  <span>الأصلية:</span>
                                  <span className="font-bold underline">#{invoice.parentInvoiceNumber}</span>
                                  <ExternalLink className="w-2.5 h-2.5 shrink-0 text-warn-deep" />
                                </div>
                              )}
                            </button>
                          )}
                          {!invoice.isShortageInvoice && !invoice.hasShortageSplit && (
                            <span className="bg-green-soft text-green px-2 py-1 rounded-md text-[10px] font-black border border-[rgba(46,125,91,.22)] flex items-center gap-1 shadow-2xs">
                              <span>فاتورة مكتملة متوفرة بالمخزن</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="p-3">
                        <div className="font-extrabold text-slate-900 text-sm mb-1">{invoice.customerName}</div>
                        <CreditStatusBadge
                          invoice={invoice}
                          onClick={() => {
                            setAuditInvoice(invoice);
                            setIsAuditOpen(true);
                          }}
                        />
                      </td>

                      {/* Rep */}
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{invoice.repName}</div>
                      </td>

                      {/* Branch */}
                      <td className="p-3">
                        <div className="text-[10px] text-slate-400 font-medium">{invoice.branchName}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="p-3 text-slate-600">
                        <div>{invoice.date}</div>
                        <div className="text-[10px] text-slate-400">{invoice.time}</div>
                      </td>

                      {/* Quantities */}
                      <td className="p-3 text-center">
                        <div className="app-num text-[var(--app-navy)]">
                          {invoice.totalCartons} كرتونة
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {invoice.totalPieces} قطعة
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="p-3 text-left">
                        <div className="app-num app-ink-brass text-sm font-mono">
                          {formatCurrency(invoice.estimatedGrandTotal)}
                        </div>
                        <div className="text-[10px] text-[var(--app-ok)]">
                          خصم: {formatCurrency(invoice.discountAmount)}
                        </div>
                      </td>

                      {/* Payment Method */}
                      <td className="p-3 text-center">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {invoice.paymentMethod}
                        </span>
                      </td>

                      {/* Status */}
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
                            <span className="text-[9px] bg-green-soft text-green px-1.5 py-0.5 rounded font-bold border border-[rgba(46,125,91,.22)]">
                              تم استرجاع الرصيد للمخزن
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
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
                          {invoice.status === 'قيد مراجعة المشرف' && (currentUser?.role === 'supervisor' || currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <>
                              <button
                                onClick={() => handleSupervisorApprove(invoice.id)}
                                className="app-btn app-btn-ok px-2.5 py-1 text-xs font-black shadow-xs"
                                title="اعتماد المشرف وتوجيه الطلبية لمدير الفرع للاعتماد الثاني"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد المشرف (1/3) ✓</span>
                              </button>
                              <button
                                onClick={() => setRejectModalInvoiceId(invoice.id)}
                                className="app-btn app-btn-risk-soft px-2 py-1 text-xs font-bold"
                                title="رفض الطلبية وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          {invoice.status === 'معلقة بانتظار اعتماد الفرع' && (currentUser?.role === 'branch_manager' || currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <>
                              <button
                                onClick={() => handleBranchManagerApprove(invoice.id)}
                                className="app-btn px-3 py-1 text-xs font-black shadow-md bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white"
                                title="اعتماد مدير الفرع وتوجيه الطلبية للإدارة العامة للاعتماد النهائي"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد مدير الفرع (2/3) ✓</span>
                              </button>
                              <button
                                onClick={() => setRejectModalInvoiceId(invoice.id)}
                                className="app-btn app-btn-risk-soft px-2 py-1 text-xs font-bold"
                                title="رفض الطلبية وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          {invoice.status === 'في انتظار اعتماد الإدارة' && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <>
                              <button
                                onClick={() => handleAdminFinalApprove(invoice.id)}
                                className="app-btn px-3 py-1 text-xs font-black shadow-md bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 flex items-center gap-1.5 active:scale-95"
                                title="الاعتماد النهائي للطلبية بقرار الإدارة العامة وصرف المخزون"
                              >
                                <ShieldCheck className="w-4 h-4 text-slate-950" />
                                <span>الاعتماد النهائي للإدارة (3/3) 👑</span>
                              </button>
                              <button
                                onClick={() => setRejectModalInvoiceId(invoice.id)}
                                className="app-btn app-btn-risk-soft px-2 py-1 text-xs font-bold"
                                title="رفض الطلبية وإرجاع الرصيد المحجوز"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          {(invoice.status === 'مرفوضة / ملغاة' || invoice.status === 'ملغاة') && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
                            <button
                              onClick={() => handleAdminOverrideApprove(invoice)}
                              className="app-btn px-3 py-1.5 text-xs font-black shadow-lg bg-[var(--app-warn)] hover:bg-[var(--app-warn)] text-slate-950 flex items-center gap-1.5 active:scale-95 border border-[var(--app-warn)] animate-pulse"
                              title="تجاوز قرار الرفض السابق واعتماد الفاتورة نهائياً بقرار الإدارة العامة"
                            >
                              <ShieldCheck className="w-4 h-4 text-slate-950" />
                              <span>تجاوز الرفض واعتماد الإدارة 👑</span>
                            </button>
                          )}
                          {isPending && isOwnerRep && (
                            <button
                              onClick={() => setRejectModalInvoiceId(invoice.id)}
                              className="app-btn app-btn-risk-soft px-2 text-xs"
                              title="إلغاء طلبيتي قبل الاعتماد وفك حجز البضاعة"
                            >
                              <XCircle className="w-3.5 h-3.5 text-[var(--app-risk)]" />
                              <span>إلغاء الطلبية</span>
                            </button>
                          )}
                          {!isPending && !['مرتجع', 'مرتجع جزئي', 'مرفوضة / ملغاة', 'ملغاة'].includes(invoice.status) && (currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager') && (
                            <button
                              onClick={() => setRejectModalInvoiceId(invoice.id)}
                              className="app-btn app-btn-risk-soft px-2 text-xs"
                              title="إلغاء الطلبية وإرجاع المخزون"
                            >
                              <XCircle className="w-3.5 h-3.5 text-[var(--app-risk)]" />
                              <span>إلغاء</span>
                            </button>
                          )}
                          {['معتمدة', 'معتمدة ومصروفة من المخزن'].includes(invoice.status) && canMakeReturn && (
                            <button
                              onClick={() => {
                                const res = updateOrderStatus(invoice.id, 'جاري تحضير المنتجات', 'بدء تجهيز وصرف منتجات الطلبية من المخزن');
                                if (res.success) {
                                  setSuccessToast('تم بدء تحضير وصرف منتجات الطلبية بالمخزن بنجاح.');
                                  setTimeout(() => setSuccessToast(null), 4000);
                                } else {
                                  alert(res.message);
                                }
                              }}
                              className="app-btn app-btn-info px-2.5 py-1 text-xs font-black shadow-2xs"
                              title="تأكيد بدء تحضير وتجهيز منتجات الطلبية بالمخزن"
                            >
                              <Boxes className="w-3.5 h-3.5" />
                              <span>تحضير المنتجات 📦</span>
                            </button>
                          )}
                          {invoice.status === 'جاري تحضير المنتجات' && canMakeReturn && (
                            <button
                              onClick={() => {
                                const res = updateOrderStatus(invoice.id, 'قيد التوصيل', 'تم خروج سيارة التوصيل مع المندوب للتسليم للعميل');
                                if (res.success) {
                                  setSuccessToast('تم تأكيد خروج الشحنة مع المندوب للتوصيل للعميل.');
                                  setTimeout(() => setSuccessToast(null), 4000);
                                } else {
                                  alert(res.message);
                                }
                              }}
                              className="app-btn app-btn-info px-2.5 py-1 text-xs font-black shadow-2xs bg-[var(--app-navy)] hover:bg-[var(--app-navy)] text-white"
                              title="تأكيد خروج المنتجات للتوصيل مع المندوب"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>خروج للتوصيل 🚚</span>
                            </button>
                          )}
                          {invoice.status === 'قيد التوصيل' && canMakeReturn && (
                            <button
                              onClick={() => {
                                const res = updateOrderStatus(invoice.id, 'تم التسليم', 'تم تسليم المنتجات للعميل بنجاح');
                                if (res.success) {
                                  setSuccessToast('تم تسجيل تسليم المنتجات للعميل بنجاح.');
                                  setTimeout(() => setSuccessToast(null), 4000);
                                } else {
                                  alert(res.message);
                                }
                              }}
                              className="app-btn app-btn-ok px-2.5 py-1 text-xs font-black shadow-2xs"
                              title="تأكيد تسليم المنتجات للعميل بنجاح"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>تم التسليم للعميل ✓</span>
                            </button>
                          )}
                          {invoice.status === 'تم التسليم' && canMakeReturn && (
                            <button
                              onClick={() => {
                                const res = updateOrderStatus(invoice.id, 'إغلاق الطلبية', 'تم إغلاق دورة الطلبية بالكامل بعد اكتمال التسليم');
                                if (res.success) {
                                  setSuccessToast('تم إغلاق الفاتورة والطلبية نهائياً.');
                                  setTimeout(() => setSuccessToast(null), 3500);
                                } else {
                                  alert(res.message);
                                }
                              }}
                              className="app-btn app-btn-secondary px-2.5 py-1 text-xs font-black shadow-2xs"
                              title="إغلاق الطلبية بعد التسليم"
                            >
                              <Boxes className="w-3.5 h-3.5" />
                              <span>إغلاق الطلبية</span>
                            </button>
                          )}
                          {['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(invoice.status) && canMakeReturn && (
                            <button
                              onClick={() => setReturnModalInvoice(invoice)}
                              className="app-btn app-btn-risk px-2.5 py-1 text-xs font-black shadow-2xs"
                              title="تسجيل مرتجع على هذه الفاتورة"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>مسجلة مرتجع</span>
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
                          {(currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'branch_manager' || currentUser?.role === 'supervisor') &&
                            ['معتمدة ومصروفة من المخزن', 'معتمدة'].includes(invoice.status) && (
                              <button
                                onClick={() => void handleResendInvoice(invoice)}
                                className="app-btn app-btn-ghost px-2 text-xs"
                                title="إعادة إرسال الفاتورة للعميل"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>إعادة الإرسال</span>
                              </button>
                            )}
                          <button
                            onClick={async () => {
                              await downloadInvoiceBoth(invoice);
                              setSuccessToast(`تم تنزيل ملف PDF + إكسل للفاتورة #${invoice.invoiceNumber} على جهازك بنجاح!`);
                              setTimeout(() => setSuccessToast(null), 3500);
                            }}
                            className="app-btn app-btn-risk p-1.5"
                            title="تحميل فاتورة PDF + إكسل مباشرة على الهاتف أو الكمبيوتر"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewExcelInvoice(invoice)}
                            className="app-btn app-btn-ok p-1.5"
                            title="معاينة شيت الإكسل المطور وتفاصيله قبل التنزيل"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
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
          className="w-12 h-12 rounded-full bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition"
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

      {/* Client Financial Status Panel (الموقف المالي للعميل المحدد) */}
      {activeInvoice && (
        <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-[var(--app-ok)] shrink-0" />
              <div>
                <div className="text-xs font-black text-slate-500">الموقف المالي للعميل المحدد</div>
                <div className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  {activeInvoice.customerName}
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                    نشط
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedInvoiceId(null)}
              className="text-xs font-black text-slate-400 hover:text-slate-700 underline underline-offset-2 transition"
            >
              إلغاء التحديد
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-2xl border border-slate-100">
              <div className="text-[10px] text-slate-400 font-bold mb-1">حد الائتمان المعتمد</div>
              <div className="text-2xl font-black text-[var(--app-navy)] app-num">
                {formatCurrency(creditSummary?.limit ?? activeInvoice.customerCreditLimit ?? 0)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">رصيد العميل قبل الفاتورة</div>
              <div className="text-lg font-black text-slate-600 app-num">
                {formatCurrency(creditSummary?.before ?? activeInvoice.customerBalanceBefore ?? 0)}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-100">
              <div className="text-[10px] text-slate-400 font-bold mb-1">قيمـة الفاتورة الحالية</div>
              <div className="text-2xl font-black text-[var(--app-ok-text)] app-num">
                {formatCurrency(creditSummary?.total ?? activeInvoice.estimatedGrandTotal)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">رصيد العميل بعد الفاتورة</div>
              <div className="text-lg font-black text-slate-600 app-num">
                {formatCurrency(creditSummary?.after ?? 0)}
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-100 sm:col-span-2 lg:col-span-1 flex flex-col justify-center items-center">
              <div className="text-[10px] text-slate-400 font-bold mb-2">نسبة الاستهلاك من الحد</div>
              <div className="relative w-full max-w-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 font-bold">0%</span>
                  <span className="text-[10px] text-slate-500 font-bold">100%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      creditSummary?.exceeded
                        ? 'bg-[var(--app-risk)]'
                        : creditSummary!.usagePct > 70
                        ? 'bg-[var(--app-warn)]'
                        : 'bg-[var(--app-ok)]'
                    }`}
                    style={{ width: `${creditSummary?.usagePct ?? 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] font-black">{creditSummary?.usagePct ?? 0}% مستخدم</span>
                  {creditSummary?.exceeded && (
                    <span className="text-[10px] font-black text-[var(--app-risk)]">
                      ⚠️ تجاوز الحد
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-black text-slate-600 flex items-center gap-2">
              <span>الحالة: </span>
              {creditSummary?.exceeded ? (
                <span className="text-[var(--app-risk)] font-black">تجاوز الحد الائتماني — يتطلب دفعة نقدية</span>
              ) : (
                <span className="text-[var(--app-ok)] font-black">داخل الحد الائتماني المسموح</span>
              )}
            </div>

            <button
              onClick={() => onOpenNewOrder()}
              disabled={Boolean(creditSummary?.exceeded)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black shadow-sm transition active:scale-95 ${
                creditSummary?.exceeded
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white shadow-[var(--app-ok)]'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>دفع الفاتورة فورياً</span>
            </button>
          </div>
        </div>
      )}

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

            <div className="bg-red-light border border-[rgba(179,74,74,.25)] text-[var(--app-risk)] p-3 rounded-2xl text-xs space-y-1">
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
                        : 'bg-white text-gray border-slate-200 hover:border-slate-border'
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
