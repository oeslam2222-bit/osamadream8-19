import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Customer, Invoice } from '../types';

interface CreditStatusBadgeProps {
  invoice: Invoice;
  customer?: Customer | null;
  onClick?: () => void;
  compact?: boolean;
}

export const CreditStatusBadge: React.FC<CreditStatusBadgeProps> = ({
  invoice,
  customer,
  onClick,
  compact = false,
}) => {
  const invoiceTotal = invoice.estimatedGrandTotal || 0;
  const debtBefore = invoice.customerBalanceBefore !== undefined && invoice.customerBalanceBefore !== null
    ? invoice.customerBalanceBefore
    : customer?.currentBalance !== undefined
    ? customer.currentBalance
    : customer?.balance || 0;

  const debtAfter = invoice.customerBalanceAfter !== undefined && invoice.customerBalanceAfter !== null
    ? invoice.customerBalanceAfter
    : debtBefore + invoiceTotal;

  const creditLimit = invoice.customerCreditLimit !== undefined && invoice.customerCreditLimit !== null
    ? Number(invoice.customerCreditLimit)
    : customer?.creditLimit !== undefined
    ? Number(customer.creditLimit)
    : 0;

  const hasNoCredit = creditLimit <= 0;
  const isExceeded = !hasNoCredit && (invoice.creditLimitExceeded ?? (debtAfter > creditLimit));
  const excessAmount = isExceeded ? debtAfter - creditLimit : 0;
  const remainingCredit = !hasNoCredit && !isExceeded ? creditLimit - debtAfter : 0;

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border transition shadow-2xs cursor-pointer active:scale-95 ${
          isExceeded
            ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
            : hasNoCredit
            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
            : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300'
        }`}
        title={`تدقيق الائتمان: قبل ${debtBefore.toLocaleString()} | الفاتورة ${invoiceTotal.toLocaleString()} | بعد ${debtAfter.toLocaleString()} | الحد ${creditLimit.toLocaleString()}`}
      >
        {isExceeded ? (
          <>
            <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
            <span>متجاوز (+{excessAmount.toLocaleString()} ج.م)</span>
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
      className={`group w-full text-right p-2 rounded-xl border transition-all shadow-2xs hover:shadow-md cursor-pointer active:scale-[0.99] flex flex-col gap-1.5 ${
        isExceeded
          ? 'bg-rose-50/80 hover:bg-rose-100/90 border-rose-300 text-rose-950'
          : hasNoCredit
          ? 'bg-amber-50/80 hover:bg-amber-100/90 border-amber-300 text-amber-950'
          : 'bg-emerald-50/80 hover:bg-emerald-100/90 border-emerald-300 text-emerald-950'
      }`}
      title="انقر لفتح جدول التدقيق الائتماني والمديونيات التفصيلي"
    >
      {/* Top row: Status header pill */}
      <div className="flex items-center justify-between gap-1 w-full">
        <div className="flex items-center gap-1.5 font-black text-[11px]">
          {isExceeded ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              <span className="text-rose-700">🚨 متجاوزة الحد الائتماني</span>
            </>
          ) : hasNoCredit ? (
            <>
              <Wallet className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-amber-800">⚠️ تعامل نقدي (بدون حد)</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-800">✅ ائتمان سليم ومعتمد</span>
            </>
          )}
        </div>

        <span className="text-[9px] bg-white/90 px-1.5 py-0.5 rounded font-bold border border-current/20 group-hover:bg-white transition">
          تدقيق 🔍
        </span>
      </div>

      {/* Grid of 4 financial values: Current Debt, Invoice, Credit Limit, Debt After */}
      <div className="grid grid-cols-2 gap-1 text-[10px] w-full pt-0.5 border-t border-current/15">
        <div className="flex items-center justify-between text-slate-700">
          <span className="text-[9px] text-slate-500 font-medium">الحالية:</span>
          <strong className="font-mono">{debtBefore.toLocaleString()}</strong>
        </div>

        <div className="flex items-center justify-between text-amber-900">
          <span className="text-[9px] text-amber-700 font-medium">الفاتورة:</span>
          <strong className="font-mono">+{invoiceTotal.toLocaleString()}</strong>
        </div>

        <div className="flex items-center justify-between text-blue-900">
          <span className="text-[9px] text-blue-700 font-medium">الحد:</span>
          <strong className="font-mono">{hasNoCredit ? '0' : creditLimit.toLocaleString()}</strong>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold">بعد الفاتورة:</span>
          <strong className={`font-mono font-black ${isExceeded ? 'text-rose-700' : 'text-emerald-800'}`}>
            {debtAfter.toLocaleString()}
          </strong>
        </div>
      </div>

      {/* Excess / Remaining note */}
      {isExceeded && (
        <div className="text-[9px] font-black text-rose-800 bg-rose-200/70 px-1.5 py-0.5 rounded text-center">
          مطلوب دفعة: {excessAmount.toLocaleString()} ج.م
        </div>
      )}
      {!isExceeded && !hasNoCredit && (
        <div className="text-[9px] font-bold text-emerald-800 bg-emerald-200/60 px-1.5 py-0.5 rounded text-center">
          متاح للشراء: {remainingCredit.toLocaleString()} ج.م
        </div>
      )}
    </button>
  );
};
