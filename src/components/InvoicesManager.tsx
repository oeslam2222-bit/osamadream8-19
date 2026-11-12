import {
  AlertTriangle,
  ArrowUpRight,
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
  RefreshCw,
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
import { EmptyState } from './ui/EmptyState';

interface InvoicesManagerProps {
  onOpenNewOrder: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  initialSearchQuery?: string;
  searchSeq?: number;
}

export const InvoicesManager: React.FC<InvoicesManagerProps> = ({
  onOpenNewOrder,
  onViewInvoice,
  onEditInvoice,
  initialSearchQuery,
  searchSeq,
}) => {
  const {
    invoices,
    customers,
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

  useEffect(() => {
    if (typeof initialSearchQuery === 'string' && initialSearchQuery.length) {
      setSearchTerm(initialSearchQuery);
      setSelectedStatus('الكل');
      setSelectedRepFilter('الكل');
      setDateFrom('');
      setDateTo('');
    }
  }, [initialSearchQuery, searchSeq]);
  const [viewSegment, setViewSegment] = useState<'all' | 'invoices'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('الكل');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('الكل');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
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

  useEffect(() => {
    let mounted = true;
    refreshInvoicesNow(false).catch(() => {});
    return () => { mounted = false; };
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

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'all'>(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStatus, selectedRepFilter, selectedBranchFilter, itemsPerPage, dateFrom, dateTo]);

  const userVisibleInvoices = useMemo(() => {
    return getVisibleInvoices();
  }, [invoices, currentUser, users, selectedBranchFilter]);

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

      if (selectedRepFilter !== 'الكل' && inv.repName !== selectedRepFilter) {
        return false;
      }

      const invDay = String(inv.date || '').slice(0, 10);
      if (dateFrom && invDay && invDay < dateFrom) return false;
      if (dateTo && invDay && invDay > dateTo) return false;

      return true;
    });
  }, [userVisibleInvoices, searchTerm, selectedStatus, selectedRepFilter, viewSegment, dateFrom, dateTo]);

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

  const totalPages = useMemo(() => {
    if (itemsPerPage === 'all') return 1;
    return Math.max(1, Math.ceil(accessibleInvoices.length / itemsPerPage));
  }, [accessibleInvoices.length, itemsPerPage]);

  const displayedInvoices = useMemo(() => {
    if (itemsPerPage === 'all') return accessibleInvoices;
    const start = (currentPage - 1) * itemsPerPage;
    return accessibleInvoices.slice(start, start + itemsPerPage);
  }, [accessibleInvoices, currentPage, itemsPerPage]);

  const handleSelectCustomer = (customerId: string | undefined) => {
    if (!customerId) return;
    setSelectedCustomerId(customerId);
  };

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return (
      customers.find((c) => c.id === selectedCustomerId) ??
      customers.find((c) => c.code === selectedCustomerId) ??
      customers.find((c) => c.name === selectedCustomerId) ??
      null
    );
  }, [customers, selectedCustomerId]);

  const customerFinancialSummary = useMemo(() => {
    if (!selectedCustomer) return null;
    const balance = Number(selectedCustomer.currentBalance ?? selectedCustomer.balance ?? 0);
    const overdue = Number(selectedCustomer.overdueBalance ?? selectedCustomer.totalOverdueAndDue ?? 0);
    const limit = Number(selectedCustomer.creditLimit ?? 0);
    const usagePct = limit > 0 ? Math.min(100, Math.round(((balance + overdue) / limit) * 100)) : 0;
    const exceeded = limit > 0 && (balance + overdue) > limit;
    return {
      name: selectedCustomer.name,
      code: selectedCustomer.code,
      phone: selectedCustomer.phone,
      branch: selectedCustomer.branchName,
      sector: selectedCustomer.sector,
      balance,
      overdue,
      totalDebt: balance + overdue,
      limit,
      usagePct,
      exceeded,
      creditStatus: selectedCustomer.dealEligibility || (exceeded ? 'تجاوز الحد' : 'داخل حد الائتمان'),
    };
  }, [selectedCustomer]);

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

  // شارات الحالة بألوان الهوية الموحدة (tg-badge)
  const statusStyles: Record<string, { variant: 'gray' | 'warn' | 'ok' | 'blue' | 'emerald' | 'risk'; label?: string }> = {
    'مسودة': { variant: 'gray', label: 'مسودة' },
    'قيد مراجعة المشرف': { variant: 'warn', label: 'قيد مراجعة المشرف' },
    'معلقة بانتظار اعتماد الفرع': { variant: 'warn', label: 'بانتظار مدير الفرع' },
    'قيد المراجعة': { variant: 'warn', label: 'قيد المراجعة' },
    'في انتظار اعتماد الإدارة': { variant: 'warn', label: 'في انتظار الإدارة' },
    'معتمدة ومصروفة من المخزن': { variant: 'ok', label: 'معتمدة ومصروفة' },
    'معتمدة': { variant: 'ok', label: 'معتمدة' },
    'جاري التجهيز': { variant: 'blue', label: 'جاري التجهيز' },
    'جاري تحضير المنتجات': { variant: 'blue', label: 'جارٍ التحضير' },
    'تم التسليم': { variant: 'emerald', label: 'تم التسليم' },
    'إغلاق الطلبية': { variant: 'emerald', label: 'مغلقة' },
    'مرفوضة / ملغاة': { variant: 'risk', label: 'مرفوضة / ملغاة' },
    'ملغاة': { variant: 'risk', label: 'ملغاة' },
  };

  const handleSupervisorApprove = (invoiceId: string) => {
    const res = updateOrderStatus(invoiceId, 'معلقة بانتظار اعتماد الفرع', `اعتماد المشرف (${currentUser?.name || 'المشرف'}) - تم توجيه الطلبية للاعتماد الثاني لمدير الفرع.`);
    if (res.success) {
      setSuccessToast(`تم اعتماد المشرف (1/3) بنجاح وتوجيه الطلبية لمدير الفرع.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  const handleBranchManagerApprove = (invoiceId: string) => {
    const res = updateOrderStatus(invoiceId, 'في انتظار اعتماد الإدارة', `اعتماد مدير الفرع (${currentUser?.name || 'مدير الفرع'}) - تم توجيه الطلبية للاعتماد النهائي للإدارة.`);
    if (res.success) {
      setSuccessToast(`تم اعتماد مدير الفرع (2/3) بنجاح وتوجيه الطلبية للإدارة العامة.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

  const handleAdminFinalApprove = (invoiceId: string) => {
    const res = approveOrder(invoiceId, `الاعتماد النهائي للإدارة العامة (${currentUser?.name || 'الإدارة'}) وصرف المخزون.`);
    if (res.success) {
      setSuccessToast(`تم الاعتماد النهائي للإدارة (3/3) بنجاح واكتمال الفاتورة رسمياً!`);
      setTimeout(() => setSuccessToast(null), 4000);
    } else {
      alert(res.message);
    }
  };

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
    <div className="tg-dash space-y-4" dir="rtl">

      {/* Success Notification Toast (الهوية الموحدة) */}
      {successToast && (
        <div className="tg-toast">
          <div className="tg-toast-item tg-toast--ok">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successToast}</span>
            <button onClick={() => setSuccessToast(null)} className="ml-auto text-white/80 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- Hero Header (كحلي الهوية) ---------- */}
      <section className="ds-pagehead">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold text-[#a9c8e4] mb-1 tracking-wider uppercase">
              الرئيسية <span className="mx-1 text-[#7fc0ff]">›</span> الفواتير والاعتمادات
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 text-white flex items-center justify-center shrink-0 shadow-xs border border-white/20">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                  <span className="font-black">الفواتير والاعتمادات</span>
                  <span className="bg-[rgba(255,255,255,0.15)] border border-white/20 text-[#7fc0ff] text-[10px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                    {accessibleInvoices.length} فاتورة
                  </span>
                </h2>
                <p className="text-xs text-[#c3d9ec] mt-0.5">
                  إدارة أوامر البيع، حالات الاعتماد، وعرض فواتير المناديب حسب نطاق صلاحيتك.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-xs font-black border border-white/20 bg-white/10 text-white hover:bg-white/20 transition shadow-xs cursor-pointer shadow-sm disabled:opacity-50"
              title="تحديث ومزامنة الفواتير مباشرة من قاعدة بيانات السيرفر"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-white' : 'text-white'}`} />
              <span className="hidden sm:inline">{isRefreshing ? 'جاري التحديث...' : 'تحديث'}</span>
            </button>

            <button
              onClick={onOpenNewOrder}
              className="flex items-center gap-1.5 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-black px-4 h-10 rounded-xl shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-600 transition active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">فاتورة جديدة</span>
            </button>
          </div>
        </div>
      </section>

      {/* ---------- KPI Cards Row (التصميم الجديد — كروت ملونة، أرقام كبيرة) ---------- */}
      <section className="tg-grid-4">
        {/* Total invoices — Orange (فواتير) */}
        <button
          type="button"
          onClick={() => setSelectedStatus('الكل')}
          className="tg-kpi-big tg-kpi-big--invoices group cursor-pointer"
        >
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--invoices">
              <FileText size={20} />
            </span>
            <ArrowUpRight size={16} className="opacity-60" />
          </div>
          <span className="tg-kpi-big__value">{tabCounts.all.toLocaleString('en-US')}</span>
          <span className="tg-kpi-big__label">إجمالي الفواتير</span>
          <span className="tg-kpi-big__hint">كل الفواتير المسجلة</span>
        </button>

        {/* Approved — Green (مبيعات/مكتمل) */}
        <button
          type="button"
          onClick={() => setSelectedStatus('معتمدة ومصروفة من المخزن')}
          className="tg-kpi-big tg-kpi-big--sales group cursor-pointer"
        >
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--sales">
              <CheckCircle2 size={20} />
            </span>
            <ArrowUpRight size={16} className="opacity-60" />
          </div>
          <span className="tg-kpi-big__value">{tabCounts.approved.toLocaleString('en-US')}</span>
          <span className="tg-kpi-big__label">معتمدة ومصروفة</span>
          <span className="tg-kpi-big__hint">فواتير مكتملة وصروفة</span>
        </button>

        {/* Pending — Blue (قيد المعالجة) */}
        <button
          type="button"
          onClick={() => setSelectedStatus('قيد مراجعة المشرف')}
          className="tg-kpi-big tg-kpi-big--customers group cursor-pointer"
        >
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon tg-card--customers">
              <Clock size={20} />
            </span>
            <ArrowUpRight size={16} className="opacity-60" />
          </div>
          <span className="tg-kpi-big__value">{tabCounts.pending.toLocaleString('en-US')}</span>
          <span className="tg-kpi-big__label">بانتظار الاعتماد</span>
          <span className="tg-kpi-big__hint">قيد المراجعة والاعتماد</span>
        </button>

        {/* Cancelled — Red (ملغاة) */}
        <button
          type="button"
          onClick={() => setSelectedStatus('مرفوضة / ملغاة')}
          className="tg-kpi-big tg-kpi-big--risk group cursor-pointer"
        >
          <div className="tg-kpi-big__top">
            <span className="tg-kpi-big__icon" style={{ background: '#fee2e2', color: '#ef4444', boxShadow: '0 6px 14px rgba(239, 68, 68, 0.22)' }}>
              <AlertTriangle size={20} />
            </span>
            <ArrowUpRight size={16} className="opacity-60" />
          </div>
          <span className="tg-kpi-big__value">{tabCounts.cancelled.toLocaleString('en-US')}</span>
          <span className="tg-kpi-big__label">ملغاة / مرفوضة</span>
          <span className="tg-kpi-big__hint">فواتير ملغاة أو مرفوضة</span>
        </button>
      </section>

      {/* ---------- Filters Bar (فاتح مع حدود كحلية) ---------- */}
      <section className="tg-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left: Export + Search */}
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <button
              type="button"
              onClick={handleExportList}
              title="تصدير الفواتير إلى ملف Excel"
              className="flex items-center gap-2 bg-white border border-[var(--tg-line)] px-4 py-2.5 rounded-xl text-sm font-black text-[#0b2337] shadow-sm hover:bg-[#eef5fd] transition active:scale-95 cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#0b2337]" />
              <span>تصدير Excel</span>
            </button>

            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                className="tg-input"
              />
            </div>
          </div>

          {/* Right filters */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {/* حالة الفاتورة */}
            <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[150px]">
              <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">حالة الفاتورة</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="tg-select"
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
              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[150px]">
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">المندوب</span>
                <select
                  value={selectedRepFilter}
                  onChange={(e) => setSelectedRepFilter(e.target.value)}
                  className="tg-select"
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
              <div className="flex flex-col justify-center bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-2 min-w-[150px]">
                <span className="text-[10px] font-bold text-slate-600 leading-none mb-1">الفرع</span>
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="tg-select"
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
            <div className="flex items-end gap-2 bg-[#eef5fd] border border-[var(--tg-line)] rounded-xl px-3 py-1.5">
              <Calendar className="w-4 h-4 text-slate-400 mb-1.5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-600 font-bold leading-none mb-0.5">من</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  aria-label="من تاريخ"
                  className="bg-transparent font-black text-[#0b2337] text-[11px] focus:outline-none cursor-pointer"
                />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-600 font-bold leading-none mb-0.5">إلى</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="إلى تاريخ"
                  className="bg-transparent font-black text-[#0b2337] text-[11px] focus:outline-none cursor-pointer"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  title="مسح فلتر التاريخ"
                  className="text-slate-500 hover:text-rose-500 mb-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick filter tabs (باستيل الهوية) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold scrollbar-none w-full sm:w-auto min-w-0">
            {[
              { key: 'الكل', label: 'كافة الفواتير', count: tabCounts.all },
              { key: 'فواتير الأصناف المتوفرة', label: 'فواتير المتوفر', count: tabCounts.available },
              { key: 'فواتير النواقص', label: 'فواتير النواقص', count: tabCounts.shortage },
              { key: 'قيد مراجعة المشرف', label: 'بانتظار الاعتماد', count: tabCounts.pending },
              { key: 'معتمدة ومصروفة من المخزن', label: 'معتمدة ومصروفة', count: tabCounts.approved },
              { key: 'مرفوضة / ملغاة', label: 'الملغية والمرفوضة', count: tabCounts.cancelled },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedStatus(tab.key)}
                className={`px-3.5 py-2 rounded-xl text-[11px] font-black transition cursor-pointer border whitespace-nowrap shrink-0 ${
                  selectedStatus === tab.key
                    ? 'bg-blue-600 text-white border-transparent shadow-sm shadow-blue-500/25'
                    : 'bg-white border-[var(--tg-line)] text-[#0b2337] hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          <div className="inline-flex p-1 rounded-xl border border-[var(--tg-line)] bg-white shrink-0 self-start sm:self-auto">
            {[
              { key: 'all' as const, label: 'عرض الكل' },
              { key: 'invoices' as const, label: 'الفواتير' },
            ].map((seg) => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setViewSegment(seg.key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition cursor-pointer whitespace-nowrap ${
                  viewSegment === seg.key ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25' : 'text-[#0b2337] hover:text-blue-600'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary metrics (باستيل identity) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="tg-stat tg-stat--blue">
            <span className="text-[10px] font-bold text-blue-800 mb-0.5 block">إجمالي المبيعات</span>
            <span className="font-black text-sm text-blue-700 tabular-nums">{formatCurrency(metrics.totalRevenue)}</span>
          </div>
          <div className="tg-stat tg-stat--emerald">
            <span className="text-[10px] font-bold text-emerald-800 mb-0.5 block">الكراتين</span>
            <span className="font-black text-sm text-emerald-700 tabular-nums">{metrics.totalCartons.toLocaleString('en-US')}</span>
          </div>
          <div className="tg-stat tg-stat--violet">
            <span className="text-[10px] font-bold text-violet-800 mb-0.5 block">القطع</span>
            <span className="font-black text-sm text-violet-700 tabular-nums">{metrics.totalPieces.toLocaleString('en-US')}</span>
          </div>
          <div className="tg-stat tg-stat--amber">
            <span className="text-[10px] font-bold text-amber-800 mb-0.5 block">عدد الفواتير</span>
            <span className="font-black text-sm text-amber-700 tabular-nums">{metrics.count.toLocaleString('en-US')}</span>
          </div>
        </div>

        {/* Active Branch Notification for Admin/Dev */}
        {selectedBranchFilter !== 'الكل' && (currentUser?.role === 'admin' || currentUser?.role === 'developer') && (
          <div className="bg-amber-50 border border-amber-200 rounded-[22px] p-3 flex items-center justify-between gap-2 text-xs text-amber-800 font-bold">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                يتم الآن تصفية الفواتير بحسب الفرع: <span className="underline decoration-amber-400 underline-offset-4">{selectedBranchFilter}</span>. أي فواتير لمندوبين من فروع أخرى لن تظهر حتى تلغي التصفية.
              </span>
            </div>
            <button
              onClick={() => setSelectedBranchFilter('الكل')}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer shadow-sm transition"
            >
              عرض كل الفروع
            </button>
          </div>
        )}
      </section>

      {/* ---------- Invoices List ---------- */}
      <div className="space-y-4">

        {accessibleInvoices.length === 0 ? (
          <div className="tg-empty-state">
            <div className="tg-empty-state__icon">
              <Receipt className="w-8 h-8" />
            </div>
            <h3 className="tg-empty-state__title">لا توجد أوامر بيع</h3>
            <p className="tg-empty-state__sub">
              يمكنك إنشاء أمر بيع جديد للعميل عبر الضغط على زر "فاتورة جديدة" بالأعلى.
            </p>
            <button
              type="button"
              onClick={onOpenNewOrder}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 text-white font-black px-4 py-2.5 shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-blue-600 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء أمر بيع جديد</span>
            </button>
          </div>
        ) : (
          <>
            {/* Mobile Cards Layout (mobiles/tablets) */}
            <div className="md:hidden space-y-3">
              {displayedInvoices.map((invoice) => {
                const style = statusStyles[invoice.status] || { variant: 'gray', label: invoice.status };
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
                    className="tg-card p-4 sm:p-5 space-y-3 group hover:border-blue-300/60 transition border-[var(--tg-line)]"
                  >
                    {/* Header: Number + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-[#f1f5f9] text-[#0b2337] border border-[var(--tg-line)]">
                          #{invoice.invoiceNumber}
                        </span>
                        {invoice.isShortageInvoice && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            نواقص
                          </span>
                        )}
                      </div>
                      <span className={`tg-badge tg-badge--${style.variant}`}>
                        {style.label || invoice.status}
                      </span>
                    </div>

                    {/* Customer & Rep Details */}
                    <div
                      onClick={() => handleSelectCustomer(invoice.customerId)}
                      className="cursor-pointer hover:underline hover:text-[#0b2337] transition"
                    >
                      <div className="font-black text-[#0b2337] text-sm flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#0b2337] shrink-0" />
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
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#f1f5f9] border border-[var(--tg-line)]">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold">الكميات المطلوبة</div>
                        <div className="text-xs font-black text-[#0b2337] mt-0.5">
                          {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] text-slate-500 font-bold">إجمالي الفاتورة</div>
                        <div className="text-sm font-black text-[#0b2337] mt-0.5 font-mono">
                          {formatCurrency(invoice.estimatedGrandTotal)}
                        </div>
                      </div>
                    </div>

                    {/* Actions Strip */}
                    <div className="flex items-center justify-between gap-1.5 pt-3 border-t border-[var(--tg-line)]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(invoice)}
                          className="h-9 px-3.5 rounded-xl bg-[#0D9488] hover:bg-[#007a70] text-white font-black text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
                        >
                          <Eye className="w-4 h-4 text-white shrink-0" />
                          <span className="text-white font-black">عرض</span>
                        </button>

                        {canEditPending && onEditInvoice && (
                          <button
                            type="button"
                            onClick={() => onEditInvoice(invoice)}
                            className="h-9 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
                          >
                            <Pencil className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>تعديل</span>
                          </button>
                        )}

                        {canApprove && (
                          <button
                            type="button"
                            onClick={() => handleApproveClick(invoice.id)}
                            className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
                          >
                            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                            <span>اعتماد</span>
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => downloadInvoicePDF(invoice)}
                          className="w-9 h-9 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-slate-700 border border-[var(--tg-line)] flex items-center justify-center transition cursor-pointer"
                          title="تحميل PDF"
                        >
                          <Download className="w-4 h-4 text-slate-600" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewExcelInvoice(invoice)}
                          className="w-9 h-9 rounded-xl bg-[#f1f5f9] hover:bg-[#e2e8f0] text-emerald-600 border border-[var(--tg-line)] flex items-center justify-center transition cursor-pointer"
                          title="معاينة إكسل"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-[28px] border border-[var(--tg-line)] bg-white shadow-sm">
              <table className="tg-table w-full text-right text-xs">
                <thead className="bg-[var(--tg-card-2)] text-[#0f172a] font-black sticky top-0 z-10">
                  <tr>
                    <th className="font-black whitespace-nowrap uppercase tracking-tighter">رقم الفاتورة</th>
                    <th className="whitespace-nowrap">العميل</th>
                    <th className="whitespace-nowrap">المندوب</th>
                    <th className="whitespace-nowrap">الفرع</th>
                    <th className="whitespace-nowrap">التاريخ</th>
                    <th className="text-center whitespace-nowrap">الكميات</th>
                    <th className="text-left whitespace-nowrap">الإجمالي</th>
                    <th className="text-center whitespace-nowrap">طريقة الدفع</th>
                    <th className="text-center whitespace-nowrap">الحالة</th>
                    <th className="text-center whitespace-nowrap">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedInvoices.map((invoice) => {
                    const style = statusStyles[invoice.status] || { variant: 'gray', label: invoice.status };
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
                      <tr
                        key={invoice.id}
                        className="hover:bg-[#f6f9fe] transition-colors group border-b border-[var(--tg-line)] last:border-0"
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-[#0b2337]">{invoice.invoiceNumber}</span>
                            {invoice.isShortageInvoice && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 ml-1">
                                نواقص
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div
                            onClick={() => handleSelectCustomer(invoice.customerId)}
                            className="cursor-pointer hover:text-[#0b2337] transition"
                          >
                            <div className="font-black text-sm text-[#0b2337] truncate">{invoice.customerName}</div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">{invoice.customerPhone || 'لا يوجد هاتف'}</div>
                          </div>
                        </td>
                        <td>
                          <span className="text-sm font-bold text-[#0b2337]">{invoice.repName}</span>
                        </td>
                        <td>
                          <span className="text-sm text-slate-600 font-medium">{invoice.branchName}</span>
                        </td>
                        <td>
                          <span className="text-sm font-mono text-[#0b2337]">{invoice.date}</span>
                        </td>
                        <td className="text-center">
                          <span className="text-sm font-black text-slate-600 tabular-nums">
                            {invoice.totalCartons} ك / {invoice.totalPieces} ق
                          </span>
                        </td>
                        <td className="text-left">
                          <span className="text-sm font-black text-[#0b2337] tabular-nums">{formatCurrency(invoice.estimatedGrandTotal)}</span>
                        </td>
                        <td className="text-center">
                          <span className="text-xs font-bold text-slate-500">{invoice.paymentMethod}</span>
                        </td>
                        <td className="text-center">
                          <span className={`tg-badge tg-badge--${style.variant}`}>
                            {style.label || invoice.status}
                          </span>
                        </td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onViewInvoice(invoice)}
                              className="w-8 h-8 rounded-xl bg-[#0D9488] hover:bg-[#007a70] text-white flex items-center justify-center transition shadow-xs cursor-pointer"
                              title="عرض الفاتورة"
                            >
                              <Eye className="w-4 h-4 text-white" />
                            </button>

                            {canEditPending && onEditInvoice && (
                              <button
                                type="button"
                                onClick={() => onEditInvoice(invoice)}
                                className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center transition cursor-pointer"
                                title="تعديل الفاتورة"
                              >
                                <Pencil className="w-4 h-4 text-amber-700" />
                              </button>
                            )}

                            {canApprove && (
                              <button
                                type="button"
                                onClick={() => handleApproveClick(invoice.id)}
                                className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition shadow-xs cursor-pointer"
                                title="اعتماد الفاتورة"
                              >
                                <CheckCircle2 className="w-4 h-4 text-white" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => downloadInvoicePDF(invoice)}
                              className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-[var(--tg-line)] flex items-center justify-center transition cursor-pointer"
                              title="تحميل PDF"
                            >
                              <Download className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination / Load More (الهوية الموحدة) */}
            {itemsPerPage !== 'all' && accessibleInvoices.length > itemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[var(--tg-line)]">
                <span className="text-xs font-bold text-slate-600">
                  عرض {displayedInvoices.length} من {accessibleInvoices.length} فاتورة
                </span>
                <div className="tg-pagination">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="tg-pagination__btn"
                  >
                    السابق
                  </button>
                  <span className="px-3 text-xs font-black text-slate-800">
                    صفحة {currentPage} من {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="tg-pagination__btn"
                  >
                    التالي
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals (unchanged logic) */}
      {auditInvoice && (
        <CreditAuditModal
          invoice={auditInvoice}
          isOpen={isAuditOpen}
          onClose={() => setIsAuditOpen(false)}
          customer={selectedCustomer || null}
        />
      )}
      {auditInvoice && (
        <CreditStatusBadge
          invoice={auditInvoice}
          customer={selectedCustomer || null}
        />
      )}
      {returnModalInvoice && (
        <OrderReturnModal
          invoice={returnModalInvoice}
          isOpen={!!returnModalInvoice}
          onClose={() => setReturnModalInvoice(null)}
          onSuccess={(msg) => {
            setSuccessToast(msg);
            setTimeout(() => setSuccessToast(null), 5000);
          }}
        />
      )}
      <ExcelInvoicePreviewModal
        invoice={previewExcelInvoice}
        isOpen={!!previewExcelInvoice}
        onClose={() => setPreviewExcelInvoice(null)}
      />

    </div>
  );
};

export default InvoicesManager;
