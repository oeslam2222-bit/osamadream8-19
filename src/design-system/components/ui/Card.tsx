/**
 * Card.tsx
 * Flexible container card with padding tiers, hover lift, and accent variants.
 * Consistent border, radius, and shadow tokens across light/dark themes.
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { CardProps } from "../../types";

const accentStyles: Record<string, { border: string; gradient: string; text: string }> = {
  teal:    { border: "border-teal-200/60 dark:border-teal-900/40", gradient: "from-teal-50 to-emerald-50 dark:from-teal-950/20 dark:to-emerald-950/15", text: "text-teal-700 dark:text-teal-400" },
  amber:   { border: "border-amber-200/60 dark:border-amber-900/40", gradient: "from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/15", text: "text-amber-700 dark:text-amber-400" },
  indigo:  { border: "border-indigo-200/60 dark:border-indigo-900/40", gradient: "from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/15", text: "text-indigo-700 dark:text-indigo-400" },
  rose:    { border: "border-rose-200/60 dark:border-rose-900/40", gradient: "from-rose-50 to-pink-50 dark:from-rose-950/20 dark:to-rose-950/15", text: "text-rose-700 dark:text-rose-400" },
  emerald: { border: "border-emerald-200/60 dark:border-emerald-900/40", gradient: "from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/15", text: "text-emerald-700 dark:text-emerald-400" },
  slate:   { border: "border-border dark:border-border", gradient: "from-background to-surface dark:from-background dark:to-surface", text: "text-text-secondary dark:text-text-secondary" },
};

const variantStyles: Record<string, string> = {
  default: "bg-card border border-border shadow-sm",
  glass:   "bg-background/60 dark:bg-surface/40 backdrop-blur-md border border-border/50 shadow-sm",
  gradient:"bg-gradient-to-br from-background to-surface dark:from-background dark:to-surface border border-border shadow-sm",
  glow:    "bg-card border border-border shadow-md ring-1 ring-inset ring-background/20 dark:ring-surface-elevated/40",
  accent:  "bg-card border-l-4 border-border shadow-sm",
};

const paddingStyles: Record<string, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-5",
  lg: "p-7",
};

export const Card: React.FC<CardProps> = ({
  children,
  padding = "md",
  hover = false,
  variant = "default",
  accent = "slate",
  className = "",
  ...props
}) => {
  const a = accentStyles[accent];

  return (
    <div
      {...props}
      className={cn(
        "relative overflow-hidden rounded-xl",
        variantStyles[variant],
        variant === "accent" ? `border-l-${accentStyles[accent].border.split(" ")[0].replace("border-","")} ${a.border}` : a.border,
        variant === "gradient" ? a.gradient : "",
        hover ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer" : "transition-shadow duration-200",
        paddingStyles[padding],
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
