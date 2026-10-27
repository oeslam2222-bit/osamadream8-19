import { IdCard, ShoppingCart, UserRound } from 'lucide-react';
import React from 'react';
import { CustomerAlert, CustomerSalesInsight } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty, GrowthPill } from './ItemSalesPrimitives';

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

interface CustomerSnapshotCardProps {
  customer: CustomerSalesInsight | null;
  alert?: CustomerAlert | null;
  onStartOrder?: (account: string) => void;
  onOpenDetails?: (account: string) => void;
}

export const CustomerSnapshotCard: React.FC<CustomerSnapshotCardProps> = ({
  customer,
  alert,
  onStartOrder,
  onOpenDetails
}) => (
  <CardShell
    title="تفاصيل العميل"
    subtitle="أعلى عميل في الفترة المحددة"
    icon={<IdCard className="w-4 h-4" />}
    iconClass="bg-[#c99a43]/10 text-[#a97f2f]"
    action={
      customer && onOpenDetails ? (
        <button
          type="button"
          onClick={() => onOpenDetails(customer.customerAccount)}
          className="text-[9.5px] font-black text-[#102b4e] hover:text-[#c99a43] cursor-pointer"
        >
          الملف الكامل
        </button>
      ) : undefined
    }
  >
    {!customer ? (
      <ChartEmpty height={214} message="اختر عميلًا من الجدول لعرض تفاصيله" />
    ) : (
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-2xl bg-[#102b4e] text-white text-sm font-black flex items-center justify-center shrink-0">
            {initials(customer.customerName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-black text-slate-900 truncate">{customer.customerName}</div>
            <div className="text-[9.5px] text-slate-400 font-bold font-mono">
              كود: {customer.customerAccount || '—'}
            </div>
            <div className="text-[9.5px] text-slate-500 font-bold truncate">
              {customer.summary.linkedPhone || 'لا يوجد هاتف مسجل'}
            </div>
          </div>
          <GrowthPill growth={customer.growthPct} emptyLabel="—" />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
            <div className="text-[8.5px] font-bold text-slate-400">إجمالي المبيعات</div>
            <div className="text-[10.5px] font-black text-slate-900 font-mono mt-0.5">
              {formatCurrency(customer.amount)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
            <div className="text-[8.5px] font-bold text-slate-400">الأصناف</div>
            <div className="text-[10.5px] font-black text-slate-900 font-mono mt-0.5">
              {customer.itemsCount}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
            <div className="text-[8.5px] font-bold text-slate-400">الطلبات</div>
            <div className="text-[10.5px] font-black text-slate-900 font-mono mt-0.5">
              {customer.ordersAvailable ? customer.invoicesCount : '—'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[9.5px] font-bold">
          <div className="flex items-center gap-1 min-w-0">
            <UserRound className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-slate-400">المندوب:</span>
            <span className="text-slate-800 truncate">
              {customer.summary.linkedRepName || customer.repName}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-slate-400">الفرع:</span>
            <span className="text-slate-800 truncate">
              {customer.summary.linkedBranch || customer.warehouse}
            </span>
          </div>
        </div>

        {alert && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-1.5">
            <div className="text-[9.5px] font-black text-amber-800">{alert.title}</div>
            <div className="text-[9px] font-bold text-amber-700 mt-0.5">{alert.detail}</div>
          </div>
        )}

        {onStartOrder && (
          <button
            type="button"
            onClick={() => onStartOrder(customer.customerAccount)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-xl bg-[#102b4e] hover:bg-[#0b1f39] text-white text-[10px] font-black transition cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            بدء طلبية جديدة
          </button>
        )}
      </div>
    )}
  </CardShell>
);
