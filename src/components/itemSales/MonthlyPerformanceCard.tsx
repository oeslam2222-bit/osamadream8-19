import { Activity } from 'lucide-react';
import React from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatCompactAmount, MONTH_LABELS } from '../../services/customerItemSalesInsights';
import { MonthlyPerformancePoint } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty, GrowthPill } from './ItemSalesPrimitives';

interface MonthlyPerformanceCardProps {
  points: MonthlyPerformancePoint[];
  growth: number | null;
  selectedMonth: number | 'all';
  onSelectMonth?: (month: number) => void;
}

const PerformanceTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as MonthlyPerformancePoint;
  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2.5 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[11px] font-black">{point.label}</div>
      <div className="text-[11px] font-bold font-mono text-amber-300 mt-1">
        {formatCurrency(point.amount)}
      </div>
      <div className="text-[10px] text-slate-300 mt-0.5 font-mono">
        {point.quantity.toLocaleString('en-US')} وحدة • {point.orders} طلب • {point.itemsCount} صنف
      </div>
    </div>
  );
};

export const MonthlyPerformanceCard: React.FC<MonthlyPerformanceCardProps> = ({
  points,
  growth,
  selectedMonth,
  onSelectMonth
}) => {
  const total = points.reduce((acc, point) => acc + point.amount, 0);

  return (
    <CardShell
      title="مؤشرات الأداء الشهرية (آخر 6 أشهر)"
      subtitle={`إجمالي ${formatCurrency(total)} خلال الفترة المعروضة`}
      icon={<Activity className="w-4 h-4" />}
      iconClass="bg-sky-50 text-sky-600"
      action={<GrowthPill growth={growth} emptyLabel="لا توجد مقارنة" />}
    >
      {points.length === 0 ? (
        <ChartEmpty height={232} />
      ) : (
        <div className="h-[232px] mt-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 26, right: 10, left: 0, bottom: 0 }}
              onClick={(state: any) => {
                const month = Number(state?.activePayload?.[0]?.payload?.month);
                if (month) onSelectMonth?.(month);
              }}
            >
              <defs>
                <linearGradient id="monthlyPerformanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#102b4e" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#102b4e" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef3f8" strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#64748b', fontSize: 9.5, fontFamily: 'Cairo, sans-serif' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tickFormatter={(value: number) => formatCompactAmount(value)}
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <Tooltip content={<PerformanceTooltip />} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="none"
                fill="url(#monthlyPerformanceFill)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#1e5f9d"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#ffffff', stroke: '#1e5f9d', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: '#c99a43', stroke: '#ffffff', strokeWidth: 2 }}
              >
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(value: number) => formatCompactAmount(value)}
                  style={{ fill: '#334155', fontSize: 9, fontWeight: 800 }}
                />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap text-[9.5px] font-bold text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#1e5f9d]" /> قيمة المبيعات
        </span>
        {selectedMonth !== 'all' && (
          <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
            الشهر المحدد: {MONTH_LABELS[selectedMonth]}
          </span>
        )}
        {onSelectMonth && <span>اضغط على أي نقطة لتصفية الشهر</span>}
      </div>
    </CardShell>
  );
};
