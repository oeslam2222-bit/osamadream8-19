/**
 * DesignSystemShowcase.tsx
 * Scannable, responsive demo page that exercises the design system:
 *   - Shell + Topbar + Sidebar (desktop) / MobileNav (mobile)
 *   - Grid (responsive columns) with Cards
 *   - UI primitives: Button, Badge, Input, Label, Separator, Avatar, Skeleton
 *   - Theme toggle + light/dark rendering
 *
 * Built for rapid scannability: compact cards, clear hierarchy, minimal vertical scroll.
 */
import React, { useState } from "react";
import { Shell, Topbar, Sidebar, MobileNav, Grid, Page, Card, Button, Badge, Input, Label, Separator, Avatar, Skeleton } from "..";
import { useTheme } from "../theme/ThemeProvider";
import { Settings, Bell, User, Layout, BarChart } from "lucide-react";

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

export function DesignSystemShowcase() {
  const { colorMode, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);

  return (
    <Shell>
      <Topbar
        onMenuToggle={() => {}}
        onThemeToggle={toggleTheme}
        colorMode={colorMode}
        notifications={3}
        user={{ name: "أحمد التمويني", avatar: undefined }}
        onProfileClick={() => {}}
      />
      <main className="flex-1 relative">
        <Sidebar
          items={navItems}
          brand={
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary text-background flex items-center justify-center font-bold text-[10px]">
                D
              </div>
              <span className="text-sm font-bold text-text">نظام الطنطاوي</span>
            </div>
          }
        />
        <MobileNav items={mobileItems} />

        <Page title="مكونات واجهة المستخدم" subtitle="نظام تصميم متوافق مع الويب والهاتف — اختبار قابلية المسح والاستجابة">
          <Grid
            cols={{ mobile: 1, md: 2, lg: 3, xl: 4 }}
            gap={{ mobile: 4, md: 5, lg: 6 }}
          >
            {[
              { label: "إجمالي العملاء", value: "1,244", delta: "+12%", icon: User, variant: "primary" as const },
              { label: "إجمالي المبيعات", value: "45,800 ج.م", delta: "+8%", icon: BarChart, variant: "primary" as const },
              { label: "الطلبات المعلقة", value: "23", delta: "-4", icon: Layout, variant: "warning" as const },
              { label: "التقييم", value: "4.8", delta: "+0.2", icon: Settings, variant: "success" as const },
            ].map((stat) => (
              <Card key={stat.label} padding="md" hover>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-text-muted">{stat.label}</p>
                    <p className="text-2xl font-bold text-text mt-1">{stat.value}</p>
                    <Badge variant={stat.variant} size="sm">
                      {stat.delta}
                    </Badge>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-surface-subtle flex items-center justify-center text-text-muted">
                    {React.createElement(stat.icon, { className: "w-4 h-4" })}
                  </div>
                </div>
              </Card>
            ))}
          </Grid>

          <Separator label="نماذج الإدخال" className="my-8" />

          <Grid cols={{ mobile: 1, lg: 2 }} gap={{ mobile: 4, lg: 6 }}>
            <Card padding="md">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" placeholder="أدخل اسمك الكامل" />
              <Label htmlFor="email" className="mt-4">البريد الإلكتروني</Label>
              <Input id="email" type="email" placeholder="example@domain.com" />
            </Card>
            <Card padding="md">
              <div className="space-y-3">
                <Button variant="primary" fullWidth>إجراء أساسي</Button>
                <Button variant="outline" fullWidth className="mt-2">تحديد</Button>
                <Button variant="ghost" fullWidth className="mt-2"> ghost </Button>
                <Button variant="danger" fullWidth className="mt-2" disabled>غير متاح</Button>
                <Button variant="success" fullWidth className="mt-2">تأكيد</Button>
              </div>
            </Card>
          </Grid>

          {loading ? (
            <div className="space-y-4">
              <Skeleton width="40%" height="16px" />
              <Skeleton width="70%" height="16px" />
              <Skeleton width="100%" height="100px" />
            </div>
          ) : null}
        </Page>
      </main>
    </Shell>
  );
}

export default DesignSystemShowcase;
