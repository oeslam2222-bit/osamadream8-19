import React from 'react';
import { LucideProps } from 'lucide-react';

type IconVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'violet'
  | 'muted';

interface IconBadgeProps {
  icon: React.ElementType<LucideProps>;
  variant?: IconVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const VARIANT_BG: Record<IconVariant, string> = {
  primary: 'bg-blue-50 dark:bg-blue-950/20',
  secondary: 'bg-teal-50 dark:bg-teal-950/20',
  success: 'bg-emerald-50 dark:bg-emerald-950/20',
  warning: 'bg-amber-50 dark:bg-amber-950/20',
  danger: 'bg-rose-50 dark:bg-rose-950/20',
  violet: 'bg-purple-50 dark:bg-purple-950/20',
  muted: 'bg-slate-50 dark:bg-slate-900/40',
};

const VARIANT_TEXT: Record<IconVariant, string> = {
  primary: 'text-[#2563EB]',
  secondary: 'text-[#0D9488]',
  success: 'text-[#16A34A]',
  warning: 'text-[#F59E0B]',
  danger: 'text-[#DC2626]',
  violet: 'text-[#7C3AED]',
  muted: 'text-slate-500 dark:text-slate-400',
};

const VARIANT_BORDER: Record<IconVariant, string> = {
  primary: 'border-blue-200 dark:border-blue-800/30',
  secondary: 'border-teal-200 dark:border-teal-800/30',
  success: 'border-emerald-200 dark:border-emerald-800/30',
  warning: 'border-amber-200 dark:border-amber-800/30',
  danger: 'border-rose-200 dark:border-rose-800/30',
  violet: 'border-purple-200 dark:border-purple-800/30',
  muted: 'border-slate-200 dark:border-slate-700',
};

const SIZE: Record<'sm' | 'md' | 'lg', { wrapper: string; icon: string }> = {
  sm: { wrapper: 'w-8 h-8 rounded-xl', icon: 'w-4 h-4 stroke-[2]' },
  md: { wrapper: 'w-10 h-10 rounded-2xl', icon: 'w-5 h-5 stroke-[2.2]' },
  lg: { wrapper: 'w-12 h-12 rounded-2xl', icon: 'w-6 h-6 stroke-[2.2]' },
};

export function IconBadge({ icon: Icon, variant = 'primary', size = 'md', className, title }: IconBadgeProps) {
  const s = SIZE[size];
  return (
    <div
      className={`flex items-center justify-center ${s.wrapper} border ${VARIANT_BORDER[variant]} ${VARIANT_BG[variant]} shadow-xs ${className ?? ''}`}
      title={title}
    >
      <Icon className={`${s.icon} ${VARIANT_TEXT[variant]}`} />
    </div>
  );
}
