import { Banknote, Boxes, PackageX, Tags, Users } from 'lucide-react';
import React from 'react';
import { formatCurrency } from '../../services/invoiceService';
import { PeriodComparison } from '../../services/customerItemSalesInsights';
import { GrowthPill } from './ItemSalesPrimitives';

type KpiTone = 'blue' | 'green' | 'violet' | 'amber' | 'red';

interface ItemSalesKpiCardsProps {
  comparison: PeriodComparison;
  totalQuantity: number;
  previousQuantity: number;
  itemsCount: number;
  previousItemsCount: number;
  customersCount: number;
  idleCount: number;
  idleCaption: string;
  comparisonCaption: string;
  idleIsLoading?: boolean;
}

const KpiCard: React.FC<{
  title: string;
  tone: KpiTone;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, tone, icon, children }) => (
  <div className={`tg-report-kpi tg-report-kpi--${tone} p-4 flex flex-col justify-between min-h-[118px] transition`}>
    <div className="flex items-start justify-between gap-2">
      <span className="tg-report-kpi__label text-[11px] font-bold leading-tight">{title}</span>
      <span className="tg-report-kpi__icon w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
        {icon}
      </span>
    </div>
    {children}
  </div>
);

const ItemSalesKpiCardsBase: React.FC<ItemSalesKpiCardsProps> = ({
  comparison,
  totalQuantity,
  previousQuantity,
  itemsCount,
  previousItemsCount,
  customersCount,
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard title="إجمالي المبيعات" tone="blue" icon={<Banknote className="w-5 h-5" />}>
        <div className="mt-2.5">
          <div className="tg-report-kpi__value text-[21px] leading-tight font-black font-mono">
            {formatCurrency(comparison.currentAmount)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={amountGrowth} className="tg-report-kpi__pill" />
            <span className="tg-report-kpi__hint text-[9.5px] font-bold">{amountCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard title="إجمالي الكميات المباعة" tone="green" icon={<Boxes className="w-5 h-5" />}>
        <div className="mt-2.5">
          <div className="tg-report-kpi__value text-[21px] leading-tight font-black font-mono">
            {totalQuantity.toLocaleString('en-US')}
            <span className="tg-report-kpi__hint text-[11px] font-bold ms-1">وحدة</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={quantityGrowth} className="tg-report-kpi__pill" emptyLabel="لا توجد فترة سابقة" />
            <span className="tg-report-kpi__hint text-[9.5px] font-bold">{comparisonCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard title="إجمالي الأصناف المتحركة" tone="violet" icon={<Tags className="w-5 h-5" />}>
        <div className="mt-2.5">
          <div className="tg-report-kpi__value text-[21px] leading-tight font-black font-mono">
            {itemsCount.toLocaleString('en-US')}
            <span className="tg-report-kpi__hint text-[11px] font-bold ms-1">صنف</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <GrowthPill growth={itemsGrowth} className="tg-report-kpi__pill" emptyLabel="لا توجد فترة سابقة" />
            <span className="tg-report-kpi__hint text-[9.5px] font-bold">{comparisonCaption}</span>
          </div>
        </div>
      </KpiCard>

      <KpiCard title="عدد العملاء" tone="amber" icon={<Users className="w-5 h-5" />}>
        <div className="mt-2.5">
          <div className="tg-report-kpi__value text-[21px] leading-tight font-black font-mono">
            {customersCount.toLocaleString('en-US')}
            <span className="tg-report-kpi__hint text-[11px] font-bold ms-1">عميل</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="tg-report-kpi__chip inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black">
              عملاء لهم مبيعات (بكود/اسم العميل)
            </span>
          </div>
        </div>
      </KpiCard>

      <KpiCard title="أصناف بدون حركة" tone="red" icon={<PackageX className="w-5 h-5" />}>
        <div className="mt-2.5">
          <div className="tg-report-kpi__value text-[21px] leading-tight font-black font-mono">
            {idleIsLoading ? '...' : idleCount.toLocaleString('en-US')}
            <span className="tg-report-kpi__hint text-[11px] font-bold ms-1">صنف</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="tg-report-kpi__chip inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black">
              رصيد راكد
            </span>
            <span className="tg-report-kpi__hint text-[9.5px] font-bold">{idleCaption}</span>
          </div>
        </div>
      </KpiCard>
    </div>
  );
};

// منع إعادة الرسم مع كل تغيير في الواجهة الأب (زي حرف بحث جديد)
export const ItemSalesKpiCards = React.memo(ItemSalesKpiCardsBase);
export default ItemSalesKpiCards;
