/**
 * theme.ts
 * TypeScript types for the token-based color system.
 * Exported types can be used by any component to reference
 * the CSS custom properties defined in index.css.
 */
export type ColorToken =
  | "background"
  | "surface"
  | "surfaceSubtle"
  | "card"
  | "border"
  | "text"
  | "textSecondary"
  | "textMuted"
  | "primary"
  | "primaryHover"
  | "accent"
  | "accentHover"
  | "success"
  | "warning"
  | "error";

export type ColorMode = "light" | "dark";

export interface ColorPalette {
  light: Record<ColorToken, string>;
  dark: Record<ColorToken, string>;
}

/**
 * Dream Tantawy color palette per visual identity spec.
 * Primary: #2563EB | Secondary: #0D9488 | Success: #16A34A
 * Warning: #F59E0B | Danger: #DC2626 | Violet: #7C3AED
 */
export const colorPalette: ColorPalette = {
  light: {
    background: "#F1F5F9",
    surface: "#FFFFFF",
    surfaceSubtle: "#f1f5f9",
    card: "#FFFFFF",
    border: "#E2E8F0",
    text: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#64748b",
    primary: "#2563EB",
    primaryHover: "#1d4ed8",
    accent: "#0D9488",
    accentHover: "#0b796e",
    success: "#16A34A",
    warning: "#F59E0B",
    error: "#DC2626",
  },
  dark: {
    background: "#0B1220",
    surface: "#111C2E",
    surfaceSubtle: "#17243A",
    card: "#111C2E",
    border: "#26364D",
    text: "#F1F5F9",
    textSecondary: "#94A3B8",
    textMuted: "#64748b",
    primary: "#2563EB",
    primaryHover: "#1d4ed8",
    accent: "#0D9488",
    accentHover: "#0b796e",
    success: "#16A34A",
    warning: "#F59E0B",
    error: "#DC2626",
  },
};

/**
 * Helper to get the appropriate color value for the current mode.
 * Consumers should prefer using CSS custom properties directly (var(--...)).
 */
export const useColorMode = (token: ColorToken): string => {
  return colorPalette.light[token];
};
