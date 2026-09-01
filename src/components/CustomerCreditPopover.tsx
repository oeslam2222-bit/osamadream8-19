import { CreditCard, ShieldAlert, X } from 'lucide-react';
import React, { useState } from 'react';
import { formatCurrency } from '../services/invoiceService';
import { Invoice, UserRole } from '../types';

interface CustomerCreditPopoverProps {
  invoice: Invoice;
  viewerRole?: UserRole;
}

const INTERNAL_ROLES = new Set<UserRole>(['supervisor', 'branch_manager', 'admin', 'developer']);

export const CustomerCreditPopover: React.FC<CustomerCreditPopoverProps> = ({ invoice, viewerRole }) => {
  const [open, setOpen] = useState(false);
  const previousBalance = invoice.customerBalanceBefore ?? 0;
  const invoiceValue = invoice.estimatedGrandTotal ?? 0;
  const balanceAfter = invoice.customerBalanceAfter ?? previousBalance + invoiceValue;
  const creditLimit = invoice.customerCreditLimit ?? 0;
  const isCashOnly = creditLimit <= 0;

  // This is intentionally an internal-only invoice control. It is never rendered in customer-facing invoice output.
  if (!viewerRole || !INTERNAL_ROLES.has(viewerRole)) return null;

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`عرض حساب ومديونية العميل ${invoice.customerName}`}
        aria-expanded={open}
        title="حساب العميل والحد الائتماني"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition cursor-pointer ${
          invoice.creditLimitExceeded
            ? 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
        }`}
      >
        <CreditCard className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-right shadow-2xl" dir="rtl">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="text-[10px] font-bold text-slate-400">قرار داخلي فقط</div>
              <div className="text-sm font-black text-slate-900">حساب ومديونية العميل</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-slate-500">المديونية الحالية (الرصيد السابق):</span><strong>{formatCurrency(previousBalance)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">قيمة الفاتورة الحالية:</span><strong>{formatCurrency(invoiceValue)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-2"><span className="font-bold text-slate-700">إجمالي المديونية بعد الفاتورة:</span><strong className={invoice.creditLimitExceeded ? 'text-rose-700' : 'text-emerald-700'}>{formatCurrency(balanceAfter)}</strong></div>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-2"><span className="text-slate-500">الحد الائتماني المعتمد:</span><strong className={isCashOnly ? 'text-amber-700' : 'text-blue-700'}>{isCashOnly ? 'لا يوجد حد ائتماني' : formatCurrency(creditLimit)}</strong></div>
          </div>
          <div className={`mt-3 rounded-xl border p-2 text-[11px] leading-5 ${isCashOnly || invoice.creditLimitExceeded ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
            {invoice.creditLimitExceeded ? <><ShieldAlert className="ml-1 inline h-3.5 w-3.5" />تم تجاوز الحد الائتماني. راجع قرار اعتماد الفاتورة.</> : isCashOnly ? 'توضيح هام للمندوب: لا يوجد حد ائتماني معتمد للعميل (سداد نقدي فقط).' : 'العميل داخل الحد الائتماني المعتمد.'}
          </div>
        </div>
      )}
    </div>
  );
};
