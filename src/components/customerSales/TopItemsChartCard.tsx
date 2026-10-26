import { BarChart3 } from 'lucide-react';
import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  formatCompactAmount,
  formatGrowth,
  ItemSalesInsight,
  shortItemName
} from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';

interface TopItemsChartCardProps {
  items: ItemSalesInsight[];
  currentLabel: string;
  previousLabel: string | null;
  onSelectItem?: (itemCode: string) => void;
}

const ChartTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload as {
    fullName: string;
    itemGroup: string;
    amount: number;
    previousAmount: number;
    growthPct: number | null;
  };

  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2.5 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[11px] font-black">{item.fullName}</div>
      <div className="text-[10px] text-slate-400 mb-1.5">{item.itemGroup}</div>
      <div className="text-[11px] font-bold text-amber-300 font-mono">{formatCurrency(item.amount)}</div>
      {item.previousAmount > 0 && (
        <div className="text-[10px] text-slate-300 mt-1 font-mono">
          السابق: {formatCurrency(item.previousAmount)} • {formatGrowth(item.growthPct)}
        </div>
      )}
    </div>
  );
};

export const TopItemsChartCard: React.FC<TopItemsChartCardProps> = ({
  items,
  currentLabel,
  previousLabel,
  onSelectItem
}) => {
  const chartData = items.map((item) => ({
    name: shortItemName(item.itemName, 14),
    fullName: item.itemName,
    itemCode: item.itemCode,
    itemGroup: item.itemGroup,
    amount: item.amount,
    previousAmount: previousLabel ? item.previousAmount : 0,
    growthPct: item.growthPct
  }));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            أعلى 5 أصناف (قيمة المبيعات)
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            {currentLabel}
            {previousLabel ? ` • مقارنة بـ ${previousLabel}` : ' • لا توجد فترة سابقة للمقارنة'}
          </p>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#102b4e]" />
            الفترة الحالية
          </span>
          {previousLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#c99a43]" />
              الفترة السابقة
            </span>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="h-[280px] flex items-center justify-center text-xs text-slate-400 font-bold">
          لا توجد مبيعات مطابقة للفلاتر الحالية
        </div>
      ) : (
        <div className="h-[280px] mt-4" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={4}>
              <CartesianGrid stroke="#e8eef5" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'Cairo, sans-serif' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                interval={0}
                height={42}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactAmount(value)}
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={62}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(16,43,78,0.04)' }} />
              <Bar dataKey="previousAmount" fill="#c99a43" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar
                dataKey="amount"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
                onClick={(data: any) => onSelectItem?.(data?.itemCode || '')}
                style={{ cursor: onSelectItem ? 'pointer' : 'default' }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`item-${index}`} fill="#102b4e" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.slice(0, 4).map((item, index) => (
          <button
            key={item.itemCode || `${item.itemName}-${index}`}
            type="button"
            onClick={() => onSelectItem?.(item.itemCode)}
            className="flex items-center justify-between gap-2 text-right rounded-xl px-2 py-1.5 hover:bg-slate-50 transition cursor-pointer"
          >
            <span className="text-[11px] font-bold text-slate-700 truncate">
              {index + 1}. {item.itemName}
            </span>
            <span
              className={`text-[10px] font-black font-mono ${
                item.growthPct === null
                  ? 'text-slate-400'
                  : item.growthPct >= 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
              }`}
            >
              {formatGrowth(item.growthPct)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
