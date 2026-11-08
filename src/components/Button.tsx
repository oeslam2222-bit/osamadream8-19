/**
 * Button.tsx
 * A primary/secondary button component using the token-based color system.
 * Supports size variants and icon slots.
 */
import React from "react";
import "./index.css";

/**
 * Button variant
 */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/**
 * Button size
 */
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Button props interface
 */
export interface ButtonProps {
  /** Label text or React node */
  children: React.ReactNode;
  /** Variant of button */
  variant?: ButtonVariant;
  /** Size of button */
  size?: ButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** On click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Whether to render as an anchor tag */
  asLink?: boolean;
  /** Target for link (if asLink) */
  href?: string;
}

/**
 * Button component.
 * Uses CSS custom properties for background, text, and hover states.
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  disabled,
  onClick,
  className,
  asLink = false,
  href,
}) => {
  const baseClasses = `
    inline-flex items-center justify-center rounded-md
    font-medium transition-colors focus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-offset-2
    ${variant === "primary"
      ? "bg-primary text-primary-hover hover:bg-primary/90"
      : variant === "secondary"
      ? "bg-secondary text-secondary-hover hover:bg-secondary/90"
      : variant === "danger"
      ? "bg-error text-error-hover hover:bg-error/90"
      : "bg-transparent text-primary hover:bg-primary/10"
  }`;

  const sizeClasses = size === "sm"
    ? "h-8 py-1 px-2 text-sm"
    : size === "lg"
    ? "h-10 py-2 px-4 text-lg"
    : "h-9 py-2 px-3 text-base";

  const disabledClasses = disabled
    ? "opacity-50 cursor-not-allowed"
    : "";

  const classes = `${baseClasses} ${sizeClasses} ${disabledClasses} ${className}`.trim();

  if (asLink && href) {
    return (
      <a
        href={href}
        className={classes}
        style={{ textDecoration: "none", color: "inherit" }}
      >
        {children}
      </a>
    );
  }

  return <button className={classes} onClick={onClick} disabled={disabled}>
    {children}
  </button>;
};