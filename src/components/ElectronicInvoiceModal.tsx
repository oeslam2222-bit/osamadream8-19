import {
  Building2,
  CheckCircle,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  MapPin,
  Pencil,
  Phone,
  Printer,
  QrCode,
  RotateCcw,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  UserCheck,
  X,
  XCircle,
  ArrowLeft,
  ExternalLink,
  Truck,
  CloudUpload,
  Loader2,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP, downloadInvoiceBoth } from '../services/excelService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
import { isArabicNameMatch, resolveCustomerFinancials } from '../services/arabicMatchingService';
import { Invoice } from '../types';
import { supabase } from '../services/supabaseService';
import { CompanySettingsModal } from './CompanySettingsModal';
import { CreditAuditModal } from './CreditAuditModal';
import { OrderReturnModal } from './OrderReturnModal';
import { ExcelInvoicePreviewModal } from './ExcelInvoicePreviewModal';
import { CustomerFinancialSummaryCard } from './CustomerFinancialSummaryCard';

interface ElectronicInvoiceModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
  onEditInvoice?: (invoice: Invoice) => void;
}

export const ElectronicInvoiceModal: React.FC<ElectronicInvoiceModalProps> = ({
  invoice,
  isOpen,
  onClose,
  onEditInvoice,
}) => {
  const { syncToAccounting, currentUser, rejectOrder, companyInfo, getCompanyInfoForBranch, invoices, customers } = useApp();
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(invoice);

  useEffect(() => {
    setActiveInvoice(invoice);
  }, [invoice]);

  const currentInv = activeInvoice || invoice;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [copiedInvoiceNo, setCopiedInvoiceNo] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('طلب تعديل أو إلغاء الطلبية وفك الحجز');
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [showCompanySettings, setShowCompanySettings] = useState(false);
  const [showCreditAudit, setShowCreditAudit] = useState(false);
  const [showExcelPreview, setShowExcelPreview] = useState(false);
  const [isDownloadingBoth, setIsDownloadingBoth] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);

  // Microsoft Dynamics 365 Order Integration State
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [dynamicsStatus, setDynamicsStatus] = useState<'pending' | 'sending' | 'sent' | 'failed' | string>('pending');
  const [dynamicsOrderNo, setDynamicsOrderNo] = useState<string | null>(null);
  const [dynamicsError, setDynamicsError] = useState<string | null>(null);
  const [isSendingDynamics, setIsSendingDynamics] = useState<boolean>(false);
  const [dynamicsSuccessToast, setDynamicsSuccessToast] = useState<string | null>(null);
  const [dynamicsErrorToast, setDynamicsErrorToast] = useState<string | null>(null);

  // Strictly check logged-in user's role in the `profiles` table ('admin' or 'developer')
  useEffect(() => {
    let isMounted = true;
    async function checkUserProfileRole() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || currentUser?.id;
        if (userId) {
          const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

          if (!error && data?.role && isMounted) {
            setProfileRole(String(data.role).toLowerCase().trim());
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to query profiles table for role:', err);
      }
      if (isMounted) {
        setProfileRole(currentUser?.role ? String(currentUser.role).toLowerCase().trim() : null);
      }
    }
    checkUserProfileRole();
    return () => { isMounted = false; };
  }, [currentUser]);

  const isAuthorizedRole = profileRole === 'admin' || profileRole === 'developer';
  const isDeveloperRole = profileRole === 'developer' || currentUser?.role === 'developer';

  // Fetch dynamics status, order number, and error from orders table
  const fetchOrderDynamicsState = async () => {
    if (!currentInv?.id) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('dynamics_status, dynamics_order_no, dynamics_error')
        .eq('id', currentInv.id)
        .maybeSingle();

      if (!error && data) {
        if (data.dynamics_status) {
          setDynamicsStatus(data.dynamics_status);
        }
        if (data.dynamics_order_no) {
          setDynamicsOrderNo(data.dynamics_order_no);
        }
        if (data.dynamics_error) {
          setDynamicsError(data.dynamics_error);
        }
      }
    } catch (err) {
      console.warn('Could not read dynamics state from orders table:', err);
    }
  };

  useEffect(() => {
    fetchOrderDynamicsState();
  }, [currentInv?.id]);

  const handleSendToDynamics = async () => {
    if (!currentInv?.id || isSendingDynamics) return;

    const confirmed = window.confirm('إرسال الأمر إلى Dynamics؟');
    if (!confirmed) return;

    setIsSendingDynamics(true);
    setDynamicsStatus('sending');
    setDynamicsErrorToast(null);

    try {
      const { data, error } = await supabase.functions.invoke('send-order-to-dynamics', {
        body: { order_id: currentInv.id },
      });

      if (error) {
        const msg = error.message || 'فشل الاتصال بدالة Dynamics';
        setDynamicsStatus('failed');
        setDynamicsError(msg);
        setDynamicsErrorToast(`حدث خطأ أثناء إرسال الأمر إلى Dynamics: ${msg}`);
        setTimeout(() => setDynamicsErrorToast(null), 7000);
        return;
      }

      if (data && data.error) {
        const msg = data.error || 'فشل إرسال الطلبية إلى Dynamics';
        setDynamicsStatus('failed');
        setDynamicsError(msg);
        setDynamicsErrorToast(`فشل إرسال الأمر: ${msg}`);
        setTimeout(() => setDynamicsErrorToast(null), 7000);
        return;
      }

      const returnedOrderNo =
        data?.dynamics_order_no ||
        data?.order_no ||
        data?.dynamicsOrderNo ||
        '';

      setDynamicsStatus('sent');
      if (returnedOrderNo) {
        setDynamicsOrderNo(returnedOrderNo);
      }
      setDynamicsError(null);
      setDynamicsSuccessToast(
        returnedOrderNo
          ? `تم إرسال الطلبية إلى Dynamics بنجاح! رقم الطلب: ${returnedOrderNo} ✅`
          : 'تم إرسال الطلبية إلى Dynamics بنجاح! ✅'
      );
      setTimeout(() => setDynamicsSuccessToast(null), 7000);

      // Refresh order record
      await fetchOrderDynamicsState();
    } catch (err: any) {
      const msg = err?.message || 'حدث خطأ غير متوقع أثناء إرسال الأمر إلى Dynamics';
      setDynamicsStatus('failed');
      setDynamicsError(msg);
      setDynamicsErrorToast(msg);
      setTimeout(() => setDynamicsErrorToast(null), 7000);
    } finally {
      setIsSendingDynamics(false);
    }
  };

  if (!isOpen || !currentInv) return null;

  const effectiveCompanyInfo = getCompanyInfoForBranch ? getCompanyInfoForBranch(currentInv.branchName) : companyInfo;

  const {
    debtBefore,
    creditLimit,
    debtAfter,
    isExceeded,
    requiredDown,
  } = resolveCustomerFinancials(currentInv, customers);

  const linkedShortageInvoice = currentInv.shortageInvoiceNumber
    ? invoices.find((i) => i.invoiceNumber === currentInv.shortageInvoiceNumber)
    : undefined;

  const linkedParentInvoice =
    currentInv.parentInvoiceNumber || currentInv.parentInvoiceId
      ? invoices.find((i) => i.invoiceNumber === currentInv.parentInvoiceNumber || i.id === currentInv.parentInvoiceId)
      : undefined;

  const isPending =
    currentInv.status === 'قيد مراجعة المشرف' ||
    currentInv.status === 'معلقة بانتظار اعتماد الفرع' ||
    currentInv.status === 'قيد المراجعة' ||
    currentInv.status === 'مسودة';

  const isOwnerRep =
    currentUser?.role === 'sales_rep' &&
    (currentInv.repId === currentUser.id ||
      currentInv.repName === currentUser.name ||
      (currentUser.username && currentInv.repId?.toLowerCase() === currentUser.username.toLowerCase()) ||
      isArabicNameMatch(currentInv.repName, currentUser.name));

  const isRecent = currentInv.createdAt ? (Date.now() - new Date(currentInv.createdAt).getTime() < 48 * 3600 * 1000) : true;

  const canEditOrder = Boolean(
    onEditInvoice &&
    (isPending || isRecent || isOwnerRep ||
      currentUser?.role === 'supervisor' ||
      currentUser?.role === 'branch_manager' ||
      currentUser?.role === 'admin' ||
      currentUser?.role === 'developer')
  );

  const canMakeReturn =
    (currentUser?.role === 'supervisor' ||
     currentUser?.role === 'branch_manager' ||
     currentUser?.role === 'admin' ||
     currentUser?.role === 'developer') &&
    (currentInv.status === 'معتمدة ومصروفة من المخزن' ||
     currentInv.status === 'معتمدة' ||
     currentInv.status === 'جاري التجهيز' ||
     currentInv.status === 'جاري تحضير المنتجات' ||
     currentInv.status === 'تم وصول المنتجات' ||
     currentInv.status === 'قيد التوصيل' ||
     currentInv.status === 'تم التسليم' ||
     currentInv.status === 'إغلاق الطلبية' ||
     currentInv.status === 'مرتجع جزئي');

  const canCancelOrder =
    isPending
      ? isOwnerRep ||
        currentUser?.role === 'supervisor' ||
        currentUser?.role === 'branch_manager' ||
        currentUser?.role === 'admin' ||
        currentUser?.role === 'developer'
      : (currentUser?.role === 'supervisor' ||
          currentUser?.role === 'branch_manager' ||
          currentUser?.role === 'admin' ||
          currentUser?.role === 'developer') &&
        currentInv.status !== 'تم التسليم' &&
        currentInv.status !== 'إغلاق الطلبية' &&
        currentInv.status !== 'مرتجع' &&
        currentInv.status !== 'مرفوضة / ملغاة' &&
        currentInv.status !== 'ملغاة';

  const handleCancelConfirm = () => {
    if (!currentInv) return;
    const res = rejectOrder(currentInv.id, cancelReason);
    if (res.success) {
      setCancelFeedback(res.message);
      setShowCancelModal(false);
      setTimeout(() => {
        setCancelFeedback(null);
        onClose();
      }, 2000);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloadingPDF(true);
    try {
      await downloadInvoicePDF(currentInv);
      setDownloadNotice(`تم تنزيل ملف PDF للفاتورة #${currentInv.invoiceNumber} مباشرة على جهازك بنجاح! 📥`);
      setTimeout(() => setDownloadNotice(null), 4000);
    } catch (e) {
      console.error('Download PDF error:', e);
      setDownloadNotice('تم إرسال أمر تنزيل الفاتورة إلى متصفحك.');
      setTimeout(() => setDownloadNotice(null), 3000);
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleDownloadBoth = async () => {
    if (!currentInv) return;
    setIsDownloadingBoth(true);
    try {
      await downloadInvoiceBoth(currentInv, effectiveCompanyInfo);
      setDownloadNotice(`تم تنزيل ملف PDF وملف Excel للفاتورة #${currentInv.invoiceNumber} مباشرة على جهازك بنجاح! 📥⚡`);
      setTimeout(() => setDownloadNotice(null), 4500);
    } catch (e) {
      console.error('Download both error:', e);
      setDownloadNotice('تم إرسال أمر تنزيل الفاتورة إلى جهازك.');
      setTimeout(() => setDownloadNotice(null), 3000);
    } finally {
      setIsDownloadingBoth(false);
    }
  };

  const handlePrint = () => {
    const source = document.getElementById('printable-invoice');
    if (!source) {
      window.print();
      return;
    }

    const printRoot = document.createElement('div');
    printRoot.id = 'invoice-print-root';
    [
      { label: 'نسخة العميل', internal: false },
      { label: 'نسخة المندوب', internal: true },
    ].forEach(({ label, internal }) => {
      const copy = source.cloneNode(true) as HTMLElement;
      copy.removeAttribute('id');
      copy.classList.add('invoice-print-copy');
      copy.dataset.copyLabel = label;
      if (!internal) copy.querySelectorAll('[data-internal-only]').forEach((node) => node.remove());
      printRoot.appendChild(copy);
    });

    document.body.appendChild(printRoot);
    const cleanup = () => {
      printRoot.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    window.setTimeout(cleanup, 1000);
  };

  const handleCopyInvoiceNumber = () => {
    navigator.clipboard.writeText(invoice.invoiceNumber);
    setCopiedInvoiceNo(true);
    setTimeout(() => setCopiedInvoiceNo(false), 2500);
  };

  const handleAccountingSync = async () => {
    setIsSyncing(true);
    const success = await syncToAccounting(invoice.id);
    setIsSyncing(false);
    if (success) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Top Control Bar (Hidden in Print) */}
        <div className="ein-topbar text-slate-soft6 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="ein-brandtile w-9 h-9 flex items-center justify-center font-black">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black flex items-center gap-2">
                <span>فاتورة مبيعات معتمدة - شركة دريم</span>
                <span className="badge-brass-dark text-[11px] font-mono px-2 py-0.5">
                  {invoice.invoiceNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                تصدير احترافي ومباشر بصيغتي PDF الرسمية وشيت إكسل عالي التنسيق
              </p>
            </div>
          </div>

          {/* Action Buttons in Header */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Edit / Re-open order if pending */}
            {canEditOrder && (
              <button
                onClick={() => {
                  onClose();
                  if (onEditInvoice) onEditInvoice(invoice);
                }}
                className="btn-brass px-3.5 py-2 text-xs cursor-pointer"
                title="تعديل الطلبية وإضافة أصناف جديدة في السلة"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل الطلبية / إضافة أصناف ✏️</span>
              </button>
            )}

            {/* Combined Direct Download: PDF + Excel together */}
            <button
              onClick={handleDownloadBoth}
              disabled={isDownloadingBoth}
              className="btn-ondark px-3.5 py-2 text-xs cursor-pointer disabled:opacity-50 active:scale-95"
              title="تحميل ملف PDF وملف Excel معاً مباشرة على جهازك بضغطة واحدة"
            >
              <Sparkles className="w-3.5 h-3.5 t-brass" />
              <span>{isDownloadingBoth ? 'جاري التنزيل المزدوج...' : 'تحميل الاثنين (PDF + Excel) ⚡'}</span>
            </button>

            {/* Direct High-Quality PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="btn-ondark px-3.5 py-2 text-xs cursor-pointer disabled:opacity-50"
              title="تحميل فاتورة PDF رسمية مباشرة على جهاز المندوب دون نافذة طباعة"
            >
              <Download className={`w-3.5 h-3.5 ${isDownloadingPDF ? 'animate-bounce' : ''}`} />
              <span>{isDownloadingPDF ? 'جاري التنزيل على الجهاز...' : 'تحميل PDF على الجهاز 📥'}</span>
            </button>

            {/* Excel Preview Modal Trigger */}
            <button
              onClick={() => setShowExcelPreview(true)}
              className="btn-ondark px-3.5 py-2 text-xs cursor-pointer"
              title="معاينة شيت الإكسل المطور والمحاسبي قبل التنزيل"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>معاينة شيت Excel 👁️</span>
            </button>

            {/* Direct Excel Download Standard */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(currentInv)}
              className="btn-ondark px-3 py-2 text-xs cursor-pointer"
              title="تصدير وتحميل شيت إكسل رسمي منسق مباشرة على جهازك"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحميل Excel فوري 📊</span>
            </button>

            {/* Credit Audit Modal Button */}
            <button
              onClick={() => setShowCreditAudit(true)}
              className="btn-ondark px-3 py-2 text-xs cursor-pointer"
              title="عرض جدول تدقيق الائتمان والمديونية المعتمد"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span className="hidden md:inline">تدقيق الائتمان 💳</span>
            </button>

            {/* Print Button (Subtle/Secondary) */}
            <button
              onClick={handlePrint}
              className="btn-ondark px-2.5 py-2 text-xs cursor-pointer"
              title="طباعة ورقية"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">طباعة</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamics 365 Integration Status & Action Bar (Hidden for all except Developer) */}
        {isDeveloperRole && (
          <div className="ein-topbar border-t border-[rgba(255,255,255,.08)] px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-slate-400 font-bold flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-blue-400" />
                <span>حالة ربط Dynamics:</span>
              </span>

              {/* Status Badge:
                  pending = رمادي "لم يُرسل"
                  sending = أصفر "جاري الإرسال"
                  sent = أخضر "تم الإرسال" + dynamics_order_no
                  failed = أحمر "فشل" (error text visible to developer only) */}
              {dynamicsStatus === 'sent' && (
                <span className="xls-note-ok inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>تم الإرسال</span>
                  {dynamicsOrderNo && (
                    <span className="font-mono bg-emerald-900/80 text-emerald-200 px-1.5 py-0.5 rounded text-[11px] border border-emerald-500/40">
                      #{dynamicsOrderNo}
                    </span>
                  )}
                </span>
              )}

              {dynamicsStatus === 'sending' && (
                <span className="xls-note-warn inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                  <span>جاري الإرسال</span>
                </span>
              )}

              {dynamicsStatus === 'failed' && (
                <span className="xls-note-risk inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span>فشل</span>
                  {dynamicsError && (
                    <span className="text-[11px] font-normal text-rose-300 max-w-sm truncate" title={dynamicsError}>
                      ({dynamicsError})
                    </span>
                  )}
                </span>
              )}

              {dynamicsStatus !== 'sent' && dynamicsStatus !== 'sending' && dynamicsStatus !== 'failed' && (
                <span className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  <span>لم يُرسل</span>
                </span>
              )}
            </div>

            {/* Button: Show ONLY for developer role when dynamics_status is pending or failed */}
            {(dynamicsStatus === 'pending' || dynamicsStatus === 'failed') && (
              <button
                type="button"
                onClick={handleSendToDynamics}
                disabled={isSendingDynamics}
                className="btn-ondark font-black px-3.5 py-1.5 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shrink-0"
                title="إرسال الطلبية إلى نظام Microsoft Dynamics (مخصص للمطور فقط)"
              >
                {isSendingDynamics ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-3.5 h-3.5 text-white" />
                    <span>إرسال لـ Dynamics 🚀</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Dynamics Success Toast */}
        {dynamicsSuccessToast && (
          <div className="panel-ok px-4 py-2.5 text-xs sm:text-sm font-black flex items-center justify-between shadow-md animate-fade-in print:hidden">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{dynamicsSuccessToast}</span>
            </div>
            <button
              onClick={() => setDynamicsSuccessToast(null)}
              className="text-emerald-200 hover:text-white text-xs underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Dynamics Error Toast */}
        {dynamicsErrorToast && (
          <div className="tint-risk border-b border-[rgba(179,74,74,.28)] px-4 py-2.5 text-xs sm:text-sm font-black flex items-center justify-between shadow-md animate-fade-in print:hidden">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{dynamicsErrorToast}</span>
            </div>
            <button
              onClick={() => setDynamicsErrorToast(null)}
              className="text-rose-200 hover:text-white text-xs underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Download Notice Notification */}
        {downloadNotice && (
          <div className="panel-ok px-4 py-2.5 text-xs sm:text-sm font-black flex items-center justify-between shadow-sm animate-fade-in print:hidden">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 animate-bounce" />
              <span>{downloadNotice}</span>
            </div>
            <button
              onClick={() => setDownloadNotice(null)}
              className="text-emerald-200 hover:text-white text-xs underline cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Quick Edit Banner on Mobile & Desktop */}
        {canEditOrder && (
          <div className="panel-warn border-b-2 px-4 py-2 flex items-center justify-between gap-2 text-xs print:hidden">
            <span className="font-bold">
              هل ترغب في تعديل كميات أو أصناف هذه الفاتورة؟
            </span>
            <button
              onClick={() => {
                onClose();
                if (onEditInvoice) onEditInvoice(invoice);
              }}
              className="app-btn app-btn-warn-soft px-3 text-xs cursor-pointer shrink-0"
            >
              <Pencil className="w-3 h-3" />
              <span>تعديل الفاتورة الآن ✏️</span>
            </button>
          </div>
        )}

        {/* Printable Official Electronic Invoice Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-5 text-slate-900 bg-white" id="printable-invoice">
          
          {/* Header Banner - Company Identity */}
          <div className="border-b-2 border-slate-900 pb-4 relative group">
            
            {/* Quick Edit Header Button for Admin/Developer/Branch Manager/Supervisor */}
            {['admin', 'developer', 'supervisor', 'branch_manager'].includes(currentUser?.role || '') && (
              <div className="absolute top-0 left-0 print:hidden opacity-90 group-hover:opacity-100 transition">
                <button
                  type="button"
                  onClick={() => setShowCompanySettings(true)}
                  className="tint-brass border px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  title="إعدادات بيانات الفاتورة للفرع"
                >
                  <Settings className="w-3 h-3 text-amber-600" />
                  <span>إعدادات بيانات الفاتورة {currentUser?.role === 'admin' || currentUser?.role === 'developer' ? '(الشركة / الفروع)' : `(${currentUser?.branchName})`} ✏️</span>
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              
              {/* Right: Company Logo & Details */}
              <div className="text-center sm:text-right space-y-1">
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <div className="w-8 h-8 rounded-lg icon-brass flex items-center justify-center font-black text-sm shadow-xs">
                    {effectiveCompanyInfo.logoLetter || 'D'}
                  </div>
                  <div>
                    <h1 className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight">
                      {effectiveCompanyInfo.nameArabic || effectiveCompanyInfo.name || 'شركة دريم للتجارة والتوزيع'}
                    </h1>
                    <div className="text-[10px] sm:text-xs font-bold text-slate-500 font-sans tracking-wide">
                      {effectiveCompanyInfo.nameEnglish || effectiveCompanyInfo.commercialNameEn || 'Dream Trading & Distribution Co.'}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-600 font-medium pt-1">
                  {effectiveCompanyInfo.activity || 'تجارة وتوزيع الأدوات المنزلية والزجاج والمستلزمات'} • {effectiveCompanyInfo.headquarters || effectiveCompanyInfo.address || 'المنطقة الصناعية الرابعة، مدينة 6 أكتوبر، الجيزة'}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-[11px] text-slate-700 pt-0.5">
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                    س.ت: <strong>{effectiveCompanyInfo.commercialRegister || '184920 - الجيزة'}</strong>
                  </span>
                  <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                    ب.ض: <strong>{effectiveCompanyInfo.taxNumber || '200-482-991'}</strong>
                  </span>
                  <span className="tint-brass border px-2 py-0.5 rounded font-bold">
                    الخط الساخن: <strong>{effectiveCompanyInfo.customerService || '19000 / 01000000001'}</strong>
                  </span>
                </div>
              </div>

              {/* Left: Official Invoice Tag & Stamp Badge */}
              <div className="flex items-center gap-3">
                <div className="text-center sm:text-left">
                  <div className="inline-block bg-slate-900 text-amber-300 font-black text-xs px-3.5 py-1 rounded-lg shadow-xs">
                    فاتورة مبيعات معتمدة
                  </div>
                  <div className="text-base font-black text-slate-900 mt-1 font-mono tracking-wider">
                    {invoice.invoiceNumber}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    تاريخ: {invoice.date} {invoice.time ? `(${invoice.time})` : ''}
                  </div>
                </div>

                {/* QR Code Identification */}
                <div className="w-20 h-20 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-900 flex flex-col items-center justify-center text-center shrink-0 shadow-xs">
                  <QrCode className="w-11 h-11 text-slate-900" />
                  <span className="text-[7px] font-black text-slate-700 pt-0.5 font-mono">{effectiveCompanyInfo.logoLetter || 'DREAM'} DIST</span>
                </div>
              </div>

            </div>
          </div>

          {/* Customer Appreciation Banner */}
          <div className="tint-brass border rounded-2xl p-2.5 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-black flex items-center justify-center gap-1.5">
              <span>✨ شكراً لتعاملكم واختياركم {companyInfo.nameArabic || 'شركة دريم للتجارة والتوزيع'} ❤️</span>
            </p>
          </div>

          {/* Unified Invoice & October Supply Notice Banner */}
          {currentInv.hasOctoberShortages && (
            <div className="panel-warn border-2 rounded-2xl p-3 sm:p-3.5 space-y-1.5 text-xs shadow-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚚</span>
                  <span className="font-black text-xs sm:text-sm">
                    فاتورة مبيعات موحدة (تتضمن أصنافاً مطلوب توريدها من مخزن 6 أكتوبر المركزي)
                  </span>
                </div>
                <span className="tint-brass border font-black px-2.5 py-0.5 rounded-full text-[11px]">
                  {currentInv.shortageItemsCount || 0} أصناف نواقص ({currentInv.shortageCartonsCount || 0} كرتونة)
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">
                تم تثبيت الطلبية كـ <strong>فاتورة واحدة معتمدة</strong> للعميل؛ الأصناف المتوفرة بـ <strong>{currentInv.branchName}</strong> تصرف مباشرة، والأصناف الموضحة بالجدول أدناه كـ <strong>«طلب توريد من المخزن»</strong> تم رفع إشعار توريدها لمشرف المندوب ومدير الفرع لسحبها من مخزن 6 أكتوبر المركزي.
              </p>
            </div>
          )}

          {/* Customer and Invoice Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold">اسم العميل / المنشأة:</span>
              <strong className="text-slate-900 text-xs sm:text-sm font-black flex items-center gap-1 mt-0.5">
                <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{currentInv.customerName}</span>
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">كود العميل:</span>
              <strong className="text-slate-900 font-mono font-bold block mt-0.5">
                {currentInv.customerCode || '---'}
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">هاتف العميل:</span>
              <strong className="text-slate-900 font-mono font-bold block mt-0.5">
                {currentInv.customerPhone || '---'}
              </strong>
            </div>

            <div>
              <span className="text-slate-400 block text-[10px] font-bold">عنوان التسليم:</span>
              <strong className="text-slate-900 font-semibold block mt-0.5 truncate" title={currentInv.customerAddress || ''}>
                {currentInv.customerAddress || '---'}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">المندوب المسئول:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {currentInv.repName}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">المشرف المسؤول:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {currentInv.supervisorName || 'الإدارة العامة'}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">فرع الصرف:</span>
              <strong className="text-slate-900 font-bold block mt-0.5">
                {currentInv.branchName}
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">طريقة السداد:</span>
              <span className="inline-block bg-slate-200 text-slate-900 px-2 py-0.5 rounded-md font-black text-[10px] mt-0.5">
                {currentInv.paymentMethod}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200/80">
              <span className="text-slate-400 block text-[10px] font-bold">حالة ربط Dynamics:</span>
              <div className="mt-0.5">
                {dynamicsStatus === 'sent' ? (
                  <span className="app-badge ok">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>تم الإرسال</span>
                    {dynamicsOrderNo && <span className="font-mono text-[10px]">({dynamicsOrderNo})</span>}
                  </span>
                ) : dynamicsStatus === 'sending' ? (
                  <span className="app-badge warn">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                    <span>جاري الإرسال</span>
                  </span>
                ) : dynamicsStatus === 'failed' ? (
                  <span className="app-badge risk">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    <span>فشل</span>
                    {isAuthorizedRole && dynamicsError && (
                      <span className="text-[10px] text-rose-600 font-normal">({dynamicsError})</span>
                    )}
                  </span>
                ) : (
                  <span className="app-badge neutral">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    <span>لم يُرسل</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Unified Financial Position Card (Synchronized with All Customers database and POS Cashier) */}
          <CustomerFinancialSummaryCard
            customer={{
              id: currentInv.customerId,
              code: currentInv.customerCode,
              name: currentInv.customerName,
              phone: currentInv.customerPhone,
              address: currentInv.customerAddress,
              branchName: currentInv.branchName,
              currentBalance: currentInv.customerBalanceBefore,
              creditLimit: currentInv.customerCreditLimit,
              totalOverdueAndDue: currentInv.customerOverdueBalance,
            }}
            currentInvoiceAmount={currentInv.estimatedGrandTotal}
            theme="light"
            initiallyOpen={true}
            title="الموقف المالي والائتماني المعتمد للعميل (كافة العملاء)"
          />

          {/* Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-x-auto shadow-xs">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-2.5 text-center w-8">م</th>
                  <th className="p-2.5">كود الصنف</th>
                  <th className="p-2.5 text-center">الكود الموحد</th>
                  <th className="p-2.5">اسم وبيان الصنف</th>
                  <th className="p-2.5 text-center">شدة الكرتونة</th>
                  <th className="p-2.5 text-center">عدد الكرتون</th>
                  <th className="p-2.5 text-center">عدد القطع</th>
                  <th className="p-2.5 text-left">سعر القطعة</th>
                  <th className="p-2.5 text-left">سعر الكرتونة</th>
                  <th className="p-2.5 text-left">المبلغ الصافي</th>
                  <th className="p-2.5 text-center">التوفر بـ {currentInv.branchName || 'الفرع'} ومخزن أكتوبر</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items.map((item, index) => {
                  const unified = item.unifiedCode || (item.product as any)?.unifiedCode;
                  const cQty = item.cartonQuantity || 1;
                  const pPrice = item.pricePerPiece || (cQty > 0 ? Math.round((item.pricePerCarton / cQty) * 100) / 100 : item.pricePerCarton);
                  const bStock = typeof item.branchStockAtOrder === 'number' ? item.branchStockAtOrder : ((item.product as any)?.branchStockActual ?? 0);
                  const oStock = typeof item.octoberStockAtOrder === 'number' ? item.octoberStockAtOrder : ((item.product as any)?.mainWarehouseActual ?? 0);
                  const isShortage = item.isShortage || item.needsOctoberSupply || (item.cartonCount || 0) > bStock;
                  const shortageC = item.shortageCartons && item.shortageCartons > 0 ? item.shortageCartons : Math.max(0, (item.cartonCount || 0) - Math.max(0, bStock));

                  return (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                      <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{index + 1}</td>
                      <td className="p-2.5 font-black font-mono text-slate-800">{item.productCode}</td>
                      <td className="p-2.5 text-center font-mono font-bold t-navy">
                        {unified ? (
                          <span className="tint-navy px-2 py-0.5 rounded border border-slate-border-deep text-[11px]">
                            {unified}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900">
                        <div>
                          <span>{item.productName}</span>
                          {item.color && (
                            <span className="text-[11px] font-medium text-slate-500 mr-1.5">
                              ({item.color})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 text-center text-slate-600 font-bold">{cQty} ق</td>
                      <td className="p-2.5 text-center font-black tint-brass">
                        {item.cartonCount} ك
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-700 font-mono">
                        {item.pieceCount && item.pieceCount > 0 ? `${item.pieceCount} ق` : '—'}
                      </td>
                      <td className="p-2.5 text-left font-mono text-slate-600 text-[11px]">
                        {formatCurrency(pPrice)}
                      </td>
                      <td className="p-2.5 text-left font-bold text-slate-900 font-mono">
                        {item.appliedPrice && item.appliedPrice !== item.pricePerCarton ? (
                          <div>
                            <span className="t-risk font-black block">{formatCurrency(item.appliedPrice)}</span>
                            <span className="text-[10px] text-slate-400 line-through">{formatCurrency(item.pricePerCarton)}</span>
                          </div>
                        ) : (
                          formatCurrency(item.pricePerCarton)
                        )}
                      </td>
                      <td className="p-2.5 text-left font-black text-slate-950 font-mono bg-emerald-50/30">
                        {formatCurrency(item.netTotal)}
                      </td>
                      <td className="p-2.5 text-center text-[11px]">
                        {!isShortage ? (
                          <span className="app-badge ok text-[10px]">
                            متوفر بالفرع ✓
                          </span>
                        ) : oStock > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="tint-navy border border-slate-border-deep text-[10px] font-black px-1.5 py-0.5 rounded">
                              متوفر في مخزن أكتوبر ({oStock} ك)
                            </span>
                            <span className="tint-brass border text-[9px] font-black px-1.5 py-0.2 rounded shadow-2xs">
                              🏷️ طلب توريد من المخزن ({shortageC} ك)
                            </span>
                          </div>
                        ) : (
                          <span className="app-badge risk text-[10px]">
                            عجز بالمخازن
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Returned Items & Credit Vouchers Summary (If any returns registered) */}
          {invoice.returnRecords && invoice.returnRecords.length > 0 && (
            <div className="panel-navy border rounded-3xl p-4 space-y-3 print:border-slate-300">
              <div className="flex items-center justify-between border-b border-slate-border-deep pb-2">
                <div className="flex items-center gap-2 font-black text-xs">
                  <RotateCcw className="w-4 h-4 t-navy" />
                  <span>سجل قسائم المرتجعات المعتمدة على الفاتورة ({invoice.returnRecords.length} حركة)</span>
                </div>
                <span className="tint-brass border text-[11px] font-black px-2.5 py-0.5 rounded-full">
                  إجمالي المرتجع: -{formatCurrency(invoice.totalRefundedAmount || 0)}
                </span>
              </div>

              <div className="space-y-2.5">
                {invoice.returnRecords.map((record, idx) => (
                  <div key={record.id || idx} className="bg-white p-3 rounded-2xl border border-slate-border-deep shadow-2xs space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="tint-navy border border-slate-border-deep font-mono font-black px-2 py-0.5 rounded">
                          إذن مرتجع #{record.returnVoucherNumber}
                        </span>
                        <span className="text-slate-500 font-medium">
                          {record.date} {record.time ? `(${record.time})` : ''} • المنفذ: {record.handledBy}
                        </span>
                      </div>
                      <div className="font-black app-ink-brass">
                        مبلغ الرد الدائن: {formatCurrency(record.totalRefundAmount)}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <strong>سبب الإرجاع:</strong> {record.reason}
                      </div>
                      <div className="t-ok font-bold">
                        {record.restockedToInventory ? '✓ تم إرجاع الكميات للمخزن الفعلي' : '⚠️ لم يتم الإرجاع للمخزن (أصناف تالفة)'}
                      </div>
                    </div>

                    {/* Returned items breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                      {record.returnedItems.map((rItem, rIdx) => (
                        <div key={rIdx} className="row-brass p-2 rounded-xl border border-slate-border-deep text-[11px] flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{rItem.productName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{rItem.productCode}</div>
                          </div>
                          <div className="text-left">
                            <span className="font-black t-navy block">{rItem.cartonCount} كرتونة</span>
                            <span className="text-[10px] font-bold text-slate-600">({rItem.pieceCount} ق)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary & Stamp Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            
            {/* Notes & Stamps */}
            <div className="w-full sm:w-1/2 space-y-3">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-800 block text-[11px]">شروط وإقرار الاستلام لشركة دريم:</span>
                <p className="text-slate-500 text-[10px] leading-relaxed">
                  البضاعة المباعة تخضع لمطابقة الكود والعدد عند الاستلام. يعتبر توقيع العميل إقراراً بالاستلام بحالة ممتازة ومطابقة لكشف الحساب.
                </p>
                {invoice.notes && (
                  <div className="pt-1 text-slate-800 font-bold text-[11px]">
                    ملاحظات: {invoice.notes}
                  </div>
                )}
              </div>

              {/* Official Signatures & Stamp */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="text-center p-2 border border-dashed border-slate-300 rounded-2xl">
                  <div className="h-10 flex items-center justify-center font-black text-slate-300 text-xs">
                    ختم شركة دريم
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 border-t border-slate-200 pt-1 block">
                    اعتماد الإدارة / المشرف
                  </span>
                </div>

                <div className="text-center p-2 border border-dashed border-slate-300 rounded-2xl">
                  <div className="h-10 flex items-center justify-center font-black text-slate-300 text-xs">
                    توقيع المستلم
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 border-t border-slate-200 pt-1 block">
                    استلام وختم العميل
                  </span>
                </div>
              </div>
            </div>

            {/* Calculations Totals Box */}
            <div className="w-full sm:w-96 navy-panel text-white p-4 rounded-3xl space-y-2.5 text-xs shadow-md">
              <div className="flex justify-between items-center text-slate-300">
                <span>إجمالي الكراتين المطلوبة:</span>
                <strong className="text-white dream-amt text-sm">{invoice.totalCartons} كرتونة</strong>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>المجموع الفرعي (قبل الخصم):</span>
                <span className="dream-amt">{formatCurrency(invoice.subtotal)}</span>
              </div>

              {invoice.discountAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-400">
                  <span>الخصم الممنوح ({invoice.discountPercentage}%):</span>
                  <span className="dream-amt">-{formatCurrency(invoice.discountAmount)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-[rgba(255,255,255,.14)] flex justify-between items-center">
                <span className="font-bold text-slate-200 text-xs">إجمالي الفاتورة الصافي:</span>
                <div className="text-lg dream-amt text-amber-400 font-mono">
                  {formatCurrency(invoice.estimatedGrandTotal)}
                </div>
              </div>

              {/* Customer Debt & Credit Limit Breakdown */}
              <div className="pt-2 border-t border-[rgba(255,255,255,.14)] space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-slate-300">
                  <span>مديونية العميل السابقة:</span>
                  <span className="dream-amt font-mono">{formatCurrency(debtBefore)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>المديونية الإجمالية بعد الفاتورة:</span>
                  <span className={`dream-amt font-mono ${isExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatCurrency(debtAfter)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>الحد الائتماني المعتمد:</span>
                  {creditLimit <= 0 ? (
                    <span className="font-bold text-amber-300 text-[10px] bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded">
                      لا يوجد حد ائتماني (سداد نقدي)
                    </span>
                  ) : (
                    <span className="dream-amt font-mono text-blue-300">{formatCurrency(creditLimit)}</span>
                  )}
                </div>
                {isExceeded && (
                  <div className="xls-note-risk border p-2 rounded-xl text-[10px] space-y-0.5 mt-1">
                    <div className="font-black text-rose-300 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      <span>⚠️ تم تجاوز الحد الائتماني للعميل</span>
                    </div>
                    <div>
                      مبلغ السداد النقدي المطلوب فوراً:{' '}
                      <strong className="text-amber-300 dream-amt font-mono font-black">{formatCurrency(requiredDown)}</strong>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowCreditAudit(true)}
                  className="btn-ondark w-full mt-2 py-1.5 px-2.5 text-[10px] cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                  <span>فتح جدول تدقيق الائتمان والمديونية الشامل 🔍</span>
                </button>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer Controls (Hidden in Print) */}
        <div className="bg-slate-50 p-3.5 sm:p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Combined Download */}
            <button
              onClick={handleDownloadBoth}
              disabled={isDownloadingBoth}
                className="btn-brass px-4 py-2 text-xs cursor-pointer disabled:opacity-50 active:scale-95"
              title="تحميل ملف PDF وملف Excel معاً مباشرة على جهازك"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isDownloadingBoth ? 'جاري التحميل...' : 'تحميل الاثنين (PDF + Excel) ⚡'}</span>
            </button>

            {/* Quick PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="app-btn app-btn-primary px-4 py-2 text-xs cursor-pointer disabled:opacity-50"
              title="تحميل ملف PDF مباشرة على جهازك"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPDF ? 'جاري التحميل...' : 'تحميل PDF مباشر 📄'}</span>
            </button>

            {/* Preview Excel Modal */}
            <button
              onClick={() => setShowExcelPreview(true)}
              className="app-btn app-btn-ghost px-3.5 py-2 text-xs cursor-pointer"
              title="معاينة شيت الإكسيل قبل التحميل"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>معاينة Excel 👁️</span>
            </button>

            {/* Direct Excel Button */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(currentInv)}
              className="app-btn app-btn-ghost px-3.5 py-2 text-xs cursor-pointer"
              title="تحميل شيت إكسل رسمي فوري"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل Excel 📊</span>
            </button>

            {/* Copy Invoice Number */}
            <button
              onClick={handleCopyInvoiceNumber}
              className="btn-ghost px-3 py-2 text-xs cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedInvoiceNo ? 'تم نسخ الرقم! ✓' : 'نسخ رقم الفاتورة'}</span>
            </button>

            {/* Return Action Button (Full/Partial Return for Delivered, Closed, or In-progress orders) */}
            {canMakeReturn && (
              <button
                onClick={() => setShowReturnModal(true)}
                className="app-btn app-btn-warn-soft px-3 py-2 text-xs cursor-pointer"
                title="تسجيل إذن مرتجع (كلي أو جزئي) وإعادة المخزون وتعديل المديونية"
              >
                <RotateCcw className="w-3.5 h-3.5 t-warn" />
                <span>إجراء مرتجع (كلي / جزئي) ↩️</span>
              </button>
            )}

            {/* Cancel Order button for Supervisor/Manager */}
            {canCancelOrder && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="app-btn app-btn-risk-soft px-3 py-2 text-xs cursor-pointer"
                title="إلغاء الطلبية وفك حجز المخزون"
              >
                <XCircle className="w-3.5 h-3.5 t-risk" />
                <span>إلغاء الطلبية ❌</span>
              </button>
            )}
          </div>

          {/* Close / Action Feedback */}
          <div className="flex items-center gap-2 flex-wrap">
            {cancelFeedback && (
              <span className="app-badge risk px-2.5 py-1 text-xs">
                {cancelFeedback}
              </span>
            )}

            <button
              onClick={onClose}
              className="btn-primary px-6 py-2 text-xs cursor-pointer"
            >
              إغلاق النافذة
            </button>
          </div>

        </div>

        {/* Cancel Modal Confirmation for Manager/Supervisor */}
        {showCancelModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-rose-200 space-y-4">
              <div className="flex items-center gap-3 text-rose-700">
                <div className="p-2.5 tint-risk rounded-2xl">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">إلغاء الطلبية واسترجاع المخزون</h3>
                  <p className="text-xs text-slate-500">فاتورة رقم: {invoice.invoiceNumber}</p>
                </div>
              </div>

              <p className="text-xs text-slate-700 font-medium">
                بصفتك (مشرف أو مدير الفرع)، يمكنك إلغاء هذه الطلبية في أي وقت. سيتم فوراً فك حجز الكراتين وإرجاع الأرصدة لمخزن الفرع.
              </p>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">سبب الإلغاء:</label>
                <textarea
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-900"
                  placeholder="اكتب سبب الإلغاء..."
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleCancelConfirm}
                  className="btn-danger flex-1 py-2.5 text-xs cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>تأكيد الإلغاء وفك الحجز</span>
                </button>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="btn-ghost px-4 py-2.5 text-xs cursor-pointer"
                >
                  تراجع
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Company Header & Identity Settings Modal */}
        {showCompanySettings && (
          <CompanySettingsModal
            isOpen={showCompanySettings}
            onClose={() => setShowCompanySettings(false)}
            targetBranchName={invoice.branchName}
          />
        )}

        {/* Credit & Financial Audit Modal */}
        {showCreditAudit && (
          <CreditAuditModal
            invoice={invoice}
            isOpen={showCreditAudit}
            onClose={() => setShowCreditAudit(false)}
          />
        )}

        {/* Excel Invoice Preview & Direct Download Modal */}
        {showExcelPreview && (
          <ExcelInvoicePreviewModal
            invoice={currentInv}
            isOpen={showExcelPreview}
            onClose={() => setShowExcelPreview(false)}
          />
        )}

        {/* Advanced Itemized Order Return Modal */}
        {showReturnModal && invoice && (
          <OrderReturnModal
            invoice={invoice}
            isOpen={showReturnModal}
            onClose={() => setShowReturnModal(false)}
            onSuccess={(msg) => {
              setReturnSuccessMsg(msg);
              setTimeout(() => setReturnSuccessMsg(null), 6000);
            }}
          />
        )}

        {returnSuccessMsg && (
          <div className="panel-ok fixed bottom-6 right-6 z-50 font-black px-4 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom flex items-center gap-2 text-xs">
            <CheckCircle className="w-4 h-4 t-ok" />
            <span>{returnSuccessMsg}</span>
          </div>
        )}

      </div>
    </div>
  );
};
