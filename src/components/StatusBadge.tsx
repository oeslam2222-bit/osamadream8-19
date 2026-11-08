/**
 * StatusBadge.tsx
 * A small pill-shaped badge that visualizes a financial/operational status
 * (collections, sales, returns, pending) using the token‑based color system.
 * Light/dark mode colors are automatically resolved from the CSS variables
 * defined in index.css.
 */
import React from "react";
import "./index.css";

/** Status type enum */
export type StatusType = "collections" | "sales" | "returns" | "pending";

/** Props for StatusBadge */
export interface StatusBadgeProps {
  /** The status type determines background/text color */
  type: StatusType;
  /** Label text shown inside the badge */
  label: string;
  /** Optional size (sm, md, lg) */
  size?: "sm" | "md" | "lg";
  /** Optional className override */
  className?: string;
}

/**
 * StatusBadge renders a colored pill using CSS custom properties.
 * The background color pulls from `--color-status-{type}` which is defined
 * for both `:root` (light) and `.dark` (dark mode) and automatically adjusts
 * for contrast.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  type,
  label,
  size = "md",
  className,
}) => {
  // Map size to line‑height / font‑size values
  const sizeProps = {
    sm: "text-xs px-2",
    md: "text-sm px-3",
    lg: "text-base px-4",
  };

  // Build the inline background variable name, e.g. var(--color-status-collections)
  const bgVar = `var(--color-status-${type})`;
  // Text color: white for most statuses, but use neutral text for "pending"
  const textColor = type === "pending" ? "var(--color-text)" : "white";

  return (
    <span
      className={`
        inline-flex items-center rounded-full 
        ${sizeProps[size]}
        transition-colors 
        ${className}
      `}
      style={{
        backgroundColor: bgVar,
        color: textColor,
      }}
    >
      {label}
    </span>
  );
};