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
 * Full color palette as defined in the CSS variables.
 * Keep in sync with :root and .dark rules in index.css.
 */
export const colorPalette: ColorPalette = {
  light: {
    background: "#F8F9FA",
    surface: "#FFFFFF",
    surfaceSubtle: "#F1F3F5",
    card: "#FFFFFF",
    border: "#DEE2E6",
    text: "#212529",
    textSecondary: "#6C757D",
    textMuted: "#ADB5BD",
    primary: "#2E7D32",
    primaryHover: "#27672B",
    accent: "#1976D2",
    accentHover: "#1565C0",
    success: "#4CAF50",
    warning: "#FFA000",
    error: "#E53935",
  },
  dark: {
    background: "#121212",
    surface: "#1E1E1E",
    surfaceSubtle: "#252525",
    card: "#252525",
    border: "#424242",
    text: "#E0E0E0",
    textSecondary: "#B0B0B0",
    textMuted: "#616161",
    primary: "#BB86FC",
    primaryHover: "#A473F8",
    accent: "#03DAC6",
    accentHover: "#02CBC0",
    success: "#81C784",
    warning: "#FFB300",
    error: "#FF5252",
  },
};

/**
 * Helper to get the appropriate color value for the current mode.
 * Usage: const bg = useColorMode("background"); // returns "#F8F9FA" or "#121212"
 * This can be integrated with a React context if needed.
 */
export const useColorMode = (token: ColorToken): string => {
  // In a real implementation, this would read from a theme context.
  // For now, we just return the light value; consumers should prefer
  // using the CSS custom properties directly (var(--color-...)).
  return colorPalette.light[token];
};