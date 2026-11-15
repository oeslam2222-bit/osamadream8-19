/**
 * Badge.tsx
 * Compact status/label badge with semantic variants and sizes.
 * Rapid-scannability friendly: small, high-contrast, clear meaning.
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { BadgeProps, Size } from "../../types";

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "default",
  size = "md",
  className = "",
  ...props
}) => {
  const base = "inline-flex items-center rounded-full font-semibold whitespace-nowrap border";

  const variants: Record<string, string> = {
    default: "border-transparent bg-text/10 text-text",
    primary: "border-primary/20 bg-primary/10 text-primary",
    secondary: "border-border bg-surface-subtle text-text-secondary",
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    error: "border-error/20 bg-error/10 text-error",
    outline: "border-border bg-transparent text-text-secondary",
  };

  const sizes: Record<Size, string> = {
    sm: "px-2 py-0.5 text-[10px] leading-none",
    md: "px-2.5 py-1 text-xs leading-none",
    lg: "px-3 py-1.5 text-sm leading-none",
  };

  return (
    <span
      {...props}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </span>
  );
};

export default Badge;
