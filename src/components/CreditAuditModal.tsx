import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Building,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  User,
  UserCheck,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { exportElectronicInvoiceToExcel } from '../services/excelService';
import { formatCurrency } from '../services/invoiceService';
import { Customer, Invoice } from '../types';
import { findCustomerMatch, resolveCustomerFinancials } from '../services/arabicMatchingService';

interface CreditAuditModalProps {
  invoice: Invoice | null;
  customer?: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onApprove?: (invoiceId: string) => void;
  onReject?: (invoice: Invoice) => void;
}

export const CreditAuditModal: React.FC<CreditAuditModalProps> = ({
  invoice,
  customer: propCustomer,
  isOpen,
  onClose,
  onViewInvoice,
  onApprove,
  onReject,
}) => {
  const { customers, invoices, getVisibleInvoices, currentUser, companyInfo, updateOrderStatus } = useApp();

  if (!isOpen || !invoice) return null;

  // Resolve customer object from context or props using intelligent matcher
  const matchedCustomer =
    propCustomer ||
    findCustomerMatch(customers, {
      customerId: invoice.customerId,
      customerCode: invoice.customerCode,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
    });

  // Accurate financial position resolution
  const invoiceTotal = invoice.estimatedGrandTotal || 0;
  const {
    debtBefore,
    creditLimit,
    debtAfter,
    overdue: overdueDebt,
    isExceeded,
    requiredDown: requiredDownPayment,
  } = resolveCustomerFinancials(invoice, customers);

  const hasOverdue = overdueDebt > 0;
  const hasNoCredit = creditLimit <= 0;
  const excessAmount = isExceeded ? Math.max(0, debtAfter - creditLimit) : 0;
  const remainingCredit = !hasNoCredit && !isExceeded ? Math.max(0, creditLimit - debtAfter) : 0;

  // Utilization calculation
  const utilizationPercentage = creditLimit > 0 ? Math.round((debtAfter / creditLimit) * 100) : debtAfter > 0 ? 100 : 0;

  // Previous invoices of this customer (Strict Data Privacy)
  const customerPastInvoices = getVisibleInvoices()
    .filter(
      (inv) =>
        inv.id !== invoice.id &&
        ((invoice.customerId && inv.customerId === invoice.customerId) ||
          (invoice.customerName && inv.customerName.trim().toLowerCase() === invoice.customerName.trim().toLowerCase()))
    )
    .slice(0, 5);

  const canManage =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'developer' ||
    currentUser?.role === 'branch_manager' ||
    currentUser?.role === 'supervisor';

  const isPendingApproval =
    invoice.status === 'قيد مراجعة المشرف' ||
    invoice.status === 'معلقة بانتظار اعتماد الفرع' ||
    invoice.status === 'قيد المراجعة';

  // Copy WhatsApp breakdown
  const handleCopyWhatsApp = () => {
    const text = `📊 *تقرير تدقيق الائتمان والمديونية - ${companyInfo.nameArabic}*
━━━━━━━━━━━━━━━━━━━━
🏢 *العميل:* ${invoice.customerName}
🔢 *كود العميل:* ${invoice.customerCode || '---'}
📞 *هاتف:* ${invoice.customerPhone || '---'}
📍 *الفرع:* ${invoice.branchName}
👤 *المندوب:* ${invoice.repName}

🧾 *تفاصيل الفاتورة (${invoice.invoiceNumber}):*
• إجمالي الفاتورة: ${invoiceTotal.toLocaleString()} ج.م (${invoice.totalCartons} كرتونة)
• تاريخ الطلبية: ${invoice.date}

💰 *الموقف المالي والائتماني:*
• المديونية الحالية السابقة: ${debtBefore.toLocaleString()} ج.م
• المتأخرات المستحقة على العميل: ${hasOverdue ? `${overdueDebt.toLocaleString()} ج.م ⚠️` : 'لا توجد (0 ج.م) ✅'}
• قيمة الفاتورة الحالية: +${invoiceTotal.toLocaleString()} ج.م
• *المديونية الإجمالية بعد الفاتورة:* ${debtAfter.toLocaleString()} ج.م
• *الحد الائتماني المعتمد:* ${hasNoCredit ? 'لا يوجد حد (نقدي فقط)' : `${creditLimit.toLocaleString()} ج.م`}

${
  isExceeded
    ? `🚨 *حالة الفاتورة:* متجاوزة الحد الائتماني بمقدار *${excessAmount.toLocaleString()} ج.م*
⚠️ *الدفعة المقدمة المطلوبة للاعتماد:* *${requiredDownPayment.toLocaleString()} ج.م*`
    : hasNoCredit
    ? `⚠️ *حالة الفاتورة:* تعامل نقدي بدون حد ائتماني`
    : `✅ *حالة الفاتورة:* ضمن الحد الائتماني المعتمد
💳 *الرصيد المتبقي المتاح للشراء:* *${remainingCredit.toLocaleString()} ج.م*`
}
━━━━━━━━━━━━━━━━━━━━
⏰ تم الإصدار عبر نظام دريم للتوزيع`;

    navigator.clipboard.writeText(text);
    alert('✅ تم نسخ التقرير المالي الشامل بتنسيق الواتساب بنجاح!');
  };

  return (
    <div
      id="credit-audit-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="credit-audit-modal-container"
        className="bg-white border-2 border-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden my-auto max-h-[92vh]"
      >
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md font-black text-xl border ${
                isExceeded
                  ? 'bg-[var(--app-risk)] border-[var(--app-risk)] text-[#ef4444]'
                  : hasNoCredit
                  ? 'bg-[var(--app-warn)] border-[var(--app-warn)] text-[#d97706]'
                  : 'bg-[var(--app-ok)] border-[var(--app-ok)] text-[#0d9488]'
              }`}
            >
              {isExceeded ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  جدول تدقيق الائتمان والمديونية
                </h2>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isExceeded
                      ? 'bg-[var(--app-risk)] text-[#ef4444] border-[var(--app-risk)]'
                      : hasNoCredit
                      ? 'bg-[var(--app-warn)] text-[#d97706] border-[var(--app-warn)]'
                      : 'bg-[var(--app-ok)] text-[#0d9488] border-[var(--app-ok)]'
                  }`}
                >
                  {isExceeded ? '⚠️ متجاوزة الحد' : hasNoCredit ? 'نقدي فقط' : '✅ ائتمان آمن'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                مخصص لمشرفي القطاعات ومديري الفروع لتقييم الملاءة المالية وقرارات الاعتماد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyWhatsApp}
              className="bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
              title="نسخ تقرير الائتمان للواتساب"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مشاركة واتساب</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          
          {/* Customer & Invoice Quick Header Strip */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] font-black flex items-center justify-center text-base border border-[var(--app-warn-line)] shrink-0">
                🏢
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-slate-900 text-base">{invoice.customerName}</h3>
                  {invoice.customerCode && (
                    <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded font-mono font-bold border border-slate-200">
                      كود: {invoice.customerCode}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  {invoice.customerPhone && (
                    <span className="flex items-center gap-1 text-slate-700">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {invoice.customerPhone}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-slate-700">
                    <Building className="w-3 h-3 text-slate-400" />
                    {invoice.branchName}
                  </span>
                  <span className="flex items-center gap-1 text-slate-700">
                    <User className="w-3 h-3 text-slate-400" />
                    المندوب: <strong>{invoice.repName}</strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-left sm:text-right">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">رقم الفاتورة</div>
              <div className="text-sm font-black font-mono text-slate-900">{invoice.invoiceNumber}</div>
              <div className="text-[10px] text-slate-500">{invoice.date} {invoice.time ? `• ${invoice.time}` : ''}</div>
            </div>
          </div>

          {/* 5 Core Financial Metric Cards (المديونية الحالية، المتأخرات المستحقة، الفاتورة، الحد الائتماني، بعد الفاتورة) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            
            {/* 1. Current Debt Before Invoice */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[11px] font-bold">1. المديونية الحالية (السابقة)</span>
                <Wallet className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="text-lg font-black text-slate-900 font-mono">
                {debtBefore.toLocaleString()} <span className="text-xs font-bold text-slate-500">ج.م</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-medium">
                رصيد الحساب قبل هذه الطلبية
              </div>
            </div>

            {/* 2. Overdue Debt (المتأخرات المستحقة على العميل) */}
            <div
              className={`p-3.5 rounded-xl border shadow-xs relative overflow-hidden flex flex-col justify-between ${
                hasOverdue
                  ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold ${hasOverdue ? 'text-[var(--app-warn-text)] font-black' : 'text-slate-500'}`}>
                  2. المتأخرات المستحقة
                </span>
                <Clock className={`w-3.5 h-3.5 ${hasOverdue ? 'text-[var(--app-warn-text)]' : 'text-slate-400'}`} />
              </div>
              <div className={`text-lg font-black font-mono ${hasOverdue ? 'text-[var(--app-risk-text)]' : 'text-slate-700'}`}>
                {overdueDebt.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
              </div>
              <div className="text-[10px] mt-1 font-bold">
                {hasOverdue ? (
                  <span className="text-[var(--app-risk-text)] bg-[var(--app-risk-tint)] px-1.5 py-0.5 rounded border border-[var(--app-risk-line)] inline-block font-black">
                    ⚠️ متأخرات واجبة التحصيل
                  </span>
                ) : (
                  <span className="text-[var(--app-ok-text)] font-medium">
                    ✅ لا توجد متأخرات سابقة
                  </span>
                )}
              </div>
            </div>

            {/* 3. Current Invoice Amount */}
            <div className="bg-white p-3.5 rounded-xl border border-[var(--app-warn-line)] bg-[var(--app-warn-tint)] shadow-xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--app-warn-text)] mb-1">
                <span className="text-[11px] font-bold">3. قيمة الفاتورة الحالية</span>
                <Receipt className="w-3.5 h-3.5 text-[var(--app-warn-text)]" />
              </div>
              <div className="text-lg font-black text-[var(--app-warn-text)] font-mono">
                {invoiceTotal.toLocaleString()} <span className="text-xs font-bold text-[var(--app-warn-text)]">ج.م</span>
              </div>
              <div className="text-[10px] text-[var(--app-warn-text)] mt-1 font-medium">
                {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
              </div>
            </div>

            {/* 4. Approved Credit Limit */}
            <div className="bg-white p-3.5 rounded-xl border border-[var(--app-navy-line)] bg-[var(--app-navy-tint)] shadow-xs relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between text-[var(--app-navy-text)] mb-1">
                <span className="text-[11px] font-bold">4. الحد الائتماني المعتمد</span>
                <CreditCard className="w-3.5 h-3.5 text-[var(--app-navy-text)]" />
              </div>
              <div className="text-lg font-black text-[var(--app-navy-text)] font-mono">
                {hasNoCredit ? (
                  <span className="text-sm font-bold text-[var(--app-warn-text)]">0 (نقدي فقط)</span>
                ) : (
                  <>
                    {creditLimit.toLocaleString()} <span className="text-xs font-bold text-[var(--app-navy-text)]">ج.م</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-[var(--app-navy-text)] mt-1 font-medium">
                {hasNoCredit ? 'سداد نقدي فوري' : 'سقف التسهيلات المعتمد'}
              </div>
            </div>

            {/* 5. Total Debt After Invoice */}
            <div
              className={`p-3.5 rounded-xl border shadow-xs relative overflow-hidden flex flex-col justify-between ${
                isExceeded
                  ? 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)] text-[var(--app-risk-text)]'
                  : hasNoCredit
                  ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
                  : 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black">5. المديونية بعد الفاتورة</span>
                <TrendingUp className={`w-3.5 h-3.5 ${isExceeded ? 'text-[var(--app-risk-text)]' : 'text-[var(--app-ok-text)]'}`} />
              </div>
              <div className={`text-lg font-black font-mono ${isExceeded ? 'text-[var(--app-risk-text)]' : 'text-[var(--app-ok-text)]'}`}>
                {debtAfter.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
              </div>
              <div className="text-[10px] font-bold mt-1">
                {isExceeded
                  ? `⚠️ تجاوز ${excessAmount.toLocaleString()} ج.م`
                  : hasNoCredit
                  ? 'تعامل نقدي بدون تسهيلات'
                  : `✅ متبقي ${remainingCredit.toLocaleString()} ج.م`}
              </div>
            </div>

          </div>

          {/* Credit Limit Exceeded & Decision Banner */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm ${
              isExceeded
                ? 'bg-gradient-to-r from-[var(--app-risk)] via-[var(--app-risk)] to-[var(--app-risk)] border-[var(--app-risk)] text-[var(--app-risk-text)]'
                : hasNoCredit
                ? 'bg-gradient-to-r from-[var(--app-warn)] via-[var(--app-warn)] to-[var(--app-warn)] border-[var(--app-warn)] text-[var(--app-warn-text)]'
                : 'bg-gradient-to-r from-[var(--app-ok)] via-[var(--app-ok)] to-[var(--app-ok)] border-[var(--app-ok)] text-[var(--app-ok-text)]'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                  isExceeded ? 'bg-[var(--app-risk)] text-white' : hasNoCredit ? 'bg-[var(--app-warn)] text-white' : 'bg-[var(--app-ok)] text-white'
                }`}
              >
                {isExceeded ? <AlertTriangle className="w-7 h-7" /> : <CheckCircle2 className="w-7 h-7" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-black">
                    {isExceeded
                      ? 'تنبيه: الفاتورة متجاوزة للحد الائتماني المعتمد!'
                      : hasNoCredit
                      ? 'تنبيه: العميل غير مسجل له حد ائتماني (نقدي)'
                      : 'الموقف الائتماني سليم وآمن (ضمن الحد)'}
                  </h4>
                  <span className="text-xs font-mono font-black bg-white/80 px-2 py-0.5 rounded border border-current">
                    {utilizationPercentage}% استهلاك
                  </span>
                </div>
                
                <p className="text-xs mt-1 leading-relaxed opacity-90">
                  {isExceeded ? (
                    <>
                      إجمالي مديونية العميل بعد الفاتورة ستصبح <strong>{debtAfter.toLocaleString()} ج.م</strong>، بينما الحد المسموح هو <strong>{creditLimit.toLocaleString()} ج.م</strong>.
                      يلزم تحصيل دفعة مقدمة قدرها <strong>{requiredDownPayment.toLocaleString()} ج.م</strong> أو الحصول على اعتماد استثنائي من مدير الفرع.
                    </>
                  ) : hasNoCredit ? (
                    <>
                      هذا العميل يتعامل بالسداد النقدي الفوري عند الاستلام. يجب تحصيل كامل قيمة الفاتورة <strong>{invoiceTotal.toLocaleString()} ج.م</strong> نقداً.
                    </>
                  ) : (
                    <>
                      حساب العميل ممتاز. المديونية الإجمالية بعد الفاتورة <strong>{debtAfter.toLocaleString()} ج.م</strong> لا تزال ضمن الحد المعتمد <strong>{creditLimit.toLocaleString()} ج.م</strong>، ويتبقى رصيد ائتماني متاح <strong>{remainingCredit.toLocaleString()} ج.م</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Visual Mini Progress */}
            <div className="w-full sm:w-48 shrink-0 bg-white/90 p-3 rounded-xl border border-current/20 shadow-2xs">
              <div className="flex justify-between text-[11px] font-black mb-1">
                <span>نسبة التغطية:</span>
                <span className="font-mono">{utilizationPercentage}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isExceeded ? 'bg-[var(--app-risk)]' : hasNoCredit ? 'bg-[var(--app-warn)]' : 'bg-[var(--app-ok)]'
                  }`}
                  style={{ width: `${Math.min(100, utilizationPercentage)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Detailed Elegant Audit Table (جدول التدقيق المالي والمحاسبي الشيك) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#d97706]" />
                <h4 className="font-black text-sm">بيان التدقيق الحسابي والمطابقة التفصيلية</h4>
              </div>
              <span className="text-xs text-slate-300 font-mono">طريقة الدفع: {invoice.paymentMethod}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold">
                  <tr>
                    <th className="p-3 text-right">البند والبيان المالي</th>
                    <th className="p-3 text-center">القيمة بالجنيه (ج.م)</th>
                    <th className="p-3 text-right">التأثير المحاسبي وتوجيه المشرف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  
                  {/* Row 1: Debt Before */}
                  <tr className="hover:bg-slate-50/80">
                    <td className="p-3.5 font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>المديونية الحالية السابقة للعميل</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-slate-900 text-sm">
                      {debtBefore.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 text-slate-600">
                      الرصيد الفعلي المستحق بذمة العميل قبل فتح هذه الطلبية
                    </td>
                  </tr>

                  {/* Row 2: Overdue Debt (المتأخرات المستحقة على العميل) */}
                  <tr className={`hover:bg-[var(--app-warn-tint)] ${hasOverdue ? 'bg-[var(--app-warn-tint)]' : ''}`}>
                    <td className="p-3.5 font-bold flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${hasOverdue ? 'bg-[var(--app-warn)] animate-ping' : 'bg-[var(--app-ok)]'}`}></span>
                      <span className={hasOverdue ? 'text-[var(--app-warn-text)] font-black' : 'text-slate-800'}>
                        المتأخرات المستحقة على العميل
                      </span>
                    </td>
                    <td className={`p-3.5 font-mono font-black text-center text-sm ${hasOverdue ? 'text-[var(--app-risk-text)] bg-[var(--app-warn-tint)] rounded-md' : 'text-slate-700'}`}>
                      {overdueDebt.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5">
                      {hasOverdue ? (
                        <span className="text-[var(--app-warn-text)] font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[var(--app-warn-text)] shrink-0" />
                          <span>توجد متأخرات مستحقة التحصيل الفوري على العميل لتفادي تعثر الحساب</span>
                        </span>
                      ) : (
                        <span className="text-[var(--app-ok-text)] font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--app-ok-text)] shrink-0" />
                          <span>لا توجد أي متأخرات سابقة مسجلة على العميل - سجل السداد منتظم</span>
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Row 3: Current Invoice Total */}
                  <tr className="hover:bg-[var(--app-warn-tint)] bg-[var(--app-warn-tint)]">
                    <td className="p-3.5 font-bold flex items-center gap-2 text-[var(--app-warn-text)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--app-warn)]"></span>
                      <span>قيمة الفاتورة الحالية (الطلبية)</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-[var(--app-warn-text)] text-sm">
                      +{invoiceTotal.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 text-[var(--app-warn-text)]">
                      تتضمن عدد <strong>{invoice.totalCartons} كرتونة</strong> ({invoice.totalPieces} قطعة)
                      {invoice.discountAmount > 0 ? ` بعد خصم ${invoice.discountAmount.toLocaleString()} ج.م` : ''}
                    </td>
                  </tr>

                  {/* Row 3: Total Debt After */}
                  <tr className="hover:bg-slate-50/80 font-black bg-slate-50">
                    <td className="p-3.5 flex items-center gap-2 text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-slate-900"></span>
                      <span>إجمالي المديونية بعد احتساب الفاتورة</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-[var(--app-ink)] text-base">
                      {debtAfter.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 text-slate-800">
                      المجموع التراكمي المطلوب من العميل عند تنفيذ الطلبية
                    </td>
                  </tr>

                  {/* Row 4: Credit Limit */}
                  <tr className="hover:bg-[var(--app-navy-tint)]">
                    <td className="p-3.5 font-bold flex items-center gap-2 text-[var(--app-navy-text)]">
                      <span className="w-2 h-2 rounded-full bg-[var(--app-navy)]"></span>
                      <span>الحد الائتماني المعتمد للعميل</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-[var(--app-navy-text)] text-sm">
                      {formatCurrency(hasNoCredit ? 0 : creditLimit)}
                    </td>
                    <td className="p-3.5 text-[var(--app-navy-text)]">
                      {hasNoCredit ? 'لا يوجد حد ائتماني مسجل للعميل (سداد نقدي فوري)' : 'أقصى سقف ائتماني مسموح به لهذا العميل'}
                    </td>
                  </tr>

                  {/* Row 5: Difference / Status */}
                  <tr className={isExceeded ? 'bg-[var(--app-risk-tint)] font-black' : 'bg-[var(--app-ok-tint)] font-black'}>
                    <td className="p-3.5 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isExceeded ? 'bg-[var(--app-risk)]' : 'bg-[var(--app-ok)]'}`}></span>
                      <span className={isExceeded ? 'text-[var(--app-risk-text)]' : 'text-[var(--app-ok-text)]'}>
                        {isExceeded ? 'مبلغ التجاوز (الدفعة المقدمة المطلوبة)' : 'الرصيد الائتماني المتبقي المتاح للشراء'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-base">
                      {isExceeded ? (
                        <span className="text-[var(--app-risk-text)]">-{excessAmount.toLocaleString()} ج.م ⚠️</span>
                      ) : (
                        <span className="text-[var(--app-ok-text)]">+{remainingCredit.toLocaleString()} ج.م ✅</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {isExceeded ? (
                        <span className="text-[var(--app-risk-text)]">
                          مطلوب سداد دفعة نقدية لا تقل عن <strong>{requiredDownPayment.toLocaleString()} ج.م</strong> لخفض المديونية للحد المسموح
                        </span>
                      ) : (
                        <span className="text-[var(--app-ok-text)]">
                          العميل يمكنه طلب بضاعة إضافية بقيمة تصل إلى <strong>{remainingCredit.toLocaleString()} ج.م</strong> بأمان
                        </span>
                      )}
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* Past Orders History for this customer */}
          {customerPastInvoices.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-600" />
                  <h4 className="font-bold text-xs text-slate-800">سجل أحدث طلبيات وفواتير العميل السابقة</h4>
                </div>
                <span className="text-[11px] text-slate-400">آخر {customerPastInvoices.length} طلبيات</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {customerPastInvoices.map((inv) => (
                  <div key={inv.id} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono font-black text-slate-900">{inv.invoiceNumber}</span>
                      <span className="text-[10px] text-slate-500">{inv.date}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>الإجمالي:</span>
                      <strong className="font-mono">{formatCurrency(inv.estimatedGrandTotal)}</strong>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex justify-between items-center">
                      <span>{inv.totalCartons} كرتونة</span>
                      <span className="bg-slate-200/70 text-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Action Footer for Supervisor / Branch Manager */}
        <div className="bg-slate-100 p-3.5 sm:p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Full Electronic Invoice */}
            {onViewInvoice && (
              <button
                onClick={() => {
                  onClose();
                  onViewInvoice(invoice);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-[#d97706] font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>معاينة الفاتورة الإلكترونية الكاملة</span>
              </button>
            )}

            {/* Export Excel */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير إكسل</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Direct Approval Actions if Pending */}
            {isPendingApproval && canManage && (
              <>
                <button
                  onClick={() => {
                    if (onApprove) {
                      onApprove(invoice.id);
                    } else {
                      updateOrderStatus(invoice.id, 'جاري تحضير المنتجات');
                    }
                    onClose();
                  }}
                  className="bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                  title="اعتماد الفاتورة وتجهيزها"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتماد وتجهيز بالمخزن ✅</span>
                </button>

                <button
                  onClick={() => {
                    if (onReject) {
                      onReject(invoice);
                    }
                    onClose();
                  }}
                  className="bg-[var(--app-risk-tint)] hover:bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)] font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                  title="رفض الفاتورة"
                >
                  <XCircle className="w-4 h-4" />
                  <span>رفض الفاتورة ❌</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
