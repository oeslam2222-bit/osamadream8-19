/**
 * theme.ts
 * Helpers for reading color tokens and mode in JavaScript.
 * Integrates with the existing ThemeProvider (which toggles a `dark` class on <html>).
 */

import type { ColorToken, ColorMode } from "../tokens";
import colorPalette from "../tokens/colors";

/**
 * Returns the current color mode by inspecting the `dark` class on <html>.
 * Mirrors the existing ThemeProvider behavior.
 */
export function getColorMode(): ColorMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Get a CSS custom property name for a color token.
 * Use with style={{ color: `var(--color-${token})` }}.
 */
export function cssVar(token: string): string {
  return `var(--color-${token})`;
}


