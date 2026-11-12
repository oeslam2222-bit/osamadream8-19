/**
 * typography.ts
 * Type scale with proportional line heights for high scannability.
 * Fonts: Inter (Latin), Tajawal / Cairo (Arabic).
 */
export type FontSizeToken =
  | "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "6xl";

export type FontWeightToken = "thin" | "extralight" | "light" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";

export type LineHeightToken = "none" | "tight" | "snug" | "normal" | "relaxed" | "loose";

export interface FontScaleEntry {
  size: string;
  lineHeight: string;
  letterSpacing?: string;
  fontWeight?: FontWeightToken;
}

export const fontScale: Record<FontSizeToken, FontScaleEntry> = {
  xs:   { size: "0.75rem",  lineHeight: "1rem",     letterSpacing: "0em", fontWeight: "normal" },
  sm:   { size: "0.875rem", lineHeight: "1.25rem",  letterSpacing: "0em", fontWeight: "normal" },
  base: { size: "1rem",     lineHeight: "1.5rem",   letterSpacing: "0em", fontWeight: "normal" },
  lg:   { size: "1.125rem", lineHeight: "1.75rem",  letterSpacing: "-0.01em", fontWeight: "normal" },
  xl:   { size: "1.25rem",  lineHeight: "1.75rem",  letterSpacing: "-0.01em", fontWeight: "semibold" },
  "2xl":{ size: "1.5rem",   lineHeight: "2rem",     letterSpacing: "-0.02em", fontWeight: "semibold" },
  "3xl":{ size: "1.875rem", lineHeight: "2.25rem",  letterSpacing: "-0.02em", fontWeight: "bold" },
  "4xl":{ size: "2.25rem",  lineHeight: "2.5rem",   letterSpacing: "-0.02em", fontWeight: "bold" },
  "5xl":{ size: "3rem",     lineHeight: "1",        letterSpacing: "-0.03em", fontWeight: "bold" },
  "6xl":{ size: "3.75rem",  lineHeight: "1",        letterSpacing: "-0.03em", fontWeight: "bold" },
} as const;

/** Semantic text styles for rapid scannability. */
export const textStyles = {
  // Body
  bodySm:  { fontSize: "sm",  lineHeight: "snug" },
  body:    { fontSize: "base", lineHeight: "relaxed" },
  bodyLg:  { fontSize: "lg",  lineHeight: "relaxed" },
  // Captions / muted
  caption: { fontSize: "xs",  lineHeight: "normal", fontWeight: "medium" as FontWeightToken },
  overline:{ fontSize: "xs",  lineHeight: "normal", fontWeight: "semibold" as FontWeightToken, letterSpacing: "0.05em" },
  // Headings
  headingSm: { fontSize: "xl",  lineHeight: "snug", fontWeight: "bold" as FontWeightToken },
  heading:   { fontSize: "2xl", lineHeight: "snug", fontWeight: "bold" as FontWeightToken },
  headingLg: { fontSize: "3xl", lineHeight: "snug", fontWeight: "bold" as FontWeightToken },
  headingXl: { fontSize: "4xl", lineHeight: "tight", fontWeight: "bold" as FontWeightToken },
  // Display
  display:  { fontSize: "5xl", lineHeight: "none", fontWeight: "bold" as FontWeightToken },
  displayLg:{ fontSize: "6xl", lineHeight: "none", fontWeight: "bold" as FontWeightToken },
} as const;

export const fontFamily = {
  sans: ["Inter", "system-ui", "sans-serif"],
  arabic: ["Tajawal", "Cairo", "system-ui", "sans-serif"],
} as const;

export const fontWeight: Record<FontWeightToken, string> = {
  thin: "100",
  extralight: "200",
  light: "300",
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

export const lineHeight: Record<LineHeightToken, string> = {
  none: "1",
  tight: "1.25",
  snug: "1.375",
  normal: "1.5",
  relaxed: "1.625",
  loose: "2",
} as const;

export default fontScale;
