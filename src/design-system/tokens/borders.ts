/**
 * borders.ts
 * Border radius and border-width tokens.
 */
export type BorderRadiusToken = "none" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";

export const borderRadius: Record<BorderRadiusToken, string> = {
  none: "0",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  "3xl": "32px",
  full: "9999px",
} as const;

export type BorderWidthToken = "0" | "1" | "2" | "4" | "8";

export const borderWidth: Record<BorderWidthToken, string> = {
  0: "0",
  1: "1px",
  2: "2px",
  4: "4px",
  8: "8px",
} as const;

export default borderRadius;
