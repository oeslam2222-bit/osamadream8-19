import React from 'react';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Customer, Invoice } from '../types';

interface CreditStatusBadgeProps {
  invoice: Invoice;
  customer?: Customer | null;
  onClick?: () => void;
  compact?: boolean;
}

export const CreditStatusBadge: React.FC<CreditStatusBadgeProps> = ({
  invoice,
  customer: propCustomer,
  onClick,
  compact = false,
}) => {
  const { customers } = useApp();

  // Resolve customer if not directly provided
  const matchedCustomer =
    propCustomer ||
    customers.find(
      (c) =>
        (invoice.customerId && c.id === invoice.customerId) ||
        (invoice.customerCode && c.code && c.code.toLowerCase() === invoice.customerCode.toLowerCase()) ||
        (invoice.customerName && c.name && c.name.trim().toLowerCase() === invoice.customerName.trim().toLowerCase())
    );

  const invoiceTotal = invoice.estimatedGrandTotal || 0;
  const debtBefore =
    invoice.customerBalanceBefore !== undefined && invoice.customerBalanceBefore !== null
      ? invoice.customerBalanceBefore
      : matchedCustomer?.currentBalance !== undefined
      ? matchedCustomer.currentBalance
      : matchedCustomer?.balance || 0;

  const debtAfter =
    invoice.customerBalanceAfter !== undefined && invoice.customerBalanceAfter !== null
      ? invoice.customerBalanceAfter
      : debtBefore + invoiceTotal;

  const creditLimit =
    invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null
      ? Number(invoice.customerCreditLimit)
      : matchedCustomer?.creditLimit !== undefined
      ? Number(matchedCustomer.creditLimit)
      : 0;

  const overdueDebt = Number(
    invoice.customerOverdueBalance !== undefined && invoice.customerOverdueBalance !== null
      ? invoice.customerOverdueBalance
      : matchedCustomer?.totalOverdueAndDue !== undefined && matchedCustomer?.totalOverdueAndDue !== null
      ? matchedCustomer.totalOverdueAndDue
      : matchedCustomer?.overdueBalance !== undefined && matchedCustomer?.overdueBalance !== null
      ? matchedCustomer.overdueBalance
      : 0
  );

  const hasNoCredit = creditLimit <= 0;
  const isExceeded = !hasNoCredit && (invoice.creditLimitExceeded ?? (debtAfter > creditLimit));
  const excessAmount = isExceeded ? debtAfter - creditLimit : 0;
  const remainingCredit = !hasNoCredit && !isExceeded ? creditLimit - debtAfter : 0;
  const hasOverdue = overdueDebt > 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border transition shadow-2xs cursor-pointer active:scale-95 ${
          isExceeded
            ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
            : hasOverdue
            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-400'
            : hasNoCredit
            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300'
        }`}
        title={`تدقيق الائتمان: قبل ${debtBefore.toLocaleString()} | متأخرات ${overdueDebt.toLocaleString()} | الفاتورة ${invoiceTotal.toLocaleString()} | بعد ${debtAfter.toLocaleString()} | الحد ${creditLimit.toLocaleString()}`}
      >
        {isExceeded ? (
          <>
            <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
            <span>متجاوز (+{excessAmount.toLocaleString()} ج.م)</span>
          </>
        ) : hasOverdue ? (
          <>
            <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
            <span>متأخرات ({overdueDebt.toLocaleString()} ج.م)</span>
          </>
        ) : hasNoCredit ? (
          <>
            <Wallet className="w-3 h-3 text-amber-700 shrink-0" />
            <span>نقدي (0 حد)</span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>ائتمان آمن</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full text-right p-2.5 rounded-xl border transition-all shadow-2xs hover:shadow-md cursor-pointer active:scale-[0.99] flex flex-col gap-1.5 ${
        isExceeded
          ? 'bg-rose-50/90 hover:bg-rose-100/90 border-rose-300 text-rose-950'
          : hasOverdue
          ? 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-300 text-amber-950'
          : hasNoCredit
          ? 'bg-slate-50/90 hover:bg-slate-100/90 border-slate-300 text-slate-900'
          : 'bg-emerald-50/90 hover:bg-emerald-100/90 border-emerald-300 text-emerald-950'
      }`}
      title="انقر لفتح جدول التدقيق الائتماني والمديونيات التفصيلي"
    >
      {/* Top row: Status header pill */}
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex items-center gap-1.5 font-black text-[11px]">
          {isExceeded ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 animate-pulse shrink-0" />
              <span className="text-rose-700">🚨 متجاوزة الحد الائتماني</span>
            </>
          ) : hasOverdue ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-amber-800">⚠️ عليه متأخرات مستحقة</span>
            </>
          ) : hasNoCredit ? (
            <>
              <Wallet className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="text-slate-800">💵 تعامل نقدي (بدون حد)</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-emerald-800">✅ ائتمان سليم ومعتمد</span>
            </>
          )}
        </div>

        <span className="text-[10px] bg-white/95 px-2 py-0.5 rounded-md font-black border border-current/25 group-hover:bg-white transition text-slate-800 shadow-2xs">
          تدقيق 🔍
        </span>
      </div>

      {/* Overdue alert strip if customer has overdue debt */}
      {hasOverdue && (
        <div className="flex items-center justify-between bg-amber-500/15 border border-amber-400/40 text-amber-950 px-2 py-0.5 rounded-lg text-[10px] font-black">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-700 shrink-0" />
            <span>المتأخرات المستحقة:</span>
          </span>
          <span className="font-mono text-rose-700 bg-white/90 px-1.5 rounded border border-amber-300 font-black">
            {overdueDebt.toLocaleString()} ج.م
          </span>
        </div>
      )}

      {/* Grid of financial values: Current Debt, Overdue, Invoice, Credit Limit, Debt After */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] w-full pt-1 border-t border-current/15">
        <div className="flex items-center justify-between text-slate-700">
          <span className="text-[9px] text-slate-500 font-medium">الحالية:</span>
          <strong className="font-mono">{debtBefore.toLocaleString()}</strong>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[9px] font-medium text-slate-500">المتأخرات:</span>
          <strong className={`font-mono font-bold ${hasOverdue ? 'text-rose-700' : 'text-slate-600'}`}>
            {hasOverdue ? `${overdueDebt.toLocaleString()} ⚠️` : '0'}
          </strong>
        </div>

        <div className="flex items-center justify-between text-amber-900">
          <span className="text-[9px] text-amber-700 font-medium">الفاتورة:</span>
          <strong className="font-mono font-bold">+{invoiceTotal.toLocaleString()}</strong>
        </div>

        <div className="flex items-center justify-between text-blue-900">
          <span className="text-[9px] text-blue-700 font-medium">الحد:</span>
          <strong className="font-mono">{hasNoCredit ? '0' : creditLimit.toLocaleString()}</strong>
        </div>

        <div className="col-span-2 flex items-center justify-between pt-0.5 border-t border-current/10">
          <span className="text-[9px] font-black">بعد الفاتورة:</span>
          <strong className={`font-mono font-black text-[11px] ${isExceeded ? 'text-rose-700' : 'text-emerald-800'}`}>
            {debtAfter.toLocaleString()} ج.م
          </strong>
        </div>
      </div>

      {/* Excess / Remaining note */}
      {isExceeded && (
        <div className="text-[9px] font-black text-rose-900 bg-rose-200/80 px-1.5 py-0.5 rounded-md text-center border border-rose-300">
          مطلوب دفعة: {excessAmount.toLocaleString()} ج.م
        </div>
      )}
      {!isExceeded && hasOverdue && (
        <div className="text-[9px] font-bold text-amber-900 bg-amber-200/70 px-1.5 py-0.5 rounded-md text-center border border-amber-300">
          يلزم تحصيل المتأخرات ({overdueDebt.toLocaleString()} ج.م)
        </div>
      )}
      {!isExceeded && !hasOverdue && !hasNoCredit && (
        <div className="text-[9px] font-bold text-emerald-800 bg-emerald-200/70 px-1.5 py-0.5 rounded-md text-center border border-emerald-300">
          متاح للشراء: {remainingCredit.toLocaleString()} ج.م
        </div>
      )}
      {!isExceeded && !hasOverdue && hasNoCredit && (
        <div className="text-[9px] font-medium text-slate-700 bg-white/70 px-1.5 py-0.5 rounded-md text-center border border-slate-200">
          سداد نقدي فوري بالكامل
        </div>
      )}
    </button>
  );
};
