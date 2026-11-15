/**
 * Button.tsx
 * Fully typed, accessible button with semantic variants and sizes.
 * Touch-target friendly (min 44px), RTL-aware, focus-visible styling.
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { ButtonProps } from "../../types";

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}) => {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none";

  const variants: Record<string, string> = {
    primary: "bg-primary text-background hover:bg-primary-hover focus-visible:ring-primary active:scale-[0.98]",
    secondary: "bg-surface-subtle text-text hover:bg-surface-elevated focus-visible:ring-border active:scale-[0.98]",
    outline: "border border-border bg-background text-text hover:bg-surface-subtle focus-visible:ring-primary active:scale-[0.98]",
    ghost: "bg-transparent text-text-secondary hover:text-text hover:bg-surface-subtle focus-visible:ring-border active:scale-[0.98]",
    danger: "bg-error text-background hover:bg-error/90 focus-visible:ring-error active:scale-[0.98]",
    success: "bg-success text-background hover:brightness-110 focus-visible:ring-success active:scale-[0.98]",
    warning: "bg-warning text-background hover:bg-warning/90 focus-visible:ring-warning active:scale-[0.98]",
  };

  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-sm min-h-[36px] gap-1.5",
    md: "px-4 py-2.5 text-base min-h-[44px] gap-2",
    lg: "px-6 py-3 text-lg min-h-[52px] gap-2.5",
  };

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={cn(base, variants[variant], sizes[size], fullWidth ? "w-full" : "", className)}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? (
        <svg
          className="animate-spin w-4 h-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
