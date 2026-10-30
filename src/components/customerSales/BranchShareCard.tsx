import { PieChart as PieIcon } from 'lucide-react';
import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { BranchSalesInsight } from '../../services/customerItemSalesInsights';
import { formatCurrency } from '../../services/invoiceService';

interface BranchShareCardProps {
  branches: BranchSalesInsight[];
  totalAmount: number;
  totalCustomers: number;
}

const BranchTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const branch = payload[0].payload as BranchSalesInsight;
  return (
    <div className="bg-slate-950 text-white rounded-xl px-3 py-2 shadow-xl border border-slate-700 text-right" dir="rtl">
      <div className="text-[11px] font-black">{branch.name}</div>
      <div className="text-[11px] font-mono text-[#d97706] mt-1">{formatCurrency(branch.amount)}</div>
      <div className="text-[10px] text-slate-300 mt-0.5">
        {Math.round(branch.sharePct)}% • {branch.customersCount} عميل
      </div>
    </div>
  );
};

export const BranchShareCard: React.FC<BranchShareCardProps> = ({
  branches,
  totalAmount,
  totalCustomers
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-[var(--app-ok-text)]" />
            توزيع المبيعات حسب الفروع
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">
            {branches.length.toLocaleString('ar-EG')} فرع / مخزن • {totalCustomers} عميل
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500">
          حصة كل فرع
        </span>
      </div>

      {branches.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-xs text-slate-400 font-bold">
          لا توجد بيانات فروع للفترة المحددة
        </div>
      ) : (
        <>
          <div className="relative h-[190px] mt-2" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={branches}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {branches.map((branch) => (
                    <Cell key={branch.name} fill={branch.color} />
                  ))}
                </Pie>
                <Tooltip content={<BranchTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-slate-400 font-bold">إجمالي الفترة</span>
              <span className="text-sm font-black text-slate-900 font-mono mt-0.5">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          <div className="mt-2 space-y-1.5 max-h-[128px] overflow-y-auto pr-1">
            {branches.map((branch) => (
              <div key={branch.name} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: branch.color }}
                  />
                  <span className="font-bold text-slate-700 truncate">{branch.name}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-slate-500">{formatCurrency(branch.amount)}</span>
                  <span className="font-black text-slate-900 w-8 text-left">
                    {Math.round(branch.sharePct)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
