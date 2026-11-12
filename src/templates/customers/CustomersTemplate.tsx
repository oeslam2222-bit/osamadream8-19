/**
 * templates/customers/CustomersTemplate.tsx
 * Template #2 — Customers List + Detail.
 *
 * Mobile  : single column — search/filter on top, tappable cards,
 *           detail slides in as its own screen (native feel), back to return.
 * Desktop : two-pane — list column (with active highlight) beside a
 *           sticky detail panel. No navigation needed.
 *
 * Same tokens/identity as the analytics dashboard (template #1).
 */
import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  CalendarDays,
  ClipboardList,
  MapPin,
  MessageCircle,
  Phone,
  Route,
  Search,
  ShieldCheck,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { chartPalette, useTemplateTheme } from "../theme";
import {
  customerFilters,
  customerStatusLabels,
  mockCustomers,
  mockOrders,
  mockVisits,
  monthLabels,
  type CustomerStatus,
  type MockCustomer,
} from "./data";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const egp = (v: number) => `${v.toLocaleString("en-US")} ج.م`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(d);
};

const statusChip: Record<CustomerStatus, string> = {
  active: "bg-success/10 text-success dark:bg-success/15",
  churn_risk: "bg-error/10 text-error dark:bg-error/15",
  inactive: "bg-surface-subtle text-text-muted",
  new_customer: "bg-primary/10 text-primary dark:bg-primary/15",
};

const tierAvatar: Record<MockCustomer["tier"], string> = {
  "مميز": "bg-primary text-white",
  "راقي": "bg-violet text-white",
  "متوسط": "bg-secondary text-white",
  "عادي": "bg-surface-subtle text-text-secondary",
};

const orderChip: Record<MockOrder["status"], string> = {
  confirmed: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  returned: "bg-error/10 text-error",
};
const orderLabels: Record<MockOrder["status"], string> = {
  confirmed: "مؤكدة",
  pending: "معلقة",
  returned: "مرتجعة",
};

type MockOrder = (typeof mockOrders)[number];

/* ------------------------------------------------------------------ */
/* list pieces                                                         */
/* ------------------------------------------------------------------ */

function CustomerCard({
  customer,
  active,
  onClick,
}: {
  customer: MockCustomer;
  active: boolean;
  onClick: () => void;
}) {
  const risky = customer.overdueBalance > 0;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right shadow-sm transition-all duration-200 hover:shadow-md ${
        active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:border-primary/25"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black ${tierAvatar[customer.tier]}`}
        aria-hidden="true"
      >
        {customer.name.replace(/[^\u0621-\u064A]/g, " ").trim().split(/\s+/).slice(-1)[0]?.[0] ?? "ع"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-text">{customer.name}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip[customer.status]}`}>
            {customerStatusLabels[customer.status]}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-text-muted">
          <MapPin className="ml-1 inline h-3 w-3" />
          {customer.region} · فرع {customer.branchName}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span className="font-bold tabular-nums text-text">{egp(customer.totalSpent)}</span>
          {risky && (
            <span className="rounded-full bg-error/10 px-2 py-0.5 font-semibold tabular-nums text-error dark:bg-error/15">
              متأخرات {egp(customer.overdueBalance)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
        selected
          ? "bg-primary text-white shadow-sm"
          : "border border-border bg-surface text-text-secondary hover:border-primary/30 hover:text-text"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-[10px] tabular-nums ${
          selected ? "bg-white/20" : "bg-surface-subtle text-text-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* detail pieces                                                       */
/* ------------------------------------------------------------------ */

function DetailKpi({ label, value, tone }: { label: string; value: string; tone: "text" | "error" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] font-semibold text-text-secondary">{label}</p>
      <p className={`mt-1 text-base font-bold tabular-nums ${tone === "error" ? "text-error" : "text-text"}`}>
        {value}
      </p>
    </div>
  );
}

function MonthlySalesChart({ sales }: { sales: number[] }) {
  const { colorMode } = useTemplateTheme();
  const palette = chartPalette[colorMode];

  const data = useMemo(
    () => monthLabels.map((m, i) => ({ name: m, sales: sales[i] ?? 0 })),
    [sales],
  );

  return (
    <div className="h-40 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: palette.textMuted, fontSize: 10 }} axisLine={{ stroke: palette.grid }} tickLine={false} interval={1} />
          <YAxis tick={{ fill: palette.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={34} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg" dir="rtl">
                  <p className="font-bold text-text">{label}</p>
                  <p className="font-semibold tabular-nums text-text-secondary">{egp(Number(payload[0].value))}</p>
                </div>
              );
            }}
            cursor={{ fill: palette.grid, opacity: 0.4 }}
          />
          <Bar dataKey="sales" name="مبيعات" fill={palette.primary} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-xs text-text-secondary">
        <span className="text-text-muted">{icon}</span>
        {label}
      </span>
      <span className="truncate text-xs font-semibold text-text">{value}</span>
    </div>
  );
}

function CustomerDetail({
  customer,
  onBack,
}: {
  customer: MockCustomer;
  onBack: () => void;
}) {
  const orders = mockOrders.filter((o) => o.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date));
  const visits = mockVisits.filter((v) => v.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date));
  const whatsapp = `https://wa.me/20${customer.phone.replace(/^0/, "")}`;

  const visitChip: Record<MockVisit["outcome"], string> = {
    order: "bg-primary/10 text-primary",
    collection: "bg-success/10 text-success",
    follow_up: "bg-warning/10 text-warning",
  };
  const visitLabels: Record<MockVisit["outcome"], string> = {
    order: "طلبية",
    collection: "تحصيل",
    follow_up: "متابعة",
  };

  return (
    <div className="pb-24 lg:pb-4" dir="rtl">
      {/* Back (mobile) */}
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text lg:hidden"
      >
        <ArrowRight className="h-4 w-4" />
        رجوع للقائمة
      </button>

      {/* Header */}
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black ${tierAvatar[customer.tier]}`}
            aria-hidden="true"
          >
            {customer.name.replace(/[^\u0621-\u064A]/g, " ").trim().split(/\s+/).slice(-1)[0]?.[0] ?? "ع"}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-extrabold text-text">{customer.name}</h2>
            <p className="text-xs text-text-muted">
              {customer.code} · {customer.activityType}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChip[customer.status]}`}>
                {customerStatusLabels[customer.status]}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-violet/10 px-2.5 py-1 text-[11px] font-semibold text-violet">
                <BadgeCheck className="h-3.5 w-3.5" />
                {customer.tier}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <a
            href={`tel:${customer.phone}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover"
          >
            <Phone className="h-4 w-4" />
            اتصال
          </a>
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 py-2.5 text-sm font-bold text-success transition-colors hover:bg-success/15"
          >
            <MessageCircle className="h-4 w-4" />
            واتساب
          </a>
        </div>
      </section>

      {/* Mini KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <DetailKpi label="إجمالي المبيعات" value={egp(customer.totalSpent)} tone="text" />
        <DetailKpi label="المتأخرات" value={egp(customer.overdueBalance)} tone={customer.overdueBalance > 0 ? "error" : "text"} />
        <DetailKpi label="عدد الطلبيات" value={String(customer.totalOrdersCount)} tone="text" />
        <DetailKpi label="آخر طلبية" value={fmtDate(customer.lastOrderDate)} tone="text" />
      </div>

      {/* Monthly chart */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text">مبيعات ٢٠٢٦ شهرًا بشهر</h3>
          <span className="text-[11px] text-text-muted">آخر تحصيل {fmtDate(customer.lastCollectionDate)}</span>
        </div>
        <MonthlySalesChart sales={customer.monthlySales2026} />
      </section>

      {/* Meta */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-2 text-sm font-bold text-text">بيانات العميل</h3>
        <div className="divide-y divide-border-subtle">
          <MetaRow icon={<User className="h-3.5 w-3.5" />} label="المندوب" value={customer.repName} />
          <MetaRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="المشرف" value={customer.supervisorName} />
          <MetaRow icon={<MapPin className="h-3.5 w-3.5" />} label="المنطقة" value={customer.region} />
          <MetaRow icon={<Wallet className="h-3.5 w-3.5" />} label="الحد الائتماني" value={egp(customer.creditLimit)} />
          <MetaRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="طريقة الدفع" value={customer.paymentTerms} />
          <MetaRow icon={<ClipboardList className="h-3.5 w-3.5" />} label="ورقة الضمان" value={customer.guaranteeDocs} />
          <MetaRow icon={<Route className="h-3.5 w-3.5" />} label="آخر تحصيل" value={`${egp(customer.lastCollectionAmount)} · ${fmtDate(customer.lastCollectionDate)}`} />
        </div>
      </section>

      {/* Orders */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-bold text-text">آخر الطلبيات</h3>
        {orders.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">لا توجد طلبيات مسجلة</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-text">{o.items}</p>
                  <p className="text-[11px] text-text-muted">
                    {o.id} · {fmtDate(o.date)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${orderChip[o.status]}`}>
                    {orderLabels[o.status]}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-text">{egp(o.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Visits */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-bold text-text">آخر الزيارات</h3>
        {visits.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">لا توجد زيارات مسجلة</p>
        ) : (
          <ul className="space-y-2.5">
            {visits.map((v, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-subtle/60 p-2.5">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${visitChip[v.outcome]}`}>
                  {visitLabels[v.outcome]}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs text-text">{v.note}</p>
                <span className="shrink-0 text-[11px] text-text-muted">{fmtDate(v.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
type MockVisit = (typeof mockVisits)[number];

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export function CustomersTemplate() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | CustomerStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    return mockCustomers.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.name.includes(q) ||
        (c.storeName ?? "").includes(q) ||
        c.code.includes(q) ||
        c.phone.includes(q) ||
        c.region.includes(q)
      );
    });
  }, [query, filter]);

  const selected = filtered.find((c) => c.id === selectedId) ?? mockCustomers.find((c) => c.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: mockCustomers.length };
    for (const customer of mockCustomers) c[customer.status] = (c[customer.status] ?? 0) + 1;
    return c;
  }, []);

  return (
    <div dir="rtl" className="lg:grid lg:grid-cols-5 lg:gap-6">
      {/* List column */}
      <div className={`lg:col-span-2 ${selected ? "hidden lg:block" : ""}`}>
        <div className="pb-24 lg:pb-4">
          <div className="mb-5">
            <p className="text-xs text-text-muted">قاعدة العملاء</p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text sm:text-2xl">
              <Users className="h-6 w-6 text-primary" />
              العملاء
            </h1>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم، الكود، الهاتف أو المنطقة…"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-4 pr-10 text-sm text-text shadow-sm placeholder:text-text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Filter chips */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {customerFilters.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                count={counts[f.key] ?? 0}
                selected={filter === f.key}
                onClick={() => setFilter(f.key)}
              />
            ))}
          </div>

          {/* Cards */}
          <div className="mt-4 space-y-2.5">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 text-center">
                <Boxes className="h-8 w-8 text-text-muted" />
                <p className="text-sm text-text-secondary">مفيش نتائج للبحث "<span className="font-bold">{query}</span>"</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="rounded-lg bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15"
                >
                  مسح البحث والفلاتر
                </button>
              </div>
            ) : (
              filtered.map((c) => (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  active={c.id === selectedId}
                  onClick={() => setSelectedId(c.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detail column */}
      <div className={`lg:col-span-3 ${selected ? "" : "hidden lg:block"}`}>
        <div className="lg:sticky lg:top-20">
          {selected ? (
            <CustomerDetail customer={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-text">اختار عميل</h2>
                <p className="mt-1 max-w-xs text-sm text-text-secondary">
                  من القائمة عشان تشوف ملفه كامل: المبيعات، المتأخرات، الطلبيات والزيارات.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomersTemplate;
