/**
 * ThemeProvider.tsx
 * Enhanced theme provider that:
 *   1. Toggles the `dark` class on <html> (for Tailwind v4 @theme when dark).
 *   2. Persists preference to localStorage.
 *   3. Respects system prefers-color-scheme on first visit.
 *   4. Exposes CSS custom properties defined in theme/css-variables.css.
 *
 * Drop-in replacement/upgrade for the existing context/themeContext.tsx.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ThemeContextValue } from "../types";
import type { ColorMode } from "../tokens";

const STORAGE_KEY = "tantawy_dark_mode";
const context = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultMode = "system",
}: {
  children: React.ReactNode;
  defaultMode?: ColorMode | "system";
}) {
  const [mode, setMode] = useState<ColorMode>("light");

  // Resolve initial mode: saved preference > system preference > default
  useEffect(() => {
    let resolved: ColorMode = "light";

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") {
        resolved = saved;
      } else if (defaultMode === "system") {
        resolved =
          window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      } else {
        resolved = defaultMode;
      }
    } catch {
      resolved = defaultMode === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : (defaultMode ?? "light");
    }

    setMode(resolved);
    applyModeToRoot(resolved);
  }, [defaultMode]);

  // Apply `dark` class to root so Tailwind v4 @theme when dark picks up dark tokens.
  const applyModeToRoot = useCallback((next: ColorMode) => {
    const root = document.documentElement;
    if (next === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-color-mode", "dark");
    } else {
      root.classList.remove("dark");
      root.setAttribute("data-color-mode", "light");
    }
  }, []);

  useEffect(() => {
    applyModeToRoot(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }, [mode, applyModeToRoot]);

  // Listen to system theme changes when in system mode.
  useEffect(() => {
    if (defaultMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setMode(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [defaultMode]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const setTheme = useCallback((next: ColorMode) => {
    setMode(next);
  }, []);

  const value: ThemeContextValue = {
    colorMode: mode,
    toggleTheme,
    setTheme,
    direction: "rtl",
    setDirection: () => {
      // Direction is fixed RTL for this app; exposed for API compatibility.
    },
  };

  return (
    <context.Provider value={value}>{children}</context.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(context);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}

export default ThemeProvider;
