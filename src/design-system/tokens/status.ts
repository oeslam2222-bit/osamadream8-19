/**
 * status.ts
 * Representative-app status color coding.
 *
 * Distinct, accessible, intuitive themes for the key financial/operational
 * statuses of a Sales Representative / Delivery Dispatch app:
 *
 *   🟢 collections  — تحصيل (Cash-in): professional green, money received.
 *   🔵 sales        — مبيعات (Orders): professional blue/indigo, active business.
 *   🟠 returns     — مرتجعات: warm amber/coral, items coming back, not alarming.
 *   ⚪ pending     — معلق / عام: neutral slate, inactive or pending queues.
 *
 * Each status ships light + dark variants with bg/text/icon/border/accent
 * tokens so icons, badges and cards stay consistent and WCAG-AA compliant.
 */

export type StatusKey = "collections" | "sales" | "returns" | "pending";

export interface StatusColorSet {
  /** Soft tinted background for cards/badges. */
  bg: string;
  /** Stronger accent fill for icons/borders. */
  accent: string;
  /** High-contrast text color on the tinted bg. */
  text: string;
  /** Border color for outlined cards. */
  border: string;
  /** Glow color for dark mode icon emphasis. */
  glow: string;
}

export interface StatusTheme {
  light: StatusColorSet;
  dark: StatusColorSet;
}

export const statusTheme: Record<StatusKey, StatusTheme> = {
  collections: {
    light: {
      bg: "#ECFDF5",       // emerald-50
      accent: "#10B981",    // emerald-500
      text: "#047857",      // emerald-700
      border: "#A7F3D0",    // emerald-200
      glow: "rgba(16, 185, 129, 0.25)",
    },
    dark: {
      bg: "#064E3B",        // emerald-900 (deep)
      accent: "#34D399",    // emerald-400 (glowing)
      text: "#6EE7B7",      // emerald-300
      border: "#065F46",    // emerald-800
      glow: "rgba(52, 211, 153, 0.35)",
    },
  },
  sales: {
    light: {
      bg: "#EFF6FF",       // blue-50
      accent: "#3B82F6",    // blue-500
      text: "#1D4ED8",      // blue-700
      border: "#BFDBFE",    // blue-200
      glow: "rgba(59, 130, 246, 0.25)",
    },
    dark: {
      bg: "#1E3A8A",        // blue-900 (deep)
      accent: "#60A5FA",    // blue-400 (glowing)
      text: "#93C5FD",      // blue-300
      border: "#1E40AF",    // blue-800
      glow: "rgba(96, 165, 250, 0.35)",
    },
  },
  returns: {
    light: {
      bg: "#FFFBEB",       // amber-50
      accent: "#F59E0B",    // amber-500
      text: "#B45309",      // amber-700
      border: "#FDE68A",    // amber-200
      glow: "rgba(245, 158, 11, 0.25)",
    },
    dark: {
      bg: "#451A03",        // amber-900 (deep)
      accent: "#FBBF24",    // amber-400 (glowing)
      text: "#FCD34D",      // amber-300
      border: "#78350F",    // amber-800
      glow: "rgba(251, 191, 36, 0.35)",
    },
  },
  pending: {
    light: {
      bg: "#F1F5F9",       // slate-100
      accent: "#64748B",    // slate-500
      text: "#334155",      // slate-700
      border: "#CBD5E1",    // slate-300
      glow: "rgba(100, 116, 139, 0.2)",
    },
    dark: {
      bg: "#1E293B",        // slate-800
      accent: "#94A3B8",    // slate-400 (glowing)
      text: "#CBD5E1",      // slate-300
      border: "#334155",    // slate-700
      glow: "rgba(148, 163, 184, 0.25)",
    },
  },
};

/** Arabic labels for each status (UI display). */
export const statusLabels: Record<StatusKey, string> = {
  collections: "التحصيل",
  sales: "المبيعات",
  returns: "المرتجعات",
  pending: "معلق",
};

/** Short descriptions for scannability. */
export const statusDescriptions: Record<StatusKey, string> = {
  collections: "النقد المحصّل والعمليات الآمنة",
  sales: "الطلبيات والمعاملات التجارية النشطة",
  returns: "المواد المرجعة وال adjustments",
  pending: "القوائم غير النشطة أو المعلقة",
};

export default statusTheme;
