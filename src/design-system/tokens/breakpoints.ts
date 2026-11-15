/**
 * breakpoints.ts
 * Responsive breakpoints: mobile-first base, then desktop-first overrides
 * via Tailwind's min-width utilities.
 */
export type Breakpoint = "mobile" | "sm" | "md" | "lg" | "xl" | "2xl";

export const breakpoints: Record<Breakpoint, string> = {
  mobile: "0px",   // base styles target compact mobile viewports
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

/** Container max-widths per breakpoint. */
export const container = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1400px",
} as const;

export default breakpoints;
