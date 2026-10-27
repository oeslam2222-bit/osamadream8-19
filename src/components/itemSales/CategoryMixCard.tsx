import { PieChart as PieIcon } from 'lucide-react';
import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCompactAmount } from '../../services/customerItemSalesInsights';
import { GroupShareInsight } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

interface CategoryMixCardProps {
  groups: GroupShareInsight[];
  totalAmount: number;
  totalItems: number;
  totalQuantity: number;
  onSelectGroup?: (groupName: string) => void;
}

const GroupTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const group = payload[0].payload as GroupShareInsight;
  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[11px] font-black">{group.name}</div>
      <div className="text-[11px] font-mono text-amber-300 mt-1">{formatCurrency(group.amount)}</div>
      <div className="text-[10px] text-slate-300 mt-0.5">
        {Math.round(group.sharePct)}% • {group.itemsCount} صنف • {group.customersCount} عميل
      </div>
    </div>
  );
};

export const CategoryMixCard: React.FC<CategoryMixCardProps> = ({
  groups,
  totalAmount,
  totalItems,
  totalQuantity,
  onSelectGroup
}) => (
  <CardShell
    title="توزيع المبيعات حسب الفئات"
    subtitle={`${groups.length.toLocaleString('en-US')} فئة • ${totalItems.toLocaleString('en-US')} صنف`}
    icon={<PieIcon className="w-4 h-4" />}
    iconClass="bg-emerald-50 text-emerald-600"
    action={
      <span className="text-[9.5px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
        حصة كل فئة
      </span>
    }
  >
    {groups.length === 0 ? (
      <ChartEmpty height={238} />
    ) : (
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative h-[200px] w-full sm:w-[48%] shrink-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={groups}
                dataKey="amount"
                nameKey="name"
                innerRadius={54}
                outerRadius={82}
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
              >
                {groups.map((group) => (
                  <Cell
                    key={group.name}
                    fill={group.color}
                    style={{ cursor: onSelectGroup ? 'pointer' : 'default' }}
                    onClick={() => onSelectGroup?.(group.name)}
                  />
                ))}
              </Pie>
              <Tooltip content={<GroupTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9.5px] text-slate-400 font-bold">إجمالي المبيعات</span>
            <span className="text-[13px] font-black text-slate-900 font-mono mt-0.5">
              {formatCompactAmount(totalAmount)}
            </span>
            <span className="text-[9px] text-slate-400 font-bold mt-0.5">
              {totalQuantity.toLocaleString('en-US')} وحدة
            </span>
          </div>
        </div>

        <div className="flex-1 w-full space-y-1.5 max-h-[206px] overflow-y-auto pr-1">
          {groups.map((group) => (
            <button
              key={group.name}
              type="button"
              onClick={() => onSelectGroup?.(group.name)}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-right transition ${
                onSelectGroup ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <span className="text-[10.5px] font-bold text-slate-700 truncate">{group.name}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-slate-400">
                  {formatCompactAmount(group.amount)}
                </span>
                <span className="text-[10px] font-black text-slate-900 w-8 text-left font-mono">
                  {Math.round(group.sharePct)}%
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )}
  </CardShell>
);
