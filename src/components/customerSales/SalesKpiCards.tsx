import { ArrowDownRight, ArrowUpRight, Minus, Package, Receipt, Users, Wallet } from 'lucide-react';
import React from 'react';
import { formatCurrency } from '../../services/invoiceService';
import {
  formatGrowth,
  growthToneClass,
  ItemSalesInsight,
  PeriodComparison
} from '../../services/customerItemSalesInsights';

interface SalesKpiCardsProps {
  comparison: PeriodComparison;
  invoicesCount: number;
  hasOrders: boolean;
  customersCount: number;
  itemsCount: number;
  totalQuantity: number;
  topItem: ItemSalesInsight | null;
}

const GrowthBadge: React.FC<{ growth: number | null }> = ({ growth }) => {
  const Icon = growth === null ? Minus : growth >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-black ${growthToneClass(growth)}`}
    >
      <Icon className="w-3 h-3" />
      <span>{formatGrowth(growth)}</span>
    </span>
  );
};

const CardShell: React.FC<{
  title: string;
  icon: React.ReactNode;
  iconClass: string;
  children: React.ReactNode;
}> = ({ title, icon, iconClass, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 flex flex-col justify-between min-h-[124px] hover:border-slate-300 transition">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-slate-500">{title}</span>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconClass}`}>{icon}</span>
    </div>
    {children}
  </div>
);

export const SalesKpiCards: React.FC<SalesKpiCardsProps> = ({
  comparison,
  invoicesCount,
  hasOrders,
  customersCount,
  itemsCount,
  totalQuantity,
  topItem
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <CardShell
        title="إجمالي المبيعات"
        icon={<Wallet className="w-5 h-5" />}
        iconClass="bg-amber-50 text-amber-600"
      >
        <div className="mt-3">
          <div className="text-[22px] leading-tight font-black text-slate-900 font-mono">
            {formatCurrency(comparison.currentAmount)}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <GrowthBadge growth={comparison.growthPct} />
            <span className="text-[10px] text-slate-400 font-medium">{comparison.comparisonLabel}</span>
          </div>
        </div>
      </CardShell>

      <CardShell
        title="عدد فواتير البيع"
        icon={<Receipt className="w-5 h-5" />}
        iconClass="bg-sky-50 text-sky-600"
      >
        <div className="mt-3">
          <div className="text-[22px] leading-tight font-black text-slate-900 font-mono">
            {hasOrders ? invoicesCount.toLocaleString('ar-EG') : '—'}
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium">
            {hasOrders ? 'أمر بيع منفذ في الفترة' : 'الشيت لا يحتوي على أرقام أوامر بيع'}
          </div>
        </div>
      </CardShell>

      <CardShell
        title="العملاء المتعاملون"
        icon={<Users className="w-5 h-5" />}
        iconClass="bg-emerald-50 text-emerald-600"
      >
        <div className="mt-3">
          <div className="text-[22px] leading-tight font-black text-slate-900 font-mono">
            {customersCount.toLocaleString('ar-EG')}
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium">
            عميل اشترى {itemsCount.toLocaleString('ar-EG')} صنف /{' '}
            {totalQuantity.toLocaleString('ar-EG')} وحدة
          </div>
        </div>
      </CardShell>

      <CardShell
        title="أعلى صنف مبيعًا"
        icon={<Package className="w-5 h-5" />}
        iconClass="bg-violet-50 text-violet-600"
      >
        <div className="mt-3">
          <div className="text-sm leading-tight font-black text-slate-900 truncate" title={topItem?.itemName}>
            {topItem?.itemName || 'لا توجد مبيعات'}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {topItem && (
              <span className="text-[11px] font-black text-emerald-700 font-mono">
                {formatCurrency(topItem.amount)}
              </span>
            )}
            {topItem && (
              <span className="text-[10px] text-slate-400 font-medium">
                {topItem.quantity.toLocaleString('ar-EG')} وحدة
              </span>
            )}
          </div>
        </div>
      </CardShell>
    </div>
  );
};
