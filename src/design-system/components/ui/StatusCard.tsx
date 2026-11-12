/**
 * StatusCard.tsx
 * Scannable stat card color-coded by representative-app status:
 *   collections (green), sales (blue), returns (amber), pending (slate).
 *
 * Compact, thumb-friendly, works in light/dark themes.
 */
import React from "react";
import { cn } from "../../utils/cn";
import { getColorMode } from "../../utils/theme";
import { statusTheme, statusLabels, statusDescriptions, type StatusKey } from "../../tokens";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatusCardProps {
  status: StatusKey;
  value: string | number;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  label?: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  status,
  value,
  delta,
  deltaDirection = "up",
  label,
  description,
  icon,
  className,
}) => {
  const mode = getColorMode();
  const colors = statusTheme[status][mode];
  const resolvedLabel = label ?? statusLabels[status];
  const resolvedDescription = description ?? statusDescriptions[status];

  const DeltaIcon =
    deltaDirection === "up" ? TrendingUp : deltaDirection === "down" ? TrendingDown : Minus;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      style={{
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: colors.text }}
          >
            {resolvedLabel}
          </p>
          <p
            className="mt-1 text-2xl sm:text-3xl font-bold tabular-nums leading-none"
            style={{ color: colors.text }}
          >
            {value}
          </p>
          {delta && (
            <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: colors.text }}>
              <DeltaIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{delta}</span>
            </div>
          )}
          <p className="mt-2 text-[11px] text-text-muted leading-snug">
            {resolvedDescription}
          </p>
        </div>
        <div
          className="shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: colors.accent, color: "#FFFFFF", boxShadow: `0 4px 12px ${colors.glow}` }}
          aria-hidden="true"
        >
          {icon ?? <span className="text-lg font-bold">●</span>}
        </div>
      </div>
    </div>
  );
};

export default StatusCard;
