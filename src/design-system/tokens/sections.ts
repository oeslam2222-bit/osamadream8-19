/**
 * sections.ts
 * Unified section color registry for Dream Tantawy (ERP).
 *
 * Each functional section keeps the SAME color across all pages and both
 * light/dark themes (only brightness adjusted in dark mode).
 *
 * Usage:
 *   const s = sectionTheme.sales;
 *   <Icon className="..." style={{ color: s.accent }} />
 *   <div className="..." style={{ backgroundColor: s.bg }} />
 */

export type SectionKey =
  | "sales"
  | "customers"
  | "inventory"
  | "collections"
  | "returns"
  | "invoices"
  | "reports"
  | "alerts"
  | "targets"
  | "visits";

export interface SectionColorSet {
  light: { bg: string; accent: string; text: string; border: string };
  dark: { bg: string; accent: string; text: string; border: string };
}

export const sectionTheme: Record<SectionKey, SectionColorSet> = {
  sales: {
    light: { bg: "#EFF6FF", accent: "#2563EB", text: "#1D4ED8", border: "#BFDBFE" },
    dark:  { bg: "#1E3A8A", accent: "#60A5FA", text: "#93C5FD", border: "#1E40AF" },
  },
  customers: {
    light: { bg: "#F0FDFA", accent: "#0D9488", text: "#0F766E", border: "#99F6E4" },
    dark:  { bg: "#134E4A", accent: "#2DD4BF", text: "#5EEAD4", border: "#115E59" },
  },
  inventory: {
    light: { bg: "#F5F3FF", accent: "#7C3AED", text: "#6D28D9", border: "#DDD6FE" },
    dark:  { bg: "#3B0764", accent: "#A78BFA", text: "#C4B5FD", border: "#4C1D95" },
  },
  collections: {
    light: { bg: "#ECFDF5", accent: "#16A34A", text: "#15803D", border: "#A7F3D0" },
    dark:  { bg: "#064E3B", accent: "#4ADE80", text: "#86EFAC", border: "#065F46" },
  },
  returns: {
    light: { bg: "#FFFBEB", accent: "#F59E0B", text: "#B45309", border: "#FDE68A" },
    dark:  { bg: "#451A03", accent: "#FBBF24", text: "#FCD34D", border: "#78350F" },
  },
  invoices: {
    light: { bg: "#ECFEFF", accent: "#06B6D4", text: "#0E7490", border: "#A5F3FC" },
    dark:  { bg: "#164E63", accent: "#22D3EE", text: "#67E8F9", border: "#155E75" },
  },
  reports: {
    light: { bg: "#EEF2FF", accent: "#4F46E5", text: "#4338CA", border: "#C7D2FE" },
    dark:  { bg: "#312E81", accent: "#818CF8", text: "#A5B4FC", border: "#3730A3" },
  },
  alerts: {
    light: { bg: "#FEF2F2", accent: "#DC2626", text: "#B91C1C", border: "#FECACA" },
    dark:  { bg: "#450A0A", accent: "#F87171", text: "#FCA5A5", border: "#7F1D1D" },
  },
  targets: {
    light: { bg: "#F0F9FF", accent: "#0284C7", text: "#0369A1", border: "#BAE6FD" },
    dark:  { bg: "#0C4A6E", accent: "#38BDF8", text: "#7DD3FC", border: "#075985" },
  },
  visits: {
    light: { bg: "#FDF4FF", accent: "#A21CAF", text: "#86198F", border: "#F5D0FE" },
    dark:  { bg: "#4A044E", accent: "#E879F9", text: "#F0ABFC", border: "#701A75" },
  },
};

/** Arabic labels for each section. */
export const sectionLabels: Record<SectionKey, string> = {
  sales: "المبيعات",
  customers: "العملاء",
  inventory: "المخزون",
  collections: "التحصيلات",
  returns: "المرتجعات",
  invoices: "الفواتير",
  reports: "التقارير",
  alerts: "التنبيهات",
  targets: "الأهداف",
  visits: "الزيارات",
};

export default sectionTheme;
