import { Users } from 'lucide-react';
import React from 'react';
import { RepPerformanceInsight } from '../../services/itemSalesAnalytics';
import { formatCurrency } from '../../services/invoiceService';
import { MONTH_NAMES_MAP } from '../../services/customerItemSalesService';
import { CardShell, ChartEmpty } from './ItemSalesPrimitives';

const initials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  return parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0] || ''}${parts[1][0] || ''}`;
};

interface MonthlyFamilyCell {
  month: number;
  amount: number;
  quantity: number;
}

interface RepPerformanceCardProps {
  reps: RepPerformanceInsight[];
  selectedRep: string;
  onSelectRep?: (repName: string) => void;
  /** مبيعات الأصناف للمندوب المختار بالشهور وبالعائلة (داخل بروفايل المندوب). */
  breakdown?: {
    byMonth: MonthlyFamilyCell[];
    byFamily: Array<{ family: string; amount: number; quantity: number; monthly: Record<number, number> }>;
  } | null;
}

export const RepPerformanceCard: React.FC<RepPerformanceCardProps> = ({
  reps,
  selectedRep,
  onSelectRep,
  breakdown
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
                className={`w-full text-right rounded-xl px-2 py-1.5 transition border ${
                  isActive
                    ? 'bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] ring-1 ring-[var(--app-warn)]'
                    : 'border-transparent hover:bg-[var(--app-card-hover,var(--app-card-secondary))]'
                } ${onSelectRep ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-navy-deep text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      {initials(rep.repName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10.5px] font-black text-[var(--app-text)] truncate">
                        {rep.repName}
                      </span>
                      <span className="block text-[8.5px] text-[var(--app-text-muted)] font-bold">
                        {rep.customersCount.toLocaleString('ar-EG')} عميل
                      </span>
                    </span>
                  </span>
                  <span className="text-left shrink-0">
                    <span className="block text-[10px] font-black text-[var(--app-text)] font-mono tabular-nums">
                      {formatCurrency(rep.amount)}
                    </span>
                    <span className="block text-[8.5px] font-bold text-[var(--app-text-muted)] font-mono tabular-nums">
                      {Math.round(rep.sharePct)}% من المبيعات
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, Math.round((rep.amount / max) * 100))}%`,
                      background: isActive
                        ? 'linear-gradient(90deg, #f5d485 0%, #c99a43 100%)'
                        : 'linear-gradient(90deg, #5eead4 0%, #14b8a6 100%)'
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* مبيعات الأصناف بالشهور وبالعائلة — داخل بروفايل المندوب المختار */}
      {breakdown && breakdown.byMonth.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--app-border)] space-y-3">
          <div>
            <div className="text-[9px] font-black text-[var(--app-text-muted)] mb-1.5">
              مبيعات الأصناف بالشهور — {selectedRep}
            </div>
            <div className="grid grid-cols-6 gap-1 text-center">
              {breakdown.byMonth.map((cell) => (
                <div key={cell.month} title={`${MONTH_NAMES_MAP[cell.month]}: ${formatCurrency(cell.amount)} • ${cell.quantity} كرتونة`} className="p-1 rounded-md border text-[8px] font-bold transition bg-[var(--app-warn-tint)] border-[var(--app-warn-line)] text-[var(--app-warn-text)]">
                  <div className="font-black">{MONTH_NAMES_MAP[cell.month]}</div>
                  <div className="font-mono tabular-nums">{formatCurrency(cell.amount)}</div>
                  <div className="text-[7px] tabular-nums">{cell.quantity} ك</div>
                </div>
              ))}
            </div>
          </div>
          {breakdown.byFamily.length > 0 && (
            <div>
              <div className="text-[9px] font-black text-[var(--app-text-muted)] mb-1.5">مبيعات الأصناف بالعائلة بالشهر والإجمالي</div>
              <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                {breakdown.byFamily.slice(0, 8).map((f) => (
                  <div key={f.family}>
                    <div className="flex items-center justify-between gap-2 text-[9px] font-bold">
                      <span className="truncate text-[var(--app-text)] max-w-[110px]" title={f.family}>{f.family}</span>
                      <span className="font-mono font-black text-[var(--app-ok-text)] shrink-0 tabular-nums">{formatCurrency(f.amount)}</span>
                    </div>
                    <div className="flex gap-0.5 mt-0.5 flex-wrap">
                      {Object.entries(f.monthly)
                        .sort((a, b) => Number(a[0]) - Number(b[0]))
                        .map(([month, amount]) => (
                          <span key={month} className="text-[7px] px-1 rounded bg-[var(--app-card-secondary)] border border-[var(--app-border)] text-[var(--app-text-muted)] font-bold tabular-nums" title={MONTH_NAMES_MAP[Number(month)]}>
                            {MONTH_NAMES_MAP[Number(month)]}: {formatCurrency(amount)}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </CardShell>
  );
};
