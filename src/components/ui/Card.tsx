import React from 'react';

type CardVariant = 'default' | 'glass' | 'gradient' | 'glow' | 'accent';
type CardAccent = 'teal' | 'amber' | 'indigo' | 'rose' | 'emerald' | 'slate';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  variant?: CardVariant;
  accent?: CardAccent;
}

const accentStyles: Record<CardAccent, { border: string; glow: string; gradient: string; text: string }> = {
  teal:    { border: 'border-[var(--app-secondary-border)]', glow: 'shadow-[var(--app-secondary)]/10', gradient: 'from-[var(--app-secondary-tint)] to-[var(--app-success-tint)]', text: 'text-[var(--app-secondary-text)]' },
  amber:   { border: 'border-[var(--app-warning-border)]', glow: 'shadow-[var(--app-warning)]/10', gradient: 'from-[var(--app-warning-tint)] to-orange-50 dark:to-orange-950/30', text: 'text-[var(--app-warning-text)]' },
  indigo:  { border: 'border-[var(--app-primary-border)]', glow: 'shadow-[var(--app-primary)]/10', gradient: 'from-[var(--app-primary-tint)] to-blue-50 dark:to-blue-950/30', text: 'text-[var(--app-primary-text)]' },
  rose:    { border: 'border-[var(--app-danger-border)]', glow: 'shadow-[var(--app-danger)]/10', gradient: 'from-[var(--app-danger-tint)] to-pink-50 dark:to-pink-950/30', text: 'text-[var(--app-danger-text)]' },
  emerald: { border: 'border-[var(--app-success-border)]', glow: 'shadow-[var(--app-success)]/10', gradient: 'from-[var(--app-success-tint)] to-[var(--app-secondary-tint)]', text: 'text-[var(--app-success-text)]' },
  slate:   { border: 'border-[var(--app-border)]', glow: 'shadow-slate-500/5', gradient: 'from-[var(--app-card-secondary)] to-[var(--app-card)]', text: 'text-[var(--app-text)]' },
};

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  hover = false,
  variant = 'default',
  accent = 'slate',
  className = '',
  ...props
}) => {
  const paddingStyles: Record<string, string> = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  const a = accentStyles[accent];

  const variantStyles: Record<CardVariant, string> = {
    default: `bg-[var(--app-card)] border ${a.border} shadow-[var(--app-shadow-card)]`,
    glass:   `bg-[color:var(--app-card)]/75 backdrop-blur-xl border border-[var(--app-border)] shadow-[var(--app-shadow-card)]`,
    gradient:`bg-gradient-to-br ${a.gradient} border ${a.border} shadow-[var(--app-shadow-card)] ${a.glow}`,
    glow:    `bg-[var(--app-card)] border ${a.border} shadow-[var(--app-shadow-float)] ${a.glow} ring-1 ring-inset ring-white/40 dark:ring-slate-700/40`,
    accent:  `bg-[var(--app-card)] border-s-4 ${a.border} border border-[var(--app-border)] shadow-[var(--app-shadow-card)]`,
  };

  const hoverStyles = hover
    ? 'transition-all duration-300 hover:-translate-y-1 hover:shadow-soft-lg hover:ring-1 hover:ring-inset hover:ring-white/60 dark:hover:ring-slate-600/60 cursor-pointer'
    : 'transition-shadow duration-200';

  return (
    <div
      {...props}
      className={`relative overflow-hidden rounded-2xl ${variantStyles[variant]} ${hoverStyles} ${paddingStyles[padding]} ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px opacity-0 hover:opacity-100 transition-opacity duration-500"
        style={{
          background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
        }}
      />
      {children}
    </div>
  );
};

export default Card;
