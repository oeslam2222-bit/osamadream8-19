import { TrendingDown } from 'lucide-react';
import React from 'react';
import { ItemRankingRow } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

interface SlowMoversCardProps {
  items: ItemRankingRow[];
  totalItems: number;
}

export const SlowMoversCard: React.FC<SlowMoversCardProps> = ({ items, totalItems }) => (
  <CardShell
    title="أقل الأصناف مبيعًا"
    subtitle={`أضعف ${items.length} أصناف من أصل ${totalItems.toLocaleString('en-US')} صنف متحرك`}
    icon={<TrendingDown className="w-4 h-4" />}
    iconClass="bg-[var(--app-risk-tint)] text-[var(--app-risk-text)]"
    action={
      <span className="text-[9.5px] font-bold px-2 py-1 rounded-lg bg-[var(--app-risk-tint)] text-[var(--app-risk-text)] border border-[var(--app-risk-line)]">
        فرص تحسين
      </span>
    }
  >
    {items.length === 0 ? (
      <ChartEmpty height={214} message="لا توجد أصناف لعرضها" />
    ) : (
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-right border-collapse min-w-[400px]">
          <thead>
            <tr className="text-[9.5px] text-slate-400 font-black border-b border-slate-100">
              <th className="py-1.5 px-1 font-black w-6">#</th>
              <th className="py-1.5 px-1 font-black">الصنف</th>
              <th className="py-1.5 px-1 font-black text-center">الكمية</th>
              <th className="py-1.5 px-1 font-black">المبيعات</th>
              <th className="py-1.5 px-1 font-black text-center">آخر بيع</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.itemCode}-slow-${index}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/70 transition">
                <td className="py-1.5 px-1">
                  <span className="w-4 h-4 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black flex items-center justify-center">
                    {index + 1}
                  </span>
                </td>
                <td className="py-1.5 px-1 min-w-0">
                  <div className="text-[10.5px] font-bold text-slate-800 truncate max-w-[170px]">{item.itemName}</div>
                  <div className="text-[8.5px] text-slate-400 font-bold">{item.itemGroup}</div>
                </td>
                <td className="py-1.5 px-1 text-center text-[10px] font-bold text-slate-600 font-mono">
                  {item.quantity.toLocaleString('en-US')}
                </td>
                <td className="py-1.5 px-1">
                  <div className="text-[10.5px] font-black text-slate-900 font-mono">{formatCurrency(item.amount)}</div>
                  <div className="text-[8.5px] text-slate-400 font-bold">{Math.round(item.sharePct)}% من المبيعات</div>
                </td>
                <td className="py-1.5 px-1 text-center">
                  <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">
                    {item.lastMonthLabel}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </CardShell>
);
