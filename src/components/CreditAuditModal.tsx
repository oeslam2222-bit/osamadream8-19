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

  const matchedCustomer =
    propCustomer ||
    findCustomerMatch(customers, {
      customerId: invoice.customerId,
      customerCode: invoice.customerCode,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
    });

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

  const utilizationPercentage = creditLimit > 0 ? Math.round((debtAfter / creditLimit) * 100) : debtAfter > 0 ? 100 : 0;

  const customerPastInvoices = getVisibleInvoices()
    .filter(
      (inv) =>
        inv.id !== invoice.id &&
        ((invoice.customerId && inv.customerId === invoice.customerId) ||
          (invoice.customerName &&
            inv.customerName.trim().toLowerCase() === invoice.customerName.trim().toLowerCase()))
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

${isExceeded ? `🚨 *حالة الفاتورة:* متجاوزة الحد الائتماني بمقدار *${excessAmount.toLocaleString()} ج.م*
⚠️ *الدفعة المقدمة المطلوبة للاعتماد:* *${requiredDownPayment.toLocaleString()} ج.م*` : hasNoCredit ? `⚠️ *حالة الفاتورة:* تعامل نقدي بدون حد ائتماني` : `✅ *حالة الفاتورة:* ضمن الحد الائتماني المعتمد
💳 *الرصيد المتبقي المتاح للشراء:* *${remainingCredit.toLocaleString()} ج.م*`}
━━━━━━━━━━━━━━━━━━━━
⏰ تم الإصدار عبر نظام دريم للتوزيع`;

    navigator.clipboard.writeText(text);
    alert('✅ تم نسخ التقرير المالي الشامل بتنسيق الواتساب بنجاح!');
  };

  return (
    <div
      id="credit-audit-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in zoom-in-95"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="credit-audit-modal-container"
        className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col overflow-hidden my-auto max-h-[92vh]"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md font-black text-xl border ${
                isExceeded
                  ? 'bg-[var(--app-risk-tint)] border-[var(--app-risk-line)] text-[var(--app-risk-text)]'
                  : hasNoCredit
                  ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
                  : 'bg-[var(--app-ok-tint)] border-[var(--app-ok-line)] text-[var(--app-ok-text)]'
              }`}
            >
              {isExceeded ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  جدول تدقيق الائتمان والمديونية
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isExceeded
                      ? 'bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border-[var(--app-risk-line)]'
                      : hasNoCredit
                      ? 'bg-[var(--app-warn-tint)] text-[var(--app-warn-text)] border-[var(--app-warn-line)]'
                      : 'bg-[var(--app-ok-tint)] text-[var(--app-ok-text)] border-[var(--app-ok-line)]'
                  }`}
                >
                  {isExceeded ? '⚠️ متجاوزة الحد' : hasNoCredit ? 'نقدي فقط' : '✅ ائتمان آمن'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 font-medium">
                مخصص لمشرفي القطاعات ومديري الفروع لتقييم الملاءة المالية وقرارات الاعتماد
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center gap-2 bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition shadow-sm cursor-pointer"
              title="نسخ تقرير الائتمان للواتساب"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مشاركة واتساب</span>
            </button>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-[var(--app-risk-text)] p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[var(--app-navy)] flex items-center justify-center font-black shrink-0 shadow-xs">
                <User className="w-6 h-6 text-[var(--app-navy)]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-slate-900 text-xs">{invoice.customerCode || '---'}</span>
                  <span className="w-1 h-1 rounded-full bg-[var(--app-risk)]"></span>
                  <span className="font-black text-slate-900 text-sm truncate">{invoice.customerName}</span>
                </div>
                <p className="text-[10px] text-slate-500 font-bold mt-1">
                  {invoice.customerPhone ? `هاتف: ${invoice.customerPhone}` : 'بدون هاتف'} • {invoice.branchName}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="text-right">
                <span className="block text-[10px] font-bold text-slate-500">تاريخ الفاتورة</span>
                <span className="block text-xs font-black text-slate-900">{invoice.date}</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-bold text-slate-500">رقم الفاتورة</span>
                <span className="block font-mono font-black text-[var(--app-navy)]">{invoice.invoiceNumber}</span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] font-bold text-slate-500">المندوب</span>
                <span className="block text-xs font-bold text-slate-900">{invoice.repName || '---'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">المديونية الحالية</span>
                <Building className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-black text-[var(--app-navy)] font-mono leading-tight">
                {formatCurrency(debtBefore)}
              </div>
              <div className="text-[10px] text-slate-500 font-bold mt-1">مديونية العميل السابقة قبل الفاتورة</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">المتأخرات</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className={`text-2xl font-black font-mono leading-tight ${hasOverdue ? 'text-[var(--app-risk-text)]' : 'text-[var(--app-ok-text)]'}`}>
                {formatCurrency(overdueDebt)}
              </div>
              <div className="text-[10px] font-bold mt-1">
                {hasOverdue ? (
                  <span className="text-[var(--app-risk-text)] bg-[var(--app-risk-tint)] px-1.5 py-0.5 rounded border border-[var(--app-risk-line)] inline-block">
                    ⚠️ متأخرات واجبة التحصيل
                  </span>
                ) : (
                  <span className="text-[var(--app-ok-text)] font-medium">✅ لا توجد متأخرات سابقة</span>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[var(--app-warn-line)] shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[var(--app-warn-text)] uppercase tracking-tighter">قيمة الفاتورة الحالية</span>
                <Receipt className="w-4 h-4 text-[var(--app-warn-text)]" />
              </div>
              <div className="text-2xl font-black text-[var(--app-warn-text)] font-mono leading-tight">
                {formatCurrency(invoiceTotal)}
              </div>
              <div className="text-[10px] text-[var(--app-warn-text)] font-bold mt-1">
                {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[var(--app-navy-line)] shadow-sm p-4 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-[var(--app-navy-text)] uppercase tracking-tighter">الحد الائتماني المعتمد</span>
                <CreditCard className="w-4 h-4 text-[var(--app-navy-text)]" />
              </div>
              <div className={`text-2xl font-black font-mono leading-tight ${hasNoCredit ? 'text-[var(--app-warn-text)]' : 'text-[var(--app-navy-text)]'}`}>
                {hasNoCredit ? (
                  <span className="text-sm font-bold text-[var(--app-warn-text)]">0 (نقدي فقط)</span>
                ) : (
                  <>
                    {formatCurrency(creditLimit)} <span className="text-xs font-bold text-[var(--app-navy-text)]">ج.م</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-[var(--app-navy-text)] font-bold mt-1">
                {hasNoCredit ? 'سداد نقدي فوري' : 'سقف التسهيلات المعتمد'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--app-navy)]" />
                <h4 className="font-black text-slate-900 text-sm">الموقف المالي بعد احتساب الفاتورة</h4>
              </div>
            </div>
            <table className="w-full text-left text-sm divide-y divide-slate-100">
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>المديونية السابقة</span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-[var(--app-navy)] text-base">
                    {formatCurrency(debtBefore)}
                  </td>
                  <td className="p-3.5 text-[var(--app-navy-text)]">
                    المديونية المستحقة على العميل قبل الفاتورة الحالية
                  </td>
                </tr>

                <tr className="hover:bg-slate-50 transition">
                  <td className="p-3.5 font-bold flex items-center gap-2 text-[var(--app-warn-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--app-warn)]"></span>
                    <span>المتأخرات المستحقة</span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-[var(--app-warn-text)] text-base">
                    {formatCurrency(overdueDebt)}
                  </td>
                  <td className="p-3.5 text-[var(--app-warn-text)]">
                    {hasOverdue ? 'مبالغ مستحقة الدفع على العميل' : 'لا توجد متأخرات'}
                  </td>
                </tr>

                <tr className="hover:bg-[var(--app-warn-tint)]">
                  <td className="p-3.5 font-bold flex items-center gap-2 text-[var(--app-warn-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--app-warn)]"></span>
                    <span>قيمة الفاتورة الحالية (الطلبية)</span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-[var(--app-warn-text)] text-base">
                    +{formatCurrency(invoiceTotal)}
                  </td>
                  <td className="p-3.5 text-[var(--app-warn-text)]">
                    تشمل {invoice.totalCartons} كرتونة ({invoice.totalPieces} قطعة)
                    {invoice.discountAmount > 0 ? `بعد خصم ${formatCurrency(invoice.discountAmount)}` : ''}
                  </td>
                </tr>

                <tr className="hover:bg-[var(--app-navy-tint)] font-bold border-t border-[var(--app-navy)]">
                  <td className="p-3.5 flex items-center gap-2 text-[var(--app-navy-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--app-navy)]"></span>
                    <span>إجمالي المديونية بعد الفاتورة</span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-[var(--app-navy-text)] text-base">
                    {formatCurrency(debtAfter)}
                  </td>
                  <td className="p-3.5 text-[var(--app-navy-text)]">
                    المجموع التراكمي المطلوب من العميل عند تنفيذ الطلبية
                  </td>
                </tr>

                <tr className="hover:bg-[var(--app-navy-tint)]">
                  <td className="p-3.5 font-bold flex items-center gap-2 text-[var(--app-navy-text)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--app-navy)]"></span>
                    <span>الحد الائتماني المعتمد للعميل</span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-[var(--app-navy-text)] text-base">
                    {formatCurrency(hasNoCredit ? 0 : creditLimit)}
                  </td>
                  <td className="p-3.5 text-[var(--app-navy-text)]">
                    {hasNoCredit ? 'لا يوجد حد ائتماني مسجل للعميل (سداد نقدي فوري)' : 'أقصى سقف ائتماني مسموح'}
                  </td>
                </tr>

                <tr className={isExceeded ? 'bg-[var(--app-risk-tint)] font-black' : 'bg-[var(--app-ok-tint)] font-bold'}>
                  <td className="p-3.5 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isExceeded ? 'bg-[var(--app-risk)]' : 'bg-[var(--app-ok)]'}`}></span>
                    <span className={isExceeded ? 'text-[var(--app-risk-text)]' : 'text-[var(--app-ok-text)]'}>
                      {isExceeded ? 'مبلغ التجاوز (الدفعة المقدمة المطلوبة)' : 'الرصيد الائتماني المتبقي المتاح'}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono font-black text-center text-base">
                    {isExceeded ? (
                      <span className="text-[var(--app-risk-text)]">-{formatCurrency(excessAmount)} ج.م ⚠️</span>
                    ) : (
                      <span className="text-[var(--app-ok-text)]">+{formatCurrency(remainingCredit)} ج.م ✅</span>
                    )}
                  </td>
                  <td className="p-3.5">
                    {isExceeded ? (
                      <span className="text-[var(--app-risk-text)] text-xs font-bold leading-relaxed">
                        مطلوب سداد دفعة نقدية لا تقل عن <strong>{formatCurrency(requiredDownPayment)} ج.م</strong>
                      </span>
                    ) : (
                      <span className="text-[var(--app-ok-text)] text-xs font-bold leading-relaxed">
                        العميل يمكنه طلب بضاعة إضافية بقيمة تصل إلى <strong>{formatCurrency(remainingCredit)} ج.م</strong>
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {customerPastInvoices.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-600" />
                  <h4 className="font-bold text-xs text-slate-800 uppercase tracking-tighter">سجل أحدث طلبيات العميل السابقة</h4>
                </div>
                <span className="text-[11px] text-slate-400">آخر {customerPastInvoices.length} طلبية</span>
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
                      <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border-t border-slate-200 p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            {onViewInvoice && (
              <button
                onClick={() => {
                  onClose();
                  onViewInvoice(invoice);
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-black px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>معاينة الفاتورة الإلكترونية الكاملة</span>
              </button>
            )}

            <button
              onClick={() => exportElectronicInvoiceToExcel(invoice)}
              className="bg-[var(--app-ok)] hover:bg-[var(--app-ok)] text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير إكسل</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
