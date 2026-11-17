import { IdCard, ShoppingCart, UserRound } from 'lucide-react';
import React from 'react';
import { CustomerAlert, CustomerSalesInsight } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
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
    iconClass="bg-amber-main/10 text-amber-dark"
    action={
      customer && onOpenDetails ? (
        <button
          type="button"
          onClick={() => onOpenDetails(customer.customerAccount)}
          className="text-[9.5px] font-black text-deep-slate hover:text-warn cursor-pointer"
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
          <span className="w-11 h-11 rounded-2xl bg-navy-deep text-white text-sm font-black flex items-center justify-center shrink-0">
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

        {(customer.summary.linkedSector || customer.summary.linkedCustomerCode) && (
          <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-bold">
            {customer.summary.linkedCustomerCode && (
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text)] font-mono" title="كود العميل في قاعدة العملاء">
                كود العميل: {customer.summary.linkedCustomerCode}
              </span>
            )}
            {customer.summary.linkedSector && (
              <span className="px-1.5 py-0.5 rounded-md border text-[var(--app-text)] font-bold" title="القطاع من قاعدة العملاء">
                القطاع: {customer.summary.linkedSector === 'electrical' ? 'كهربائي' : customer.summary.linkedSector === 'both' ? 'الاثنين' : 'منزلي'}
              </span>
            )}
          </div>
        )}

        {/* مبيعات الأصناف بالشهور — داخل بروفايل العميل */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[9px] font-black text-slate-500 mb-1.5">مبيعات الأصناف بالشهور</div>
          <div className="grid grid-cols-6 gap-1 text-center">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
              const amount = customer.summary.monthlySales?.[month] || 0;
              const qty = customer.summary.monthlyQuantities?.[month] || 0;
              return (
                <div
                  key={month}
                  title={`${MONTH_NAMES_MAP[month]}: ${formatCurrency(amount)} • ${qty} كرتونة`}
                  className={`p-1 rounded-md border text-[8px] font-bold transition ${
                    amount > 0
                      ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]'
                      : 'bg-slate-50 border-transparent text-slate-300'
                  }`}
                >
                  <div className="font-black">{MONTH_NAMES_MAP[month]}</div>
                  <div className="font-mono">{amount > 0 ? `${Math.round(amount / 1000)}k` : '—'}</div>
                  {amount > 0 && <div className="text-[7px]">{qty} ك</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* مبيعات الأصناف بالعائلة بالشهر + الإجمالي — داخل بروفايل العميل */}
        {Object.keys(customer.summary.familyBreakdown || {}).length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[9px] font-black text-slate-500 mb-1.5">مبيعات الأصناف بالعائلة (الإجمالي)</div>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
              {Object.entries(customer.summary.familyBreakdown)
                .sort((a, b) => b[1].amount - a[1].amount)
                .slice(0, 6)
                .map(([family, data]) => (
                  <div key={family} className="flex items-center justify-between gap-2 text-[9px] font-bold">
                    <span className="truncate text-slate-700 max-w-[100px]" title={family}>{family}</span>
                    <span className="font-mono font-black text-[var(--app-ok-text)] shrink-0">{formatCurrency(data.amount)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {alert && (
          <div className="rounded-xl bg-[var(--app-warn-tint)] border border-[var(--app-warn-line)] px-2.5 py-1.5">
            <div className="text-[9.5px] font-black text-[var(--app-warn-text)]">{alert.title}</div>
            <div className="text-[9px] font-bold text-[var(--app-warn-text)] mt-0.5">{alert.detail}</div>
          </div>
        )}

        {onStartOrder && (
          <button
            type="button"
            onClick={() => onStartOrder(customer.customerAccount)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-xl bg-navy-deep hover:bg-navy-dark4 text-white text-[10px] font-black transition cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            بدء طلبية جديدة
          </button>
        )}
      </div>
    )}
  </CardShell>
);
