import { Users } from 'lucide-react';
import React from 'react';
import { RepPerformanceInsight } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

interface RepPerformanceCardProps {
  reps: RepPerformanceInsight[];
  selectedRep: string;
  onSelectRep?: (repName: string) => void;
}

export const RepPerformanceCard: React.FC<RepPerformanceCardProps> = ({
  reps,
  selectedRep,
  onSelectRep
}) => {
  const max = Math.max(...reps.map((rep) => rep.amount), 1);

  return (
    <CardShell
      title="أداء فريق المبيعات"
      subtitle="ترتيب المناديب بقيمة المبيعات في الفترة"
      icon={<Users className="w-4 h-4" />}
      iconClass="bg-[var(--app-ok-tint)] text-[var(--app-ok-text)]"
    >
      {reps.length === 0 ? (
        <ChartEmpty height={214} message="لا توجد بيانات مناديب" />
      ) : (
        <div className="space-y-2 mt-1">
          {reps.map((rep) => {
            const isActive = selectedRep === rep.repName;
            return (
              <button
                key={rep.repName}
                type="button"
                onClick={() => onSelectRep?.(rep.repName)}
                className={`w-full text-right rounded-xl px-2 py-1.5 transition ${
                  isActive ? 'bg-[var(--app-warn-tint)] ring-1 ring-[var(--app-warn)]' : 'hover:bg-slate-50'
                } ${onSelectRep ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-navy-deep text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      {initials(rep.repName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10.5px] font-black text-slate-800 truncate">
                        {rep.repName}
                      </span>
                      <span className="block text-[8.5px] text-slate-400 font-bold">
                        {rep.customersCount} عميل • {rep.orders} طلب
                      </span>
                    </span>
                  </span>
                  <span className="text-left shrink-0">
                    <span className="block text-[10px] font-black text-slate-900 font-mono">
                      {formatCurrency(rep.amount)}
                    </span>
                    <span className="block text-[8.5px] font-bold text-slate-400 font-mono">
                      {Math.round(rep.sharePct)}% من المبيعات
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, Math.round((rep.amount / max) * 100))}%`,
                      backgroundColor: isActive ? '#c99a43' : '#0e9f8a'
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </CardShell>
  );
};
