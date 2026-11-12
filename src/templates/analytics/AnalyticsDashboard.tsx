/**
 * templates/analytics/AnalyticsDashboard.tsx
 * Executive analytics dashboard template — Template #1.
 *
 * Design rules:
 *   - Mobile-first: single column, max-w-md centered, bottom spacing for MobileNav.
 *     Reads like a native app even in a half-screen view.
 *   - Web (lg+): fluid, wider grid (max-w-7xl) next to the sidebar.
 *   - Light: calm surfaces, color only in indicators/numbers.
 *   - Dark : deep navy, never pure black.
 */
import React, { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Minus,
  RotateCcw,
  ShoppingBag,
  Timer,
  TrendingUp,
} from "lucide-react";
import { chartPalette, useTemplateTheme } from "../theme";
import {
  branchPerformance,
  kpisByPeriod,
  orderStatusLabels,
  periodLabels,
  productMix,
  recentOrders,
  topCustomers,
  topProducts,
  trendByPeriod,
  type KpiItem,
  type PeriodKey,
} from "./data";

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

const toneClasses: Record<KpiItem["tone"], { chip: string; text: string }> = {
  primary: { chip: "bg-primary/10 text-primary dark:bg-primary/15", text: "text-primary" },
  success: { chip: "bg-success/10 text-success dark:bg-success/15", text: "text-success" },
  warning: { chip: "bg-warning/10 text-warning dark:bg-warning/15", text: "text-warning" },
  error: { chip: "bg-error/10 text-error dark:bg-error/15", text: "text-error" },
};

const toneIcons: Record<KpiItem["tone"], React.ReactNode> = {
  primary: <Banknote className="h-5 w-5" />,
  success: <ShoppingBag className="h-5 w-5" />,
  warning: <RotateCcw className="h-5 w-5" />,
  error: <Timer className="h-5 w-5" />,
};

function DeltaArrow({ direction }: { direction: KpiItem["direction"] }) {
  if (direction === "up") return <ArrowUpRight className="h-3.5 w-3.5" />;
  if (direction === "down") return <ArrowDownRight className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

function KpiCard({ item }: { item: KpiItem }) {
  const tone = toneClasses[item.tone];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide text-text-secondary">{item.label}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.chip}`} aria-hidden="true">
          {toneIcons[item.tone]}
        </span>
      </div>
      <p className="text-xl font-bold leading-none tabular-nums text-text sm:text-2xl">{item.value}</p>
      <div className={`flex items-center gap-1 text-[11px] font-medium ${tone.text}`}>
        <DeltaArrow direction={item.direction} />
        <span>{item.delta}</span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-text sm:text-base">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Chart helpers                                                       */
/* ------------------------------------------------------------------ */

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  formatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg" dir="rtl">
      <p className="mb-1 font-bold text-text">{label}</p>
      <ul className="space-y-1">
        {payload.map((entry, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-text">
              {typeof entry.value === "number" && formatter ? formatter(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const compactEGP = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : String(v);

const fullEGP = (v: number) => `${v.toLocaleString("en-US")} ج.م`;

/* ------------------------------------------------------------------ */
/* Main dashboard                                                      */
/* ------------------------------------------------------------------ */

export function AnalyticsDashboard() {
  const { colorMode } = useTemplateTheme();
  const palette = chartPalette[colorMode];
  const [period, setPeriod] = useState<PeriodKey>("week");

  const kpis = kpisByPeriod[period];
  const trend = trendByPeriod[period];

  const mixData = useMemo(
    () => productMix.map((s) => ({ ...s, fill: palette[s.color] })),
    [palette],
  );

  const branchData = useMemo(
    () => branchPerformance.map((b) => ({ ...b, salesK: b.sales, targetK: b.target })),
    [],
  );

  const dateLabel = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div dir="rtl" className="pb-24 lg:pb-8">
      {/* Greeting + period switcher */}
      <div className="mb-5">
        <p className="text-xs text-text-muted">{dateLabel}</p>
        <h1 className="mt-1 text-xl font-extrabold tracking-tight text-text sm:text-2xl">
          نظرة عامة على الأداء
        </h1>
        <div className="mt-4 flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="الفترة">
          {periodLabels.map((p) => (
            <button
              key={p.key}
              role="tab"
              aria-selected={period === p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors duration-200 sm:text-sm ${
                period === p.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-secondary hover:bg-surface-subtle hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row: 2x2 on mobile, 4 across on desktop */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.id} item={k} />
        ))}
      </div>

      {/* Sales trend — full width */}
      <SectionCard
        title="اتجاه المبيعات والتحصيلات"
        className="mt-6"
        action={
          <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <TrendingUp className="h-3.5 w-3.5" />
            صاعد
          </span>
        }
      >
        <div className="h-56 w-full sm:h-64 lg:h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={palette.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradCollections" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.secondary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={palette.secondary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: palette.textMuted, fontSize: 11 }}
                axisLine={{ stroke: palette.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: palette.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={compactEGP}
              />
              <Tooltip content={<ChartTooltip formatter={fullEGP} />} cursor={{ stroke: palette.grid }} />
              <Area
                type="monotone"
                dataKey="sales"
                name="المبيعات"
                stroke={palette.primary}
                strokeWidth={2.5}
                fill="url(#gradSales)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: palette.card }}
              />
              <Area
                type="monotone"
                dataKey="collections"
                name="التحصيلات"
                stroke={palette.secondary}
                strokeWidth={2.5}
                fill="url(#gradCollections)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: palette.card }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Branches + product mix: side by side on desktop */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <SectionCard title="أداء الفروع (ألف ج.م)" className="lg:col-span-3">
          <div className="h-56 w-full sm:h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: palette.textMuted, fontSize: 11 }}
                  axisLine={{ stroke: palette.grid }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: palette.textMuted, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  content={<ChartTooltip formatter={(v) => `${v} ألف ج.م`} />}
                  cursor={{ fill: palette.grid, opacity: 0.4 }}
                />
                <Bar dataKey="salesK" name="مبيعات" fill={palette.primary} radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="targetK" name="المستهدف" fill={palette.grid} radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="توزيع المنتجات" className="lg:col-span-2">
          <div className="flex h-56 items-center gap-4 sm:h-64">
            <div className="h-full w-1/2" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mixData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="88%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {mixData.map((slice) => (
                      <Cell key={slice.name} fill={palette[slice.color]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-1/2 space-y-2.5">
              {mixData.map((slice) => (
                <li key={slice.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: palette[slice.color] }} />
                    {slice.name}
                  </span>
                  <span className="font-bold tabular-nums text-text">{slice.value}%</span>
                </li>
              ))}
            </ul>
          </div>
        </SectionCard>
      </div>

      {/* Top products / customers */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="الأكثر مبيعًا"
          action={<Boxes className="h-4 w-4 text-text-muted" aria-hidden="true" />}
        >
          <ul className="space-y-3">
            {topProducts.map((p, i) => (
              <li key={p.name} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-xs font-bold text-text-secondary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{p.name}</p>
                  <p className="text-[11px] text-text-muted">{p.units}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold tabular-nums text-text">{p.revenue}</p>
                  <DeltaArrow direction={p.trend} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="أكبر العملاء">
          <ul className="space-y-3">
            {topCustomers.map((c, i) => (
              <li key={c.name} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-xs font-bold text-secondary dark:bg-secondary/15">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">{c.name}</p>
                  <p className="text-[11px] text-text-muted">{c.units}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold tabular-nums text-text">{c.revenue}</p>
                  <DeltaArrow direction={c.trend} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Latest orders */}
      <SectionCard title="آخر الطلبيات" className="mt-6">
        <ul className="divide-y divide-border-subtle">
          {recentOrders.map((o) => {
            const statusChip =
              o.status === "confirmed"
                ? "bg-success/10 text-success"
                : o.status === "pending"
                  ? "bg-warning/10 text-warning"
                  : "bg-error/10 text-error";
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text">{o.customer}</p>
                  <p className="text-[11px] text-text-muted">
                    {o.id} · فرع {o.branch} · {o.time}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChip}`}>
                    {orderStatusLabels[o.status]}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-text">{o.amount}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

export default AnalyticsDashboard;
