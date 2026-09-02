import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Building,
  CheckCircle2,
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
  const { customers, invoices, currentUser, companyInfo, updateOrderStatus } = useApp();

  if (!isOpen || !invoice) return null;

  // Resolve customer object from context or props
  const matchedCustomer =
    propCustomer ||
    customers.find(
      (c) =>
        (invoice.customerId && c.id === invoice.customerId) ||
        (invoice.customerCode && c.code && c.code.toLowerCase() === invoice.customerCode.toLowerCase()) ||
        (invoice.customerName && c.name && c.name.trim().toLowerCase() === invoice.customerName.trim().toLowerCase())
    );

  // Financial calculations
  const invoiceTotal = invoice.estimatedGrandTotal || 0;
  const debtBefore = invoice.customerBalanceBefore !== undefined && invoice.customerBalanceBefore !== null
    ? invoice.customerBalanceBefore
    : matchedCustomer?.currentBalance !== undefined
    ? matchedCustomer.currentBalance
    : matchedCustomer?.balance || 0;

  const debtAfter = invoice.customerBalanceAfter !== undefined && invoice.customerBalanceAfter !== null
    ? invoice.customerBalanceAfter
    : debtBefore + invoiceTotal;

  const creditLimit = invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null
    ? Number(invoice.customerCreditLimit)
    : matchedCustomer?.creditLimit !== undefined
    ? Number(matchedCustomer.creditLimit)
    : 0;

  const hasNoCredit = creditLimit <= 0;
  const isExceeded = !hasNoCredit && (invoice.creditLimitExceeded ?? (debtAfter > creditLimit));
  const excessAmount = isExceeded ? debtAfter - creditLimit : 0;
  const remainingCredit = !hasNoCredit && !isExceeded ? creditLimit - debtAfter : 0;
  const requiredDownPayment = invoice.requiredDownPayment || excessAmount;

  // Utilization calculation
  const utilizationPercentage = creditLimit > 0 ? Math.round((debtAfter / creditLimit) * 100) : debtAfter > 0 ? 100 : 0;

  // Previous invoices of this customer
  const customerPastInvoices = invoices
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
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400'
                  : hasNoCredit
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
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
                      ? 'bg-rose-900/60 text-rose-200 border-rose-500'
                      : hasNoCredit
                      ? 'bg-amber-900/60 text-amber-200 border-amber-500'
                      : 'bg-emerald-900/60 text-emerald-200 border-emerald-500'
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
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
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-900 font-black flex items-center justify-center text-base border border-amber-200 shrink-0">
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

          {/* 4 Core Financial Metric Cards (المديونية الحالية، الفاتورة، الحد الائتماني، بعد الفاتورة) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            
            {/* 1. Current Debt Before Invoice */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold">1. المديونية الحالية (السابقة)</span>
                <Wallet className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {debtBefore.toLocaleString()} <span className="text-xs font-bold text-slate-500">ج.م</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-medium">
                رصيد الحساب المسجل قبل هذه الفاتورة
              </div>
            </div>

            {/* 2. Current Invoice Amount */}
            <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-amber-800 mb-1">
                <span className="text-xs font-bold">2. قيمة الفاتورة الحالية</span>
                <Receipt className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl font-black text-amber-900 font-mono">
                {invoiceTotal.toLocaleString()} <span className="text-xs font-bold text-amber-700">ج.م</span>
              </div>
              <div className="text-[10px] text-amber-700 mt-1 font-medium">
                إجمالي {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
              </div>
            </div>

            {/* 3. Approved Credit Limit */}
            <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between text-blue-800 mb-1">
                <span className="text-xs font-bold">3. الحد الائتماني المعتمد</span>
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl font-black text-blue-950 font-mono">
                {hasNoCredit ? (
                  <span className="text-sm font-bold text-amber-700">0 (نقدي فقط)</span>
                ) : (
                  <>
                    {creditLimit.toLocaleString()} <span className="text-xs font-bold text-blue-700">ج.م</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-blue-700 mt-1 font-medium">
                سقف التسهيلات الممنوح من إدارة الائتمان
              </div>
            </div>

            {/* 4. Total Debt After Invoice */}
            <div
              className={`p-4 rounded-xl border shadow-xs relative overflow-hidden ${
                isExceeded
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : hasNoCredit
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-black">4. المديونية بعد الفاتورة</span>
                <TrendingUp className={`w-4 h-4 ${isExceeded ? 'text-rose-600' : 'text-emerald-600'}`} />
              </div>
              <div className={`text-xl font-black font-mono ${isExceeded ? 'text-rose-700' : 'text-emerald-800'}`}>
                {debtAfter.toLocaleString()} <span className="text-xs font-bold">ج.م</span>
              </div>
              <div className="text-[10px] font-bold mt-1">
                {isExceeded
                  ? `⚠️ متجاوزة بمقدار ${excessAmount.toLocaleString()} ج.م`
                  : hasNoCredit
                  ? 'تعامل نقدي بدون تسهيلات'
                  : `✅ متبقي للشراء ${remainingCredit.toLocaleString()} ج.م`}
              </div>
            </div>

          </div>

          {/* Credit Limit Exceeded & Decision Banner */}
          <div
            className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm ${
              isExceeded
                ? 'bg-gradient-to-r from-rose-50 via-rose-100/70 to-rose-50 border-rose-400 text-rose-950'
                : hasNoCredit
                ? 'bg-gradient-to-r from-amber-50 via-amber-100/70 to-amber-50 border-amber-400 text-amber-950'
                : 'bg-gradient-to-r from-emerald-50 via-emerald-100/70 to-emerald-50 border-emerald-400 text-emerald-950'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                  isExceeded ? 'bg-rose-600 text-white' : hasNoCredit ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
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
                    isExceeded ? 'bg-rose-600' : hasNoCredit ? 'bg-amber-600' : 'bg-emerald-600'
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
                <FileText className="w-4 h-4 text-amber-400" />
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

                  {/* Row 2: Current Invoice Total */}
                  <tr className="hover:bg-amber-50/40 bg-amber-50/10">
                    <td className="p-3.5 font-bold flex items-center gap-2 text-amber-900">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span>قيمة الفاتورة الحالية (الطلبية)</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-amber-900 text-sm">
                      +{invoiceTotal.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 text-amber-900">
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
                    <td className="p-3.5 font-mono font-black text-center text-slate-950 text-base">
                      {debtAfter.toLocaleString()} ج.م
                    </td>
                    <td className="p-3.5 text-slate-800">
                      المجموع التراكمي المطلوب من العميل عند تنفيذ الطلبية
                    </td>
                  </tr>

                  {/* Row 4: Credit Limit */}
                  <tr className="hover:bg-blue-50/40">
                    <td className="p-3.5 font-bold flex items-center gap-2 text-blue-900">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      <span>الحد الائتماني المعتمد للعميل</span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-blue-950 text-sm">
                      {hasNoCredit ? '0 ج.م' : `${creditLimit.toLocaleString()} ج.م`}
                    </td>
                    <td className="p-3.5 text-blue-800">
                      {hasNoCredit ? 'لا يوجد حد ائتماني مسجل للعميل (سداد نقدي فوري)' : 'أقصى سقف ائتماني مسموح به لهذا العميل'}
                    </td>
                  </tr>

                  {/* Row 5: Difference / Status */}
                  <tr className={isExceeded ? 'bg-rose-50/70 font-black' : 'bg-emerald-50/70 font-black'}>
                    <td className="p-3.5 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isExceeded ? 'bg-rose-600' : 'bg-emerald-600'}`}></span>
                      <span className={isExceeded ? 'text-rose-900' : 'text-emerald-900'}>
                        {isExceeded ? 'مبلغ التجاوز (الدفعة المقدمة المطلوبة)' : 'الرصيد الائتماني المتبقي المتاح للشراء'}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono font-black text-center text-base">
                      {isExceeded ? (
                        <span className="text-rose-700">-{excessAmount.toLocaleString()} ج.م ⚠️</span>
                      ) : (
                        <span className="text-emerald-700">+{remainingCredit.toLocaleString()} ج.م ✅</span>
                      )}
                    </td>
                    <td className="p-3.5">
                      {isExceeded ? (
                        <span className="text-rose-800">
                          مطلوب سداد دفعة نقدية لا تقل عن <strong>{requiredDownPayment.toLocaleString()} ج.م</strong> لخفض المديونية للحد المسموح
                        </span>
                      ) : (
                        <span className="text-emerald-800">
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
                className="bg-slate-900 hover:bg-slate-800 text-amber-300 font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>معاينة الفاتورة الإلكترونية الكاملة</span>
              </button>
            )}

            {/* Export Excel */}
            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
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
                  className="bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
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
