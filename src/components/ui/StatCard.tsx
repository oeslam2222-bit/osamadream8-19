import React from 'react';
import { Card } from './Card';
import { ArrowUpRight, ArrowDownRight, Calendar, Users, Package, Receipt } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'none';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
  className?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  calendar: <Calendar className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  package: <Package className="w-5 h-5" />,
  receipt: <Receipt className="w-5 h-5" />,
};

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-[var(--app-primary-tint)]', text: 'text-[var(--app-primary-text)]', border: 'border-[var(--app-primary-border)]' },
  green: { bg: 'bg-[var(--app-success-tint)]', text: 'text-[var(--app-success-text)]', border: 'border-[var(--app-success-border)]' },
  amber: { bg: 'bg-[var(--app-warning-tint)]', text: 'text-[var(--app-warning-text)]', border: 'border-[var(--app-warning-border)]' },
  purple: { bg: 'bg-[var(--app-violet-tint)]', text: 'text-[var(--app-violet-text)]', border: 'border-[var(--app-violet-border)]' },
  red: { bg: 'bg-[var(--app-danger-tint)]', text: 'text-[var(--app-danger-text)]', border: 'border-[var(--app-danger-border)]' },
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  icon,
  color = 'blue',
  className = '',
}) => {
  const colors = colorMap[color];
  const trendIcon = trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : trend === 'down' ? <ArrowDownRight className="w-4 h-4" /> : null;

  return (
    <Card className={`${colors.bg} ${colors.border} ${className}`} padding="none">
      <div className="p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--app-text-muted)] font-semibold mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-[var(--app-text)] font-arabic-display">{value}</h3>
            {subtitle && <p className="text-xs text-[var(--app-text-muted)] mt-1">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.bg.replace('bg-', 'bg-')}`}>
            {icon || iconMap.calendar}
          </div>
        </div>
        {trend && trendValue && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold">
            {trendIcon}
            <span className={trend === 'up' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {trendValue}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};
