/**
 * Input.tsx
 * Accessible form input with label, helper text, and error states.
 * Uses CSS custom properties for focus rings that adapt to light/dark themes.
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { InputProps } from "../../types";

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const hasError = !!error;

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
        className={cn(
          "flex w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-text placeholder:text-text-muted",
          "focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent",
          "disabled:bg-surface-subtle disabled:text-text-muted disabled:cursor-not-allowed",
          hasError ? "border-error focus:ring-error" : "",
          className,
        )}
        {...props}
      />
      {hasError && (
        <p id={`${inputId}-error`} className="text-xs text-error" role="alert">
          {error}
        </p>
      )}
      {!hasError && helperText && (
        <p id={`${inputId}-helper`} className="text-xs text-text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
};

export default Input;
