/**
 * RepDashboard.tsx
 * Core Representative / Delivery Dispatch dashboard.
 *
 * Scannable, responsive, status color-coded:
 *   🟢 تحصيل (Collections)  🔵 مبيعات (Sales)  🟠 مرتجعات (Returns)  ⚪ معلق (Pending)
 *
 * Mobile-first: 2x2 stat grid on small screens, 4 cols on desktop.
 * Uses tabular numerals for dense numeric data and compact spacing.
 */
import React from "react";
import { Shell, Topbar, Sidebar, MobileNav, Grid, Page, StatusCard } from "..";
import { useTheme } from "../theme/ThemeProvider";
import { statusTheme } from "../tokens";
import { Wallet, ShoppingCart, RotateCcw, Clock, Bell, User, Layout, BarChart, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "الرئيسية", icon: Layout, active: true },
  { href: "/customers", label: "العملاء", icon: User },
  { href: "/sales", label: "المبيعات", icon: BarChart },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

const mobileItems = [
  { href: "/", label: "الرئيسية", icon: Layout, active: true },
  { href: "/customers", label: "العملاء", icon: User },
  { href: "/sales", label: "المبيعات", icon: BarChart },
  { href: "/settings", label: "المزيد", icon: Settings },
];

export function RepDashboard() {
  const { colorMode, toggleTheme } = useTheme();

  return (
    <Shell>
      <Topbar
        onMenuToggle={() => {}}
        onThemeToggle={toggleTheme}
        colorMode={colorMode}
        notifications={5}
        user={{ name: "أحمد التمويني" }}
        onProfileClick={() => {}}
      />
      <main className="flex-1 relative">
        <Sidebar
          items={navItems}
          brand={
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary text-background flex items-center justify-center font-bold text-[10px]">
                R
              </div>
              <span className="text-sm font-bold text-text">مندوب التوزيع</span>
            </div>
          }
        />
        <MobileNav items={mobileItems} />

        <Page title="لوحة تحكم المندوب" subtitle="ملخص يومي — تحصيل، مبيعات، مرتجعات، ومعلق">
          {/* Status-coded stat cards: scannable, color-coded by status */}
          <Grid cols={{ mobile: 2, md: 2, lg: 4 }} gap={{ mobile: 3, md: 4, lg: 5 }}>
            <StatusCard
              status="collections"
              value="12,450 ج.م"
              delta="+8% عن الأمس"
              deltaDirection="up"
              icon={<Wallet className="w-5 h-5" />}
            />
            <StatusCard
              status="sales"
              value="34"
              delta="+5 طلبيات"
              deltaDirection="up"
              icon={<ShoppingCart className="w-5 h-5" />}
            />
            <StatusCard
              status="returns"
              value="3"
              delta="-1"
              deltaDirection="down"
              icon={<RotateCcw className="w-5 h-5" />}
            />
            <StatusCard
              status="pending"
              value="7"
              delta="بانتظار التأكيد"
              deltaDirection="flat"
              icon={<Clock className="w-5 h-5" />}
            />
          </Grid>

          {/* Recent activity list — status-colored icons */}
          <div className="mt-6 sm:mt-8">
            <h3 className="text-sm font-bold text-text mb-3">آخر العمليات</h3>
            <div className="space-y-2">
              {[
                { status: "collections" as const, title: "تحصيل من عميل الفيوم", amount: "+1,200 ج.م", time: "منذ 5 دقائق" },
                { status: "sales" as const, title: "طلبية جديدة #INV-045", amount: "+850 ج.م", time: "منذ 12 دقيقة" },
                { status: "returns" as const, title: "مرتجع صنف كاسات", amount: "-200 ج.م", time: "منذ 25 دقيقة" },
                { status: "pending" as const, title: "طلبية بانتظار التأكيد", amount: "—", time: "منذ 40 دقيقة" },
              ].map((item, i) => {
                const colors = statusTheme[item.status][colorMode];
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center"
                        style={{ backgroundColor: colors.bg, color: colors.accent }}
                        aria-hidden="true"
                      >
                        <span className="text-xs font-bold">●</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">{item.title}</p>
                        <p className="text-[11px] text-text-muted">{item.time}</p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold tabular-nums shrink-0"
                      style={{ color: colors.text }}
                    >
                      {item.amount}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Page>
      </main>
    </Shell>
  );
}

export default RepDashboard;
