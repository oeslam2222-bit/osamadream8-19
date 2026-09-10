import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  DollarSign,
  MapPin,
  Phone,
  User,
  ShieldAlert,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { Customer } from '../types';
import { formatCurrency } from '../services/invoiceService';

interface CustomerDetailCardProps {
  customer: Customer;
  onViewLedger?: () => void;
}

export const CustomerDetailCard: React.FC<CustomerDetailCardProps> = ({
  customer,
  onViewLedger,
}) => {
  const balance = Number(customer.currentBalance ?? customer.balance ?? 0);
  const limit = Number(customer.creditLimit ?? 0);
  const available = Math.max(0, limit - balance);
  const isExceeded = limit > 0 && balance > limit;
  const overdue = Number(customer.totalOverdueAndDue ?? customer.overdueBalance ?? 0);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header with customer info */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-black text-amber-300 truncate">
                {customer.name}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                كود: {customer.code || 'N/A'}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-400">الفرع</div>
            <div className="text-sm font-bold text-white">{customer.branchName}</div>
          </div>
        </div>
      </div>

      {/* Contact & Location */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 space-y-2.5">
        {customer.repName && (
          <div className="flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-600">المندوب:</span>
            <span className="font-bold text-slate-900">{customer.repName}</span>
          </div>
        )}
        {customer.phone && (
          <div className="flex items-center gap-2 text-xs">
            <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-600">الهاتف:</span>
            <a href={`tel:${customer.phone}`} className="font-bold text-blue-600 hover:underline">
              {customer.phone}
            </a>
          </div>
        )}
        {customer.address && (
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-slate-600">العنوان:</span>
              <div className="font-bold text-slate-900">{customer.address}</div>
            </div>
          </div>
        )}
      </div>

      {/* Financial Status */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 bg-slate-50/50 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Current Debt */}
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">المديونية الحالية</div>
            <div className={`text-lg font-black ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatCurrency(balance)}
            </div>
          </div>

          {/* Credit Limit */}
          <div className="bg-white p-3 rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">الحد الائتماني</div>
            <div className="text-lg font-black text-blue-700">
              {formatCurrency(limit)}
            </div>
          </div>

          {/* Available Credit */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 sm:col-span-2">
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">الرصيد المتاح</div>
            {isExceeded ? (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="text-sm font-black text-rose-600">
                  تجاوز الحد ({formatCurrency(balance - limit)})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-black text-emerald-600">
                  {formatCurrency(available)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Overdue Alert */}
        {overdue > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-900">متأخرات ومستحقات</div>
              <div className="text-sm font-black text-amber-700">{formatCurrency(overdue)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="px-4 sm:px-5 py-3 sm:py-4 border-t border-slate-100 space-y-2.5">
        {customer.lastOrderDate && (
          <div className="flex items-center gap-2 text-xs">
            <TrendingUp className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-600">آخر طلبية:</span>
            <span className="font-bold text-slate-900">{customer.lastOrderDate}</span>
          </div>
        )}
        {customer.lastVisitDate && (
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-600">آخر زيارة:</span>
            <span className="font-bold text-slate-900">{customer.lastVisitDate}</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      {onViewLedger && (
        <div className="px-4 sm:px-5 py-3 sm:py-4 bg-amber-50 border-t border-amber-200">
          <button
            onClick={onViewLedger}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl text-xs transition active:scale-95 flex items-center justify-center gap-2"
          >
            <DollarSign className="w-4 h-4" />
            <span>عرض كشف الحساب التفصيلي</span>
          </button>
        </div>
      )}
    </div>
  );
};
