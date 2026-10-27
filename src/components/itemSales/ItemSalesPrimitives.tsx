import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import React from 'react';
import { formatGrowth, growthToneClass } from '../../services/customerItemSalesInsights';

/** شارة نسبة النمو — نفس اللغة البصرية في كل كروت اللوحة. */
export const GrowthPill: React.FC<{
  growth: number | null;
  className?: string;
  emptyLabel?: string;
}> = ({ growth, className = '', emptyLabel = 'لا توجد فترة سابقة' }) => {
  if (growth === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black text-slate-400 bg-slate-50 border-slate-200 ${className}`}
      >
        <Minus className="w-2.5 h-2.5" />
        {emptyLabel}
      </span>
    );
  }

  const Icon = growth >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-black ${growthToneClass(growth)} ${className}`}
    >
      <Icon className="w-2.5 h-2.5" />
      <span className="font-mono">{formatGrowth(growth)}</span>
    </span>
  );
};

/** الهيكل الموحّد لكل كارت في لوحة مبيعات الأصناف. */
export const CardShell: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconClass?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({
  title,
  subtitle,
  icon,
  iconClass = 'bg-[#102b4e]/5 text-[#102b4e]',
  action,
  children,
  className = '',
  bodyClassName = ''
}) => (
  <section
    className={`bg-white rounded-2xl border border-slate-200 shadow-[0_2px_10px_rgba(15,43,56,0.04)] p-4 sm:p-5 flex flex-col ${className}`}
  >
    <header className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && (
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[12.5px] sm:text-sm font-black text-slate-900 leading-tight">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-500 font-bold mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
    <div className={`mt-3 flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
  </section>
);

export const ChartEmpty: React.FC<{ message?: string; height?: number }> = ({
  message = 'لا توجد بيانات مطابقة للفلاتر الحالية',
  height = 200
}) => (
  <div
    className="flex flex-col items-center justify-center gap-1.5 text-[11px] text-slate-400 font-bold"
    style={{ height }}
  >
    <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-300">
      <Minus className="w-4 h-4" />
    </span>
    {message}
  </div>
);
