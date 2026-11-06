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
  teal:    { border: 'border-teal-200 dark:border-teal-900/60',    glow: 'shadow-teal-500/10',    gradient: 'from-teal-50 to-emerald-50 dark:from-teal-950/40 dark:to-emerald-950/30',    text: 'text-teal-700 dark:text-teal-300' },
  amber:   { border: 'border-amber-200 dark:border-amber-900/60',   glow: 'shadow-amber-500/10',   gradient: 'from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30',   text: 'text-amber-700 dark:text-amber-300' },
  indigo:  { border: 'border-indigo-200 dark:border-indigo-900/60', glow: 'shadow-indigo-500/10',  gradient: 'from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30',    text: 'text-indigo-700 dark:text-indigo-300' },
  rose:    { border: 'border-rose-200 dark:border-rose-900/60',     glow: 'shadow-rose-500/10',     gradient: 'from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/30',       text: 'text-rose-700 dark:text-rose-300' },
  emerald: { border: 'border-emerald-200 dark:border-emerald-900/60', glow: 'shadow-emerald-500/10', gradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30', text: 'text-emerald-700 dark:text-emerald-300' },
  slate:   { border: 'border-slate-200 dark:border-slate-700',     glow: 'shadow-slate-500/5',     gradient: 'from-slate-50 to-white dark:from-slate-800 dark:to-slate-900',            text: 'text-slate-700 dark:text-slate-300' },
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
    default: `bg-white dark:bg-slate-800 border ${a.border} shadow-soft`,
    glass:   `bg-white/70 dark:bg-slate-800/60 backdrop-blur-xl border border-white/40 dark:border-slate-700/60 shadow-soft`,
    gradient:`bg-gradient-to-br ${a.gradient} border ${a.border} shadow-soft ${a.glow}`,
    glow:    `bg-white dark:bg-slate-800 border ${a.border} shadow-lg ${a.glow} ring-1 ring-inset ring-white/40 dark:ring-slate-700/40`,
    accent:  `bg-white dark:bg-slate-800 border-s-4 ${a.border} border border-slate-200 dark:border-slate-700 shadow-soft`,
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