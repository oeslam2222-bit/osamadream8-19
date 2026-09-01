import { AlertTriangle, Calculator, CheckCircle2, CreditCard, ShieldAlert, X } from 'lucide-react';
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
        className={`group inline-flex h-8 w-8 items-center justify-center rounded-xl border-2 shadow-sm transition-all cursor-pointer hover:-translate-y-0.5 hover:shadow-md ${
          invoice.creditLimitExceeded
            ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'
            : 'border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-100'
        }`}
      >
        {invoice.creditLimitExceeded ? <AlertTriangle className="h-4 w-4" /> : <Calculator className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white text-right shadow-2xl" dir="rtl">
          <div className={`flex items-center justify-between gap-3 px-4 py-3 ${invoice.creditLimitExceeded ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white'}`}>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-white/15 p-1.5"><CreditCard className="h-4 w-4" /></div>
              <div><div className="text-[10px] font-bold text-white/70">قرار داخلي فقط</div><div className="text-sm font-black">موقف حساب العميل</div></div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="text-white/70 hover:text-white cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-2.5"><span className="block text-[10px] text-slate-500">المديونية السابقة</span><strong className="mt-1 block text-slate-900">{formatCurrency(previousBalance)}</strong></div>
            <div className="rounded-xl bg-amber-50 p-2.5"><span className="block text-[10px] text-amber-700">قيمة الفاتورة</span><strong className="mt-1 block text-amber-900">{formatCurrency(invoiceValue)}</strong></div>
            <div className="col-span-2 rounded-xl border border-slate-200 p-2.5"><div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-700">إجمالي المديونية بعد الفاتورة</span><strong className={invoice.creditLimitExceeded ? 'text-rose-700' : 'text-emerald-700'}>{formatCurrency(balanceAfter)}</strong></div></div>
            <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl bg-blue-50 p-2.5"><span className="text-blue-800">الحد الائتماني المعتمد</span><strong className="text-blue-900">{isCashOnly ? 'لا يوجد — كاش فقط' : formatCurrency(creditLimit)}</strong></div>
          </div>
          <div className={`mx-3 mb-3 flex items-center gap-2 rounded-xl border p-2.5 text-[11px] font-bold leading-5 ${invoice.creditLimitExceeded ? 'border-rose-200 bg-rose-50 text-rose-800' : isCashOnly ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {invoice.creditLimitExceeded ? <><ShieldAlert className="h-4 w-4 shrink-0" />متجاوز الحد الائتماني — لا يمكن اعتماد الفاتورة.</> : isCashOnly ? <><ShieldAlert className="h-4 w-4 shrink-0" />لا يوجد حد ائتماني — السداد النقدي فقط.</> : <><CheckCircle2 className="h-4 w-4 shrink-0" />غير متجاوز للحد الائتماني المعتمد.</>}
          </div>
        </div>
      )}
    </div>
  );
};
