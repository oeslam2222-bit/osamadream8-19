import React from 'react';
import { DollarSign, Package, Wallet, MapPin, Check, ChevronLeft } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { IconBadge } from './ui/IconBadge';
import { formatCompactCurrency, formatCurrency } from '../services/invoiceService';

type KPIVariant = 'primary' | 'warning' | 'success' | 'violet';

interface KPICardProps {
  label: string;
  value: string | number;
  subtitle: string;
  variant: KPIVariant;
  icon: React.ElementType<LucideProps>;
  iconBadgeVariant: KPIVariant;
  smallLabel?: string | React.ReactNode;
  smallValue?: string | number;
  smallLabelColor?: string;
  onClick?: () => void;
  smallOnClickLabel?: string;
  compact?: boolean;
}

export const KPICard = React.memo((props: KPICardProps) => {
  const {
    label,
    value,
    subtitle,
    variant,
    icon: Icon,
    iconBadgeVariant,
    smallLabel,
    smallValue,
    smallLabelColor,
    onClick,
    smallOnClickLabel,
    compact = false,
  } = props;

  const variantColors: Record<KPIVariant, { text: string; darkText: string }> = {
    primary: { text: 'text-[#2563EB]', darkText: 'dark:text-blue-400' },
    warning: { text: 'text-[#F59E0B]', darkText: 'dark:text-[#FBBF24]' },
    success: { text: 'text-[#16A34A]', darkText: 'dark:text-[#4ADE80]' },
    violet: { text: 'text-[#7C3AED]', darkText: 'dark:text-[#A78BFA]' },
  };

  const color = variantColors[variant];

  const displayValue = typeof value === 'number' ? formatCurrency(value) : value;
  const compactValue = typeof value === 'number' ? formatCompactCurrency(value) : value;

  return (
    <div
      className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-[#26364D] rounded-2xl p-4 flex flex-col justify-between shadow-xs"
      onClick={onClick ? () => onClick() : undefined}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[var(--app-text)] dark:text-[#F1F5F9]">{label}</span>
        <IconBadge icon={Icon} variant={iconBadgeVariant} size="md" />
      </div>
      <div className="space-y-1 my-2">
        <div className={`text-lg sm:text-2xl font-black font-mono tracking-tight ${color.text} ${color.darkText} whitespace-nowrap`}>
          <span className="sm:hidden">{compactValue}</span>
          <span className="hidden sm:inline">{displayValue}</span>
        </div>
        <div className="text-[10px] text-slate-500 dark:text-[#94A3B8] font-bold">{subtitle}</div>
      </div>
      {smallLabel || smallValue !== undefined || onClick && smallOnClickLabel ? (
        <div
          className={`pt-2 border-t border-slate-100 dark:border-[#26364D] text-[10px] font-bold flex items-center justify-between cursor-pointer hover:underline transition-colors ${onClick ? '' : 'opacity-50'}`}
        >
          <span className={smallLabelColor ?? 'text-slate-500 dark:text-[#94A3B8]'}>
            {smallLabel ?? (onClick && smallOnClickLabel ? smallOnClickLabel : '')}
          </span>
          {smallValue !== undefined && (
            <span className={`ml-1 ${variant === 'success' ? 'text-[#16A34A] dark:text-[#4ADE80]' : variant === 'primary' ? 'text-[#2563EB] dark:text-[#93C5FD]' : 'text-slate-500 dark:text-[#94A3B8]'}`}>
              {typeof smallValue === 'number' ? formatCurrency(smallValue) : smallValue}
            </span>
          )}
          {onClick && (
            <ChevronLeft className="w-3 h-3" aria-hidden="true" />
          )}
        </div>
      ) : null}
    </div>
  );
});

KPICard.displayName = 'KPICard';
