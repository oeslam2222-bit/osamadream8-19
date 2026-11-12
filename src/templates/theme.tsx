/**
 * templates/theme.tsx
 * Minimal theme provider for the template previews.
 * Same behavior/persistence as design-system ThemeProvider
 * (localStorage `tantawy_dark_mode`, system preference, .dark on <html>)
 * but self-contained so it does not pull css-variables.css.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ColorMode = "light" | "dark";

const STORAGE_KEY = "tantawy_dark_mode";

interface TemplateThemeValue {
  colorMode: ColorMode;
  toggleTheme: () => void;
  setTheme: (mode: ColorMode) => void;
}

const ThemeContext = createContext<TemplateThemeValue | undefined>(undefined);

function resolveInitial(defaultMode: ColorMode | "system"): ColorMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  if (defaultMode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return defaultMode;
}

export function TemplateThemeProvider({
  children,
  defaultMode = "system",
}: {
  children: React.ReactNode;
  defaultMode?: ColorMode | "system";
}) {
  const [colorMode, setColorMode] = useState<ColorMode>(() => resolveInitial(defaultMode));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", colorMode === "dark");
    root.setAttribute("data-color-mode", colorMode);
    try {
      localStorage.setItem(STORAGE_KEY, colorMode);
    } catch {
      /* ignore */
    }
  }, [colorMode]);

  // Follow system changes unless user picked explicitly (we treat any toggle as explicit).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (saved !== "light" && saved !== "dark") {
        setColorMode(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setColorMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const setTheme = useCallback((mode: ColorMode) => setColorMode(mode), []);

  return (
    <ThemeContext.Provider value={{ colorMode, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTemplateTheme(): TemplateThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTemplateTheme must be used within TemplateThemeProvider");
  return ctx;
}

/** Chart-safe palette resolved per mode (recharts needs concrete hex values). */
export const chartPalette = {
  light: {
    primary: "#2563EB",
    secondary: "#0D9488",
    success: "#16A34A",
    warning: "#F59E0B",
    violet: "#7C3AED",
    error: "#DC2626",
    textMuted: "#94A3B8",
    textSecondary: "#475569",
    border: "#E2E8F0",
    card: "#FFFFFF",
    grid: "#E2E8F0",
  },
  dark: {
    primary: "#60A5FA",
    secondary: "#2DD4BF",
    success: "#4ADE80",
    warning: "#FBBF24",
    violet: "#A78BFA",
    error: "#F87171",
    textMuted: "#64748B",
    textSecondary: "#94A3B8",
    border: "#26364D",
    card: "#111C2E",
    grid: "#1E2A3B",
  },
} as const;

export type ChartPalette = (typeof chartPalette)["light"];
