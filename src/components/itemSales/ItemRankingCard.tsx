import { BarChart3, ListOrdered } from 'lucide-react';
import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatCompactAmount, shortItemName } from '../../services/customerItemSalesInsights';
import { ItemRankingRow } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { useChartTheme } from '../../services/chartTheme';
import { CardShell, ChartEmpty, GrowthPill } from './ItemSalesPrimitives';

interface ItemRankingCardProps {
  items: ItemRankingRow[];
  variant: 'amount' | 'quantity';
  subtitle?: string;
  onSelectItem?: (itemCode: string) => void;
}

const ItemTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload as ItemRankingRow;
  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2.5 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[11px] font-black">{item.itemName}</div>
      <div className="text-[9.5px] text-slate-400 mt-0.5">
        {item.itemGroup} • كود {item.itemCode || '—'}
      </div>
      <div className="text-[11px] font-bold text-[#d97706] font-mono mt-1">
        {formatCurrency(item.amount)}
      </div>
      <div className="text-[10px] text-slate-300 mt-0.5 font-mono">
        {item.quantity.toLocaleString('en-US')} {item.unit} • {item.customersCount} عميل
      </div>
    </div>
  );
};

export const ItemRankingCard: React.FC<ItemRankingCardProps> = ({
  items,
  variant,
  subtitle,
  onSelectItem
}) => {
  const chart = useChartTheme();

  if (variant === 'quantity') {
    const max = Math.max(...items.map((item) => item.quantity), 1);

    return (
      <CardShell
        title="أعلى 10 أصناف مبيعًا (الكمية)"
        subtitle={subtitle || 'ترتيب الأصناف حسب الوحدات المباعة'}
        icon={<ListOrdered className="w-4 h-4" />}
        iconClass="bg-[var(--app-warn-tint)] text-[var(--app-warn-text)]"
      >
        {items.length === 0 ? (
          <ChartEmpty height={250} />
        ) : (
          <div className="space-y-2 mt-1">
            {items.map((item, index) => (
              <button
                key={`${item.itemCode}-${index}`}
                type="button"
                onClick={() => onSelectItem?.(item.itemCode)}
                className="w-full text-right group cursor-pointer"
                title={`${item.itemName} — ${item.quantity.toLocaleString('en-US')} ${item.unit}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-4 h-4 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-700 truncate group-hover:text-deep-slate">
                        {item.itemName}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono truncate pr-5">
                      كود: {item.itemCode || '—'} · {item.itemGroup || 'عام'} · {item.customersCount} عميل
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-slate-900 font-mono shrink-0">
                    {item.quantity.toLocaleString('en-US')}
                    <span className="text-[9px] text-slate-400 font-bold ms-1">{item.unit}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all shadow-sm"
                    style={{
                      width: `${Math.max(4, Math.round((item.quantity / max) * 100))}%`,
                      background: index < 3
                        ? 'linear-gradient(90deg, #f0b429, #d97706)'
                        : 'linear-gradient(90deg, #3b82f6, #2563eb)'
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </CardShell>
    );
  }

  const chartData = items.map((item) => ({
    ...item,
    name: shortItemName(item.itemName, 11)
  }));

  return (
    <CardShell
      title="أعلى 10 أصناف مبيعًا (القيمة)"
      subtitle={subtitle || 'أعلى الأصناف تحقيقًا للإيراد في الفترة'}
      icon={<BarChart3 className="w-4 h-4" />}
      iconClass="bg-navy-deep/5 text-deep-slate"
      action={
        <span className="inline-flex items-center gap-1.5 text-[9.5px] font-bold text-slate-500">
          <span className="w-2 h-2 rounded-sm bg-navy-deep" /> القيمة
        </span>
      }
    >
      {chartData.length === 0 ? (
        <ChartEmpty height={252} />
      ) : (
        <div className="h-[252px] mt-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 22, right: 4, left: 0, bottom: 0 }}
              barCategoryGap="24%"
            >
              <CartesianGrid stroke={chart.grid} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: chart.tick, fontSize: 8.5, fontFamily: 'Cairo, sans-serif' }}
                axisLine={{ stroke: chart.axis }}
                tickLine={false}
                interval={0}
                height={44}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactAmount(value)}
                tick={{ fill: chart.tickMuted, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip content={<ItemTooltip />} cursor={{ fill: chart.cursor }} />
              <Bar
                dataKey="amount"
                radius={[5, 5, 0, 0]}
                barSize={24}
                onClick={(data: any) => onSelectItem?.(data?.itemCode || '')}
                style={{ cursor: onSelectItem ? 'pointer' : 'default' }}
              >
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(value: number) => formatCompactAmount(value)}
                  style={{ fill: chart.label, fontSize: 9, fontWeight: 800 }}
                />
                {chartData.map((item, index) => (
                  <Cell key={`${item.itemCode}-${index}`} fill={index === 0 ? chart.barAlt : chart.bar} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.slice(0, 4).map((item, index) => (
          <button
            key={`${item.itemCode}-top-${index}`}
            type="button"
            onClick={() => onSelectItem?.(item.itemCode)}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 transition cursor-pointer text-right"
          >
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-slate-700 truncate">
                {index + 1}. {item.itemName}
              </div>
              <div className="text-[8.5px] font-mono text-slate-400 truncate">
                كود: {item.itemCode || '—'} · {item.itemGroup || 'عام'} · {item.customersCount} عميل
              </div>
            </div>
            <GrowthPill growth={item.growthPct} emptyLabel="جديد" />
          </button>
        ))}
      </div>
    </CardShell>
  );
};

