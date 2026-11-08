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
        // Base light/dark tokens (existing)
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