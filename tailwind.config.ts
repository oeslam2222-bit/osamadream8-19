import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./index.html",
  ],
  darkMode: "class",
  theme: {
    extend: {
      spacing: {
        // Proportional spacing scale (pixel-perfect)
        0.25: "4px",
        0.5: "8px",
        1: "8px",
        1.5: "12px",
        2: "16px",
        3: "24px",
        4: "32px",
        5: "40px",
        6: "48px",
        8: "64px",
        10: "80px",
        12: "96px",
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        full: "9999px",
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "1" }],
      },
      fontFamily: {
        // Primary font for Latin scripts (highly legible on screens)
        sans: ["Inter", "system-ui", "sans-serif"],
        // Arabic script font (optimized for Arabic readability)
        arabic: ["Tajawal", "Cairo", "system-ui", "sans-serif"],
      },
      colors: {
        // Base light/dark tokens (kept in sync with src/styles/brand-v2.css)
        light: {
          background: "#F1F5F9",
          surface: "#FFFFFF",
          surfaceSubtle: "#F8FAFC",
          card: "#FFFFFF",
          border: "#E2E8F0",
          text: "#0F172A",
          textSecondary: "#475569",
          textMuted: "#94A3B8",
          primary: "#2563EB",
          primaryHover: "#1D4ED8",
          accent: "#0D9488",
          accentHover: "#0F766E",
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
          textMuted: "#64748B",
          primary: "#3B82F6",
          primaryHover: "#60A5FA",
          accent: "#2DD4BF",
          accentHover: "#5EEAD4",
          success: "#4ADE80",
          warning: "#FBBF24",
          error: "#F87171",
        },
        // Status‑coded color tokens (used by the dashboard cards)
        status: {
          collections: "#2E7D32", // 🟢 Green – cash received / safe
          sales: "#1976D2",       // 🔵 Blue – active orders / business
          returns: "#FFB300",     // 🟠 Amber – returns / adjustments
          pending: "#6B7280",     // ⚪ Slate – pending / neutral
        },
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0,0,0,0.08)",
        md: "0 4px 12px rgba(0,0,0,0.12)",
        lg: "0 8px 24px rgba(0,0,0,0.14)",
        inner: "inset 0 2px 4px rgba(0,0,0,0.04)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "500ms",
      },
    },
  },
  plugins: [],
};

export default config;