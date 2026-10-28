import { Activity } from 'lucide-react';
import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { formatCompactAmount, MONTH_LABELS, MonthlyTrendPoint } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';

interface MonthlyTrendCardProps {
  trend: MonthlyTrendPoint[];
  selectedMonth: number | 'all';
}

const TrendTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[10px] font-black">{label}</div>
      <div className="text-[11px] font-bold font-mono text-amber-300 mt-1">
        {formatCurrency(payload[0].value)}
      </div>
    </div>
  );
};

export const MonthlyTrendCard: React.FC<MonthlyTrendCardProps> = ({ trend, selectedMonth }) => {
  const total = trend.reduce((acc, point) => acc + point.amount, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-warn" />
            اتجاه المبيعات الشهرية
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            إجمالي {formatCurrency(total)} خلال شهور السنة المعروضة
          </p>
        </div>
        {selectedMonth !== 'all' && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            الشهر المحدد: {MONTH_LABELS[selectedMonth]}
          </span>
        )}
      </div>

      <div className="h-[190px] mt-3" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#102b4e" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#102b4e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef3f8" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'Cairo, sans-serif' }}
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
            <Tooltip content={<TrendTooltip />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#102b4e"
              strokeWidth={2}
              fill="url(#salesTrendFill)"
              activeDot={{ r: 4, fill: '#c99a43', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
