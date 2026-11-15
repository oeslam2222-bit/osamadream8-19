/**
 * colors.ts
 * Unified visual identity for Dream Tantawy (ERP).
 *
 * Light Mode: calm, crisp surfaces; colors only in icons/indicators/important numbers.
 * Dark Mode: deep navy-slate surfaces (no pure #000), balanced luminance.
 *
 * Palette (fixed identity):
 *   Primary   #2563EB (blue)     Secondary #0D9488 (teal)
 *   Success   #16A34A (green)    Warning   #F59E0B (amber)
 *   Danger    #DC2626 (red)      Violet    #7C3AED
 */

export type ColorToken =
  | "background"
  | "surface"
  | "surfaceSubtle"
  | "surfaceElevated"
  | "card"
  | "border"
  | "borderSubtle"
  | "text"
  | "textSecondary"
  | "textMuted"
  | "textInverse"
  | "primary"
  | "primaryHover"
  | "primaryActive"
  | "secondary"
  | "secondaryHover"
  | "accent"
  | "accentHover"
  | "success"
  | "successLight"
  | "warning"
  | "warningLight"
  | "error"
  | "errorLight"
  | "overlay";

export type ColorMode = "light" | "dark";

export interface ColorPalette {
  light: Record<ColorToken, string>;
  dark: Record<ColorToken, string>;
}

const lightColors: Record<ColorToken, string> = {
  background: "#F1F5F9",
  surface: "#FFFFFF",
  surfaceSubtle: "#F8FAFC",
  surfaceElevated: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E2E8F0",
  borderSubtle: "#F1F5F9",
  text: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#94A3B8",
  textInverse: "#F8FAFC",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primaryActive: "#1E40AF",
  secondary: "#0D9488",
  secondaryHover: "#0F766E",
  accent: "#0D9488",
  accentHover: "#0F766E",
  success: "#16A34A",
  successLight: "#ECFDF5",
  warning: "#F59E0B",
  warningLight: "#FFFBEB",
  error: "#DC2626",
  errorLight: "#FEF2F2",
  overlay: "rgba(15, 23, 42, 0.45)",
};

const darkColors: Record<ColorToken, string> = {
  background: "#0B1220",
  surface: "#111C2E",
  surfaceSubtle: "#17243A",
  surfaceElevated: "#1E2A3B",
  card: "#111C2E",
  border: "#26364D",
  borderSubtle: "#1E2A3B",
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textInverse: "#0F172A",
  primary: "#60A5FA",
  primaryHover: "#3B82F6",
  primaryActive: "#2563EB",
  secondary: "#2DD4BF",
  secondaryHover: "#14B8A6",
  accent: "#2DD4BF",
  accentHover: "#14B8A6",
  success: "#4ADE80",
  successLight: "#064E3B",
  warning: "#FBBF24",
  warningLight: "#451A03",
  error: "#F87171",
  errorLight: "#450A0A",
  overlay: "rgba(2, 6, 23, 0.6)",
};

export const colorPalette: ColorPalette = {
  light: lightColors,
  dark: darkColors,
};

export const resolveColor = (token: ColorToken, mode: ColorMode): string =>
  colorPalette[mode][token];

export default colorPalette;
