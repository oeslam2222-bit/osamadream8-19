/**
 * templates/TemplateApp.tsx
 * Template preview app — mounts the analytics dashboard inside a proper shell:
 *
 *   Mobile (default)  → app-like full width, content centered at max-w-md
 *                       (reads correctly even in a half-screen view),
 *                       top bar + bottom tab navigation.
 *   Web (lg+)         → flexible dashboard: fixed sidebar (RTL right side),
 *                       fluid content up to max-w-7xl.
 *
 * Preview: open the app with ?template (e.g. http://localhost:3000/?template)
 */
import React, { useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  X,
} from "lucide-react";
import { TemplateThemeProvider, useTemplateTheme } from "./theme";
import AnalyticsDashboard from "./analytics/AnalyticsDashboard";
import CustomersTemplate from "./customers/CustomersTemplate";
import OrderFlowTemplate from "./orders/OrderFlowTemplate";
import InvoicesTemplate from "./invoices/InvoicesTemplate";
import ReportsTemplate from "./reports/ReportsTemplate";
import SettingsTemplate from "./settings/SettingsTemplate";

const navItems = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "analytics", label: "التحليلات", icon: BarChart3 },
  { key: "reports", label: "التقارير", icon: ClipboardList },
  { key: "orders", label: "الطلبيات", icon: ShoppingCart },
  { key: "customers", label: "العملاء", icon: Users },
  { key: "invoices", label: "الفواتير", icon: FileText },
  { key: "inventory", label: "المخزون", icon: Boxes },
  { key: "settings", label: "الإعدادات", icon: Settings },
] as const;

const mobileItems = [
  { key: "home", label: "الرئيسية", icon: Home },
  { key: "analytics", label: "التحليلات", icon: BarChart3 },
  { key: "customers", label: "العملاء", icon: Users },
  { key: "more", label: "المزيد", icon: Menu },
] as const;

/* ------------------------------------------------------------------ */

function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { colorMode, toggleTheme } = useTemplateTheme();
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="flex items-center gap-2">
        {/* Mobile: app brand. Desktop: hamburger lives in the sidebar, so show brand only. */}
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-white">
          D
        </div>
        <div className="leading-tight">
          <p className="text-sm font-extrabold text-text">Dream</p>
          <p className="hidden text-[10px] text-text-muted sm:block">نظام المبيعات والتوزيع</p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text"
          aria-label="تبديل الوضع الليلي"
          title={colorMode === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
        >
          {colorMode === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/15 text-xs font-bold text-secondary">
          أ.م
        </div>
        <button
          onClick={onOpenMenu}
          className="rounded-lg p-2 text-text-secondary lg:hidden"
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function Sidebar({
  open,
  onClose,
  activeTab,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  activeTab: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <>
      {/* Scrim (mobile drawer) */}
      <div
        className={`fixed inset-0 z-40 bg-overlay transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-64 flex-col border-l border-border bg-surface transition-transform duration-300 lg:z-30 lg:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="القائمة الرئيسية"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-black text-white">
              D
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-text">Dream</p>
              <p className="text-[10px] text-text-muted">لوحة الإدارة العليا</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-text-muted hover:bg-surface-subtle hover:text-text lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
                    : "text-text-secondary hover:bg-surface-subtle hover:text-text"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-text-muted"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              أم
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-text">أحمد محمد</p>
              <p className="text-[11px] text-text-muted">مدير النظام</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */

function MobileNav({
  activeTab,
  onNavigate,
}: {
  activeTab: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-surface/85 px-2 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-surface/65 lg:hidden">
      {mobileItems.map((item) => {
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`flex min-w-[64px] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] ${
              active ? "font-bold text-primary" : "text-text-muted"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ */

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("analytics");

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background text-text antialiased">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        activeTab={activeTab}
        onNavigate={setActiveTab}
      />
      <Topbar onOpenMenu={() => setMenuOpen(true)} />

      <main className="lg:mr-64">
        <div className="mx-auto w-full max-w-md px-4 lg:max-w-7xl lg:px-8">
          {activeTab === "analytics" ? (
            <AnalyticsDashboard />
          ) : activeTab === "customers" ? (
            <CustomersTemplate />
          ) : activeTab === "orders" ? (
            <OrderFlowTemplate />
          ) : activeTab === "invoices" ? (
            <InvoicesTemplate />
          ) : activeTab === "reports" ? (
            <ReportsTemplate />
          ) : activeTab === "settings" ? (
            <SettingsTemplate />
          ) : (
            <PlaceholderScreen tab={activeTab} onBack={() => setActiveTab("analytics")} />
          )}
        </div>
      </main>

      <MobileNav activeTab={activeTab} onNavigate={setActiveTab} />

      {/* "المزيد" bottom-sheet on mobile (half-screen friendly) */}
      <MoreSheet open={activeTab === "more"} onSelect={setActiveTab} onClose={() => setActiveTab("analytics")} />
    </div>
  );
}

function PlaceholderScreen({ tab, onBack }: { tab: string; onBack: () => void }) {
  const item = navItems.find((n) => n.key === tab);
  return (
    <div dir="rtl" className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {item ? <item.icon className="h-8 w-8" /> : <LayoutDashboard className="h-8 w-8" />}
      </div>
      <div>
        <h2 className="text-lg font-bold text-text">شاشة {item?.label ?? tab}</h2>
        <p className="mt-1 text-sm text-text-secondary">
          تيمبلت قادم — التزم بنفس الـ tokens بتاعة الداشبورد.
        </p>
      </div>
      <button
        onClick={onBack}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        رجوع للتحليلات
      </button>
    </div>
  );
}

function MoreSheet({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (tab: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-overlay lg:hidden" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl border-t border-border bg-surface p-4 pb-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <p className="mb-3 text-sm font-bold text-text">المزيد</p>
        <div className="grid grid-cols-3 gap-3">
          {navItems
            .filter((n) => !mobileItems.some((m) => m.key === n.key))
            .map((item) => (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-[11px] font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-text"
              >
                <item.icon className="h-5 w-5 text-primary" />
                {item.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function TemplateApp() {
  return (
    <TemplateThemeProvider>
      <Layout />
    </TemplateThemeProvider>
  );
}
