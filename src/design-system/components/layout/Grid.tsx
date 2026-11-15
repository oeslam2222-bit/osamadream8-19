/**
 * Grid.tsx
 * Responsive grid system with proportional gutters.
 *
 * Uses a mobile-first column count with desktop-first overrides:
 *   cols={{ mobile: 1, md: 2, lg: 3, xl: 4 }}
 * Gap is responsive too.
 *
 * Usage:
 *   <Grid cols={{ mobile: 1, md: 2, lg: 3 }} gap={{ mobile: 4, lg: 6 }}>
 *     {cards}
 *   </Grid>
 */
import React from "react";
import { cn } from "../../utils/cn";
import type { GridProps, ResponsiveValue } from "../../types";

function resolveResponsive<T>(value: ResponsiveValue<T> | undefined): T | undefined {
  if (!value) return undefined;
  // Return the value keyed by the smallest matching breakpoint (mobile base first).
  // Tailwind uses min-width, so we return base `mobile` and rely on utilities for larger.
  return value.mobile ?? value.sm ?? value.md ?? value.lg ?? value.xl ?? value["2xl"];
}

function resolveGap(value: GridProps["gap"]): string | number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return resolveResponsive(value);
}

export const Grid: React.FC<GridProps> = ({
  children,
  cols,
  gap,
  className,
}) => {
  const colCount = resolveResponsive(cols);
  const gapValue = resolveGap(gap);

  // Build Tailwind grid classes. Base = mobile (1 col by default), then md+/lg+/xl+ overrides.
  const gridClasses = cn(
    "grid w-full",
    gapValue ? `gap-${gapValue}` : "gap-6",
    colCount
      ? colCount === 1
        ? "grid-cols-1"
        : `grid-cols-${colCount} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    className,
  );

  return <div className={gridClasses}>{children}</div>;
};

export default Grid;
