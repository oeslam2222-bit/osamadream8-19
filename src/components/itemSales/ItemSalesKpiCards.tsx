import { Banknote, Boxes, PackageX, Tags } from 'lucide-react';
import React from 'react';
import { formatCurrency } from '../../services/invoiceService';
import { PeriodComparison } from '../../services/customerItemSalesInsights';
import { GrowthPill } from './ItemSalesPrimitives';

interface ItemSalesKpiCardsProps {
  comparison: PeriodComparison;
  totalQuantity: number;
  previousQuantity: number;
  itemsCount: number;
  previousItemsCount: number;
  idleCount: number;
  idleCaption: string;
  comparisonCaption: string;
  idleIsLoading?: boolean;
}

const KpiCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  iconClass: string;
  children: React.ReactNode;
}> = ({ title, icon, iconClass, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 flex flex-col justify-between min-h-[118px] hover:border-slate-300 transition">
    <div className="flex items-start justify-between gap-2">
      <span className="text-[11px] font-bold text-slate-500 leading-tight">{title}</span>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
        {icon}
      </span>
    </div>
    {children}
  </div>
);

export const ItemSalesKpiCards: React.FC<ItemSalesKpiCardsProps> = ({
  comparison,
  totalQuantity,
  previousQuantity,
  itemsCount,
  previousItemsCount,
  idleCount,
  idleCaption,
  comparisonCaption,
  idleIsLoading = false
}) => {
  const amountGrowth = comparison.growthPct ?? comparison.latestMonthGrowthPct;
  const amountCaption =
    comparison.growthPct !== null ? comparison.comparisonLabel : 'نمو آخر شهر متاح';

  const quantityGrowth =
    previousQuantity > 0 ? ((totalQuantity - previousQuantity) / previousQuantity) * 100 : null;
  const itemsGrowth =
    previousItemsCount > 0 ? ((itemsCount - previousItemsCount) / previousItemsCount) * 100 : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <KpiCard
        title="إجمالي المبيعات"
        icon={<Banknote className="w-5 h-5" />}
        iconClass="bg-emerald-50 text-emerald-600"
      >
        <div className="mt-2.5">
          <div className="text-[21px] leading-tight font-black text-slate-900 font-mono">
            {formatCurrency(comparison.currentAmount)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={amountGrowth} />
            <span className="text-[9.5px] text-slate-400 font-bold">{amountCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard
        title="إجمالي الكميات المباعة"
        icon={<Boxes className="w-5 h-5" />}
        iconClass="bg-sky-50 text-sky-600"
      >
        <div className="mt-2.5">
          <div className="text-[21px] leading-tight font-black text-slate-900 font-mono">
            {totalQuantity.toLocaleString('en-US')}
            <span className="text-[11px] font-bold text-slate-400 ms-1">وحدة</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={quantityGrowth} emptyLabel="لا توجد فترة سابقة" />
            <span className="text-[9.5px] text-slate-400 font-bold">{comparisonCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard
        title="إجمالي الأصناف المتحركة"
        icon={<Tags className="w-5 h-5" />}
        iconClass="bg-violet-50 text-violet-600"
      >
        <div className="mt-2.5">
          <div className="text-[21px] leading-tight font-black text-slate-900 font-mono">
            {itemsCount.toLocaleString('en-US')}
            <span className="text-[11px] font-bold text-slate-400 ms-1">صنف</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={itemsGrowth} emptyLabel="لا توجد فترة سابقة" />
            <span className="text-[9.5px] text-slate-400 font-bold">{comparisonCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard
        title="أصناف بدون حركة"
        icon={<PackageX className="w-5 h-5" />}
        iconClass="bg-amber-50 text-amber-600"
      >
        <div className="mt-2.5">
          <div className="text-[21px] leading-tight font-black text-slate-900 font-mono">
            {idleIsLoading ? '...' : idleCount.toLocaleString('en-US')}
            <span className="text-[11px] font-bold text-slate-400 ms-1">صنف</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-700">
              رصيد راكد
            </span>
            <span className="text-[9.5px] text-slate-400 font-bold">{idleCaption}</span>
          </div>
        </div>
      </KpiCard>
    </div>
  );
};
