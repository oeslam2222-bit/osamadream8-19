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
  Trash2,
  AlertTriangle
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel, exportInvoiceForERP } from '../services/excelService';
import { formatArabicDate, formatCurrency } from '../services/invoiceService';
import { downloadInvoicePDF } from '../services/pdfService';
import { isArabicNameMatch } from '../services/arabicMatchingService';
import { Invoice } from '../types';
import { CompanySettingsModal } from './CompanySettingsModal';
import { CreditAuditModal } from './CreditAuditModal';
import { OrderReturnModal } from './OrderReturnModal';

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
  const {
    syncToAccounting,
    currentUser,
    rejectOrder,
    companyInfo,
    getCompanyInfoForBranch,
    invoices,
    deleteInvoice,
    deleteInvoiceWithShortage,
  } = useApp();
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(invoice);

  useEffect(() => {
    setActiveInvoice(invoice);
  }, [invoice]);

  const currentInv = activeInvoice || invoice;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [copiedInvoiceNo, setCopiedInvoiceNo] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('طلب تعديل أو إلغاء الطلبية وفك الحجز');
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);
  const [showCompanySettings, setShowCompanySettings] = useState(false);
  const [showCreditAudit, setShowCreditAudit] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSuccessMsg, setReturnSuccessMsg] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !currentInv) return null;

  const effectiveCompanyInfo = getCompanyInfoForBranch ? getCompanyInfoForBranch(currentInv.branchName) : companyInfo;

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

  const canEditOrder = Boolean(
    onEditInvoice &&
    isPending &&
    (isOwnerRep ||
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
    } finally {
      setIsDownloadingPDF(false);
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
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 flex items-center justify-center font-black shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black flex items-center gap-2">
                <span>فاتورة مبيعات معتمدة - شركة دريم</span>
                <span className="bg-amber-400/20 text-amber-300 text-[11px] font-mono px-2 py-0.5 rounded-md border border-amber-400/40">
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
                className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3.5 py-2 rounded-xl text-xs font-black transition shadow-sm cursor-pointer"
                title="تعديل الطلبية وإضافة أصناف جديدة في السلة"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل الطلبية / إضافة أصناف ✏️</span>
              </button>
            )}

            {/* Direct High-Quality PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white px-3.5 py-2 rounded-xl text-xs font-black transition shadow-sm cursor-pointer disabled:opacity-50"
              title="تحميل فاتورة PDF رسمية فاخرة ومعدة للطباعة"
            >
              <Download className={`w-3.5 h-3.5 ${isDownloadingPDF ? 'animate-bounce' : ''}`} />
              <span>{isDownloadingPDF ? 'جاري التجهيز...' : 'تحميل PDF فاخر 📄'}</span>
            </button>

            {/* Credit Audit Modal Button */}
            <button
              onClick={() => setShowCreditAudit(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="عرض جدول تدقيق الائتمان والمديونية المعتمد"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>تدقيق الائتمان 💳</span>
            </button>

            {/* Excel Download Standard */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title="تصدير شيت إكسل رسمي منسق"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير إكسل 📊</span>
            </button>

            {/* Excel Download ERP Format */}
            <button
              onClick={() => exportInvoiceForERP(invoice)}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-2 rounded-xl text-xs font-black transition shadow-xs cursor-pointer"
              title="تصدير شيت إكسل مهيأ للرفع على برنامج الحسابات الرئيسي (ERP)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">شيت ERP للسيستم</span>
            </button>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              title="طباعة فورية"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>

            {/* Delete Invoice Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              title="حذف هذه الفاتورة نهائياً"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>حذف 🗑️</span>
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
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
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
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-sm shadow-xs">
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
                  <span className="bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-amber-900 font-bold">
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
          <div className="bg-gradient-to-r from-amber-400/20 via-amber-400/10 to-amber-400/20 border border-amber-400/50 rounded-2xl p-2.5 text-center shadow-xs">
            <p className="text-xs sm:text-sm font-black text-amber-950 flex items-center justify-center gap-1.5">
              <span>✨ شكراً لتعاملكم واختياركم {companyInfo.nameArabic || 'شركة دريم للتجارة والتوزيع'} ❤️</span>
            </p>
          </div>

          {/* Shortage Invoice Banner */}
          {currentInv.isShortageInvoice && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-2xl">🚚</span>
                <div>
                  <div className="font-black text-indigo-950 text-sm">فاتورة نواقص محولة للصرف من المخزن المركزي (6 أكتوبر)</div>
                  <div className="text-indigo-800 text-[11px] mt-0.5">
                    هذه الفاتورة تمثل الأصناف المحولة تلقائياً للتوريد من المخزن المركزي بأكتوبر لعدم توفرها برصيد الفرع.
                  </div>
                </div>
              </div>
              {linkedParentInvoice && (
                <button
                  type="button"
                  onClick={() => setActiveInvoice(linkedParentInvoice)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                >
                  <span>عرض فاتورة المتوفر الأصلية (#{linkedParentInvoice.invoiceNumber})</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Available Items (Split) Banner */}
          {currentInv.hasShortageSplit && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-2xl">📦</span>
                <div>
                  <div className="font-black text-amber-950 text-sm">فاتورة الأصناف المتوفرة بالفرع (تم فصل النواقص)</div>
                  <div className="text-amber-900 text-[11px] mt-0.5">
                    تتضمن هذه الفاتورة الأصناف المتوفرة بمخزن الفرع. تم إصدار فاتورة نواقص منفصلة رقم <strong className="font-mono">{currentInv.shortageInvoiceNumber}</strong> للتوريد من المخزن المركزي بأكتوبر.
                  </div>
                </div>
              </div>
              {linkedShortageInvoice && (
                <button
                  type="button"
                  onClick={() => setActiveInvoice(linkedShortageInvoice)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                >
                  <span>عرض فاتورة النواقص (#{linkedShortageInvoice.invoiceNumber})</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              )}
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
          </div>

          {/* Items Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-white font-bold">
                <tr>
                  <th className="p-2.5 text-center w-8">م</th>
                  <th className="p-2.5">كود الصنف</th>
                  <th className="p-2.5">اسم وبيان الصنف</th>
                  <th className="p-2.5 text-center">شدة الكرتونة</th>
                  <th className="p-2.5 text-center">الكراتين المطلوبة</th>
                  <th className="p-2.5 text-left">سعر الكرتونة</th>
                  <th className="p-2.5 text-left">الإجمالي</th>
                  <th className="p-2.5 text-left">الخصم</th>
                  <th className="p-2.5 text-left">الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items.map((item, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">{index + 1}</td>
                    <td className="p-2.5 font-black font-mono text-slate-800">{item.productCode}</td>
                    <td className="p-2.5 font-bold text-slate-900">
                      <div>{item.productName}</div>
                      {item.fulfilledFrom === 'main_warehouse' && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-bold border border-amber-200 inline-block mt-0.5">
                          سحب مركزي (أكتوبر)
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-center text-slate-600 font-bold">{item.cartonQuantity || 1} ق</td>
                    <td className="p-2.5 text-center font-black text-amber-950 bg-amber-50/60">
                      {item.cartonCount} كرتونة
                    </td>
                    <td className="p-2.5 text-left font-bold text-slate-900">
                      {item.appliedPrice && item.appliedPrice !== item.pricePerCarton ? (
                        <div>
                          <span className="text-rose-600 font-black block">{formatCurrency(item.appliedPrice)}</span>
                          <span className="text-[10px] text-slate-400 line-through">{formatCurrency(item.pricePerCarton)}</span>
                        </div>
                      ) : (
                        formatCurrency(item.pricePerCarton)
                      )}
                    </td>
                    <td className="p-2.5 text-left font-medium text-slate-700">{formatCurrency(item.totalBeforeTax)}</td>
                    <td className="p-2.5 text-left text-emerald-700 font-medium">-{formatCurrency(item.discountAmount)}</td>
                    <td className="p-2.5 text-left font-black text-slate-950">{formatCurrency(item.netTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Returned Items & Credit Vouchers Summary (If any returns registered) */}
          {invoice.returnRecords && invoice.returnRecords.length > 0 && (
            <div className="bg-purple-50/70 border border-purple-200 rounded-3xl p-4 space-y-3 print:border-slate-300">
              <div className="flex items-center justify-between border-b border-purple-200/80 pb-2">
                <div className="flex items-center gap-2 text-purple-950 font-black text-xs">
                  <RotateCcw className="w-4 h-4 text-purple-700" />
                  <span>سجل قسائم المرتجعات المعتمدة على الفاتورة ({invoice.returnRecords.length} حركة)</span>
                </div>
                <span className="text-[11px] font-black bg-purple-200/80 text-purple-900 px-2.5 py-0.5 rounded-full">
                  إجمالي المرتجع: -{formatCurrency(invoice.totalRefundedAmount || 0)}
                </span>
              </div>

              <div className="space-y-2.5">
                {invoice.returnRecords.map((record, idx) => (
                  <div key={record.id || idx} className="bg-white p-3 rounded-2xl border border-purple-100 shadow-2xs space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded">
                          إذن مرتجع #{record.returnVoucherNumber}
                        </span>
                        <span className="text-slate-500 font-medium">
                          {record.date} {record.time ? `(${record.time})` : ''} • المنفذ: {record.handledBy}
                        </span>
                      </div>
                      <div className="font-black text-purple-950">
                        مبلغ الرد الدائن: {formatCurrency(record.totalRefundAmount)}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <strong>سبب الإرجاع:</strong> {record.reason}
                      </div>
                      <div className="text-emerald-700 font-bold">
                        {record.restockedToInventory ? '✓ تم إرجاع الكميات للمخزن الفعلي' : '⚠️ لم يتم الإرجاع للمخزن (أصناف تالفة)'}
                      </div>
                    </div>

                    {/* Returned items breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                      {record.returnedItems.map((rItem, rIdx) => (
                        <div key={rIdx} className="bg-purple-50/50 p-2 rounded-xl border border-purple-100 text-[11px] flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{rItem.productName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{rItem.productCode}</div>
                          </div>
                          <div className="text-left">
                            <span className="font-black text-purple-900 block">{rItem.cartonCount} كرتونة</span>
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
            <div className="w-full sm:w-96 bg-slate-900 text-white p-4 rounded-3xl space-y-2.5 text-xs shadow-md">
              <div className="flex justify-between items-center text-slate-300">
                <span>إجمالي الكراتين المطلوبة:</span>
                <strong className="text-white font-black text-sm">{invoice.totalCartons} كرتونة</strong>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>المجموع الفرعي (قبل الخصم):</span>
                <span className="font-bold">{formatCurrency(invoice.subtotal)}</span>
              </div>

              <div className="flex justify-between items-center text-emerald-400">
                <span>الخصم الممنوح ({invoice.discountPercentage}%):</span>
                <span className="font-bold">-{formatCurrency(invoice.discountAmount)}</span>
              </div>

              <div className="pt-2 border-t border-slate-700 flex justify-between items-center">
                <span className="font-bold text-slate-200 text-xs">إجمالي الفاتورة الصافي:</span>
                <div className="text-lg font-black text-amber-400 font-mono">
                  {formatCurrency(invoice.estimatedGrandTotal)}
                </div>
              </div>

              {/* Customer Debt & Credit Limit Breakdown */}
              <div className="pt-2 border-t border-slate-700/80 space-y-1.5 text-[11px]">
                <div className="flex justify-between items-center text-slate-300">
                  <span>مديونية العميل السابقة:</span>
                  <span className="font-bold font-mono">{formatCurrency(invoice.customerBalanceBefore || 0)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span>المديونية الإجمالية بعد الفاتورة:</span>
                  <span className={`font-black font-mono ${invoice.creditLimitExceeded ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {formatCurrency(invoice.customerBalanceAfter || ((invoice.customerBalanceBefore || 0) + invoice.estimatedGrandTotal))}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>الحد الائتماني المعتمد:</span>
                  {(invoice.customerCreditLimit || 0) <= 0 ? (
                    <span className="font-bold text-amber-300 text-[10px] bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded">
                      لا يوجد حد ائتماني (سداد نقدي)
                    </span>
                  ) : (
                    <span className="font-bold font-mono text-blue-300">{formatCurrency(invoice.customerCreditLimit || 0)}</span>
                  )}
                </div>
                {invoice.creditLimitExceeded && (
                  <div className="bg-rose-950/90 border border-rose-500/80 p-2 rounded-xl text-rose-200 text-[10px] space-y-0.5 mt-1">
                    <div className="font-black text-rose-300 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      <span>⚠️ تم تجاوز الحد الائتماني للعميل</span>
                    </div>
                    <div>
                      مبلغ السداد النقدي المطلوب فوراً:{' '}
                      <strong className="text-amber-300 font-mono font-black">{formatCurrency(invoice.requiredDownPayment || 0)}</strong>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowCreditAudit(true)}
                  className="w-full mt-2 bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-500/50 hover:border-blue-400 py-1.5 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
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
            {/* Quick PDF Button */}
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloadingPDF}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloadingPDF ? 'جاري التحميل...' : 'تحميل PDF 📄'}</span>
            </button>

            {/* Standard Excel Button */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تصدير شيت إكسل 📊</span>
            </button>

            {/* Copy Invoice Number */}
            <button
              onClick={handleCopyInvoiceNumber}
              className="flex items-center gap-1 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 px-3 py-2 rounded-xl transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedInvoiceNo ? 'تم نسخ الرقم! ✓' : 'نسخ رقم الفاتورة'}</span>
            </button>

            {/* Return Action Button (Full/Partial Return for Delivered, Closed, or In-progress orders) */}
            {canMakeReturn && (
              <button
                onClick={() => setShowReturnModal(true)}
                className="flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold px-3 py-2 rounded-xl text-xs border border-purple-300 transition cursor-pointer shadow-xs"
                title="تسجيل إذن مرتجع (كلي أو جزئي) وإعادة المخزون وتعديل المديونية"
              >
                <RotateCcw className="w-3.5 h-3.5 text-purple-700" />
                <span>إجراء مرتجع (كلي / جزئي) ↩️</span>
              </button>
            )}

            {/* Cancel Order button for Supervisor/Manager */}
            {canCancelOrder && (
              <button
                onClick={() => setShowCancelModal(true)}
                className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold px-3 py-2 rounded-xl text-xs border border-rose-300 transition cursor-pointer"
                title="إلغاء الطلبية وفك حجز المخزون"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>إلغاء الطلبية ❌</span>
              </button>
            )}
          </div>

          {/* Sync to Accounting / Close */}
          <div className="flex items-center gap-2 flex-wrap">
            {cancelFeedback && (
              <span className="text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                {cancelFeedback}
              </span>
            )}
            <button
              onClick={handleAccountingSync}
              disabled={isSyncing || invoice.syncedToAccounting}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition ${
                invoice.syncedToAccounting || syncSuccess
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>
                {invoice.syncedToAccounting || syncSuccess
                  ? 'مرحلة لنظام الحسابات المركزي (ERP)'
                  : isSyncing
                  ? 'جاري الترحيل...'
                  : 'ترحيل الفاتورة لنظام الحسابات'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2 rounded-xl text-xs shadow transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>

        </div>

        {/* Cancel Modal Confirmation for Manager/Supervisor */}
        {showCancelModal && (
          <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-rose-200 space-y-4">
              <div className="flex items-center gap-3 text-rose-700">
                <div className="p-2.5 bg-rose-100 rounded-2xl">
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-rose-500"
                  placeholder="اكتب سبب الإلغاء..."
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>تأكيد الإلغاء وفك الحجز</span>
                </button>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
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
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white font-black px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500 animate-in slide-in-from-bottom flex items-center gap-2 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{returnSuccessMsg}</span>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 text-right">
              <div className="flex items-center gap-3 text-rose-600 border-b border-slate-100 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">تأكيد حذف الفاتورة</h4>
                  <p className="text-[11px] text-slate-500 font-mono">
                    رقم: {currentInv.invoiceNumber}
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-3 text-xs space-y-1.5 border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-bold text-slate-800">{currentInv.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الإجمالي:</span>
                  <span className="font-black text-amber-700">{formatCurrency(currentInv.estimatedGrandTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الحالة:</span>
                  <span className="font-bold text-slate-700">{currentInv.status}</span>
                </div>
              </div>

              {linkedShortageInvoice ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 space-y-1">
                  <div className="font-black flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>تنبيه: توجد فاتورة نواقص مرتبطة ({linkedShortageInvoice.invoiceNumber})!</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    هل ترغب بحذف الفاتورتين معاً (المتاح والنواقص) لتنظيف السجلات بالكامل؟
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  هل أنت متأكد من حذف هذه الفاتورة نهائياً من قاعدة البيانات والسجلات؟
                </p>
              )}

              <div className="space-y-2 pt-1">
                {linkedShortageInvoice && (
                  <button
                    onClick={() => {
                      deleteInvoiceWithShortage(currentInv.id);
                      setShowDeleteConfirm(false);
                      onClose();
                    }}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف الفاتورتين معاً (المتاح + النواقص)</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    deleteInvoice(currentInv.id);
                    setShowDeleteConfirm(false);
                    onClose();
                  }}
                  className={`w-full font-bold py-2.5 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    linkedShortageInvoice
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      : 'bg-rose-600 hover:bg-rose-700 text-white font-black shadow-md'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{linkedShortageInvoice ? 'حذف هذه الفاتورة فقط' : 'نعم، تأكيد الحذف نهائياً'}</span>
                </button>

                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="w-full py-2 bg-transparent text-slate-500 hover:text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
                >
                  إلغاء وتراجع
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
