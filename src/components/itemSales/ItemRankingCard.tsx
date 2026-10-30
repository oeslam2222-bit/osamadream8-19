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
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-[10.5px] font-bold text-slate-700 truncate group-hover:text-deep-slate">
                      {item.itemName}
                    </span>
                  </span>
                  <span className="text-[10px] font-black text-slate-900 font-mono shrink-0">
                    {item.quantity.toLocaleString('en-US')}
                    <span className="text-[9px] text-slate-400 font-bold ms-1">{item.unit}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(4, Math.round((item.quantity / max) * 100))}%`,
                      backgroundColor: index < 3 ? '#c99a43' : '#102b4e'
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
              <CartesianGrid stroke="#eef3f8" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 8.5, fontFamily: 'Cairo, sans-serif' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                interval={0}
                height={44}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactAmount(value)}
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip content={<ItemTooltip />} cursor={{ fill: 'rgba(16,43,78,0.04)' }} />
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
                  style={{ fill: '#334155', fontSize: 9, fontWeight: 800 }}
                />
                {chartData.map((item, index) => (
                  <Cell key={`${item.itemCode}-${index}`} fill={index === 0 ? '#c99a43' : '#1e5f9d'} />
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
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-slate-50 transition cursor-pointer"
          >
            <span className="text-[10px] font-bold text-slate-600 truncate">
              {index + 1}. {item.itemName}
            </span>
            <GrowthPill growth={item.growthPct} emptyLabel="جديد" />
          </button>
        ))}
      </div>
    </CardShell>
  );
};

