import React from 'react';
import { PerformanceGauge } from '../ui/PerformanceGauge';
import { formatCurrency } from '../../services/invoiceService';

interface TargetGaugeSummaryProps {
  salesPct: number;
  collectionPct: number;
  salesTarget: number;
  salesAchieved: number;
  collectionTarget: number;
  collectionAchieved: number;
  monthName: string;
  year: number;
}

/**
 * ملخص قوسي لأرقام التارجت في الشاشة الرئيسية.
 * المؤشر = متوسط تحقيق المبيعات والتحصيل لنفس الشهر (نفس معادلة اعتماد الأداء العام).
 * كل الأرقام جاية من شيت التارجت المحمّل من قاعدة البيانات — مفيش أي حساب تقريبي هنا.
 */
export const TargetGaugeSummary: React.FC<TargetGaugeSummaryProps> = ({
  salesPct,
  collectionPct,
  salesTarget,
  salesAchieved,
  collectionTarget,
  collectionAchieved,
  monthName,
  year,
}) => {
  const overall = Math.round((salesPct + collectionPct) / 2);
  const totalTarget = salesTarget + collectionTarget;
  const totalAchieved = salesAchieved + collectionAchieved;
  const remaining = Math.max(0, totalTarget - totalAchieved);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-[var(--app-border)] bg-[var(--app-card-secondary)] p-3 sm:p-4">
      <div className="shrink-0">
        <PerformanceGauge
          value={overall}
          label="الأداء الشهري"
          size={156}
          caption={`${monthName} ${year} · متوسط المبيعات والتحصيل`}
        />
      </div>

      <div className="grid w-full min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 dark:border-blue-900/60 dark:bg-blue-950/40">
          <div className="text-[10px] font-black text-blue-900 dark:text-blue-300">المستهدف الكلي</div>
          <div className="mt-0.5 truncate text-[12px] font-black tabular-nums text-[var(--app-text)]">
            {formatCurrency(totalTarget)}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <div className="text-[10px] font-black text-emerald-900 dark:text-emerald-300">المحقق الكلي</div>
          <div className="mt-0.5 truncate text-[12px] font-black tabular-nums text-[var(--app-text)]">
            {formatCurrency(totalAchieved)}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="text-[10px] font-black text-amber-900 dark:text-amber-300">المتبقي على المستهدف</div>
          <div className="mt-0.5 truncate text-[12px] font-black tabular-nums text-[var(--app-text)]">
            {formatCurrency(remaining)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TargetGaugeSummary;
