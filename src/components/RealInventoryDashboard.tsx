/**
 * components/RealInventoryDashboard.tsx
 * مؤشر المخزون الحقيقي — نفس لغة تصميم التيمبلت (تمبلت #7)
 * لكن بداتا حية من AppContext (Supabase) بدل الموك داتا.
 *
 * شاشة قراءة فقط (مؤشرات + توزيع + نواقص) — الإدارة الفعلية للمخزون
 * تفضل في شاشة المخزون الكاملة (InventoryStockView).
 */
import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Layers,
  PackageSearch,
  PackageX,
  Search,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { chartPalette } from "../templates/theme";
import type { Product } from "../types";

type StockFilter = "all" | "out" | "low" | "ok";

const filterLabels: Record<StockFilter, string> = {
  all: "الكل",
  out: "نفد من الفرع",
  low: "حرج ≤ 5",
  ok: "متاح بوفرة",
};

/** الفروع التشغيلية (أكتوبر مخزن مركزي مش فرع — بيتعرض كـ KPI منفصل). */
const CANONICAL_BRANCHES = ["البحيرة", "الفيوم", "القاهرة", "المنيا", "ديمشلت", "منوف", "منيا القمح"];

/** رصيد الصنف بإجمالي الفروع (branchStocks لو متوفر، وإلا branchStockActual). */
function branchStockOf(p: Product): number {
  if (p.branchStocks && typeof p.branchStocks === "object") {
    let total = 0;
    let countedAny = false;
    for (const b of CANONICAL_BRANCHES) {
      const v = p.branchStocks[`فرع ${b}`] ?? p.branchStocks[b];
      if (typeof v === "number" && !Number.isNaN(v)) {
        total += v;
        countedAny = true;
      }
    }
    if (countedAny) return total;
  }
  return Number(p.branchStockActual) || 0;
}

export const RealInventoryDashboard: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { currentUser, getVisibleProducts, isOffline } = useApp();
  const palette = isDark ? chartPalette.dark : chartPalette.light;

  const [filter, setFilter] = useState<StockFilter>("all");
  const [query, setQuery] = useState("");

  const products = useMemo(() => getVisibleProducts(), [getVisibleProducts]);

  /* ---------------------- KPIs ---------------------- */
  const kpis = useMemo(() => {
    let out = 0;
    let low = 0;
    let branchCartons = 0;
    let warehouseCartons = 0;
    products.forEach((p) => {
      const b = branchStockOf(p);
      const w = Number(p.mainWarehouseActual) || 0;
      branchCartons += b;
      warehouseCartons += w;
      if (b <= 0) out += 1;
      else if (b <= 5) low += 1;
    });
    return { out, low, branchCartons, warehouseCartons, total: products.length };
  }, [products]);

  /* ---------------------- توزيع الكراتين على الفروع ---------------------- */
  const branchData = useMemo(() => {
    const byBranch = new Map<string, number>();
    products.forEach((p) => {
      if (p.branchStocks && typeof p.branchStocks === "object") {
        CANONICAL_BRANCHES.forEach((b) => {
          const v = p.branchStocks?.[`فرع ${b}`] ?? p.branchStocks?.[b];
          if (typeof v === "number" && v !== 0) {
            byBranch.set(b, (byBranch.get(b) || 0) + v);
          }
        });
      } else {
        const name = currentUser?.branchName?.replace(/^فرع\s*/, "") || "غير محدد";
        const b = Number(p.branchStockActual) || 0;
        if (b !== 0) byBranch.set(name, (byBranch.get(name) || 0) + b);
      }
    });
    return [...byBranch.entries()]
      .map(([name, cartons]) => ({ name, cartons }))
      .sort((a, b) => b.cartons - a.cartons)
      .slice(0, 7);
  }, [products, currentUser?.branchName]);

  /* ---------------------- الأقسام الأكثر توفرًا ---------------------- */
  const departments = useMemo(() => {
    const byDept = new Map<string, number>();
    products.forEach((p) => {
      const name = p.department || p.itemGroup || p.category || "أخرى";
      byDept.set(name, (byDept.get(name) || 0) + branchStockOf(p));
    });
    const list = [...byDept.entries()]
      .map(([name, cartons]) => ({ name, cartons: Math.max(0, Math.round(cartons)) }))
      .filter((d) => d.cartons > 0)
      .sort((a, b) => b.cartons - a.cartons)
      .slice(0, 6);
    const max = list[0]?.cartons || 1;
    return list.map((d) => ({ ...d, pct: Math.round((d.cartons / max) * 100) }));
  }, [products]);

  /* ---------------------- أشد الأصناف حرجًا ---------------------- */
  const lowestStock = useMemo(
    () =>
      products
        .map((p) => ({ p, b: branchStockOf(p) }))
        .filter((x) => x.b > 0 && x.b <= 10)
        .sort((a, b) => a.b - b.b)
        .slice(0, 6),
    [products]
  );

  /* ---------------------- نفد من الفرع + متاح للتوريد ---------------------- */
  const supplyable = useMemo(
    () =>
      products
        .map((p) => ({ p, b: branchStockOf(p), w: Number(p.mainWarehouseActual) || 0 }))
        .filter((x) => x.b <= 0 && x.w > 0)
        .sort((a, b) => b.w - a.w)
        .slice(0, 6),
    [products]
  );

  /* ---------------------- قائمة الأصناف (فلتر + بحث) ---------------------- */
  const statusOf = (b: number): "out" | "low" | "ok" => (b <= 0 ? "out" : b <= 5 ? "low" : "ok");

  const filtered = useMemo(() => {
    const q = query.trim();
    return products
      .map((p) => ({ p, b: branchStockOf(p), w: Number(p.mainWarehouseActual) || 0 }))
      .filter((x) => {
        const s = statusOf(x.b);
        if (filter === "out") return s === "out";
        if (filter === "low") return s === "low";
        if (filter === "ok") return s === "ok";
        return true;
      })
      .filter((x) => {
        if (!q) return true;
        return (
          x.p.name?.includes(q) ||
          String(x.p.code || "").includes(q) ||
          (x.p.unifiedCode || "").includes(q) ||
          (x.p.category || "").includes(q)
        );
      });
  }, [products, filter, query]);

  const statusChip: Record<"out" | "low" | "ok", string> = {
    out: "bg-error/10 text-error dark:bg-error/15",
    low: "bg-warning/10 text-warning dark:bg-warning/15",
    ok: "bg-success/10 text-success dark:bg-success/15",
  };
  const statusText: Record<"out" | "low" | "ok", string> = {
    out: "نفد",
    low: "حرج",
    ok: "متاح",
  };

  /* ---------------------- Tooltip موحّد ---------------------- */
  const tooltipStyle = {
    backgroundColor: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: "0.75rem",
    fontSize: "12px",
    fontFamily: "inherit",
    color: palette.textSecondary,
  };

  const kpiCards = [
    { label: "نفد من الفرع", value: String(kpis.out), tone: "text-error", icon: <PackageX className="h-4 w-4" /> },
    { label: "مخزون حرج ≤ 5", value: String(kpis.low), tone: "text-warning", icon: <TriangleAlert className="h-4 w-4" /> },
    { label: "كراتين الفروع", value: String(kpis.branchCartons), tone: "text-primary", icon: <Layers className="h-4 w-4" /> },
    { label: "مخزن أكتوبر", value: String(kpis.warehouseCartons), tone: "text-secondary", icon: <Warehouse className="h-4 w-4" /> },
  ];

  return (
    <div dir="rtl" className="pb-24 md:pb-8">
      {/* رأس الصفحة */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[color:var(--app-muted,theme(colors.slate.500))]">
            {currentUser?.name ? `أهلاً ${currentUser.name} — ` : ""}
            {kpis.total} صنف ظاهر
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            <PackageSearch className="h-6 w-6 text-[var(--app-accent,#2563EB)]" />
            مؤشر المخزون
          </h1>
        </div>
        {isOffline && (
          <span className="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
            أوفلاين — بيانات محلية
          </span>
        )}
      </div>

      {/* بطاقات KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">{c.label}</span>
              <span className={`shrink-0 ${c.tone}`}>{c.icon}</span>
            </div>
            <p className={`mt-1 text-sm font-bold tabular-nums sm:text-lg ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* توزيع الفروع + الأقسام */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">توزيع الكراتين على الفروع</h2>
          {branchData.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد بيانات فروع</p>
          ) : (
            <div dir="ltr" className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: palette.textSecondary }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => `${value} كرتونة`} />
                  <Bar dataKey="cartons" name="كراتين" fill={palette.primary} radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">الأقسام الأكثر توفرًا</h2>
          {departments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا يوجد مخزون متاح</p>
          ) : (
            <ul className="space-y-3">
              {departments.map((d, i) => (
                <li key={d.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--app-accent,#2563EB)]/10 text-[10px] font-bold text-[var(--app-accent,#2563EB)]">
                        {i + 1}
                      </span>
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">{d.cartons} كرتونة</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-l from-[var(--app-accent,#2563EB)] to-[var(--app-ok,#0D9488)]" style={{ width: `${d.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* نواقص + قابل للتوريد */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <TriangleAlert className="h-4 w-4 text-warning" />
            أشد الأصناف حرجًا (≤ 10 كرتونة)
          </h2>
          {lowestStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا يوجد مخزون حرج — كل الأصناف متاحة ✅</p>
          ) : (
            <ul className="space-y-3">
              {lowestStock.map(({ p, b }) => (
                <li key={p.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100">
                      <span className="ml-1.5 text-[10px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">{p.code}</span>
                      {p.name}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-warning">{b} كرتونة</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-warning" style={{ width: `${Math.min(100, Math.round((b / 10) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Warehouse className="h-4 w-4 text-secondary" />
            نفد من الفرع — متاح للتوريد من أكتوبر
          </h2>
          {supplyable.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">مفيش أصناف ناقصة قابلة للتوريد</p>
          ) : (
            <ul className="divide-y divide-border">
              {supplyable.map(({ p, w }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{p.name}</p>
                    <p className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                      {p.code} · {p.category || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success dark:bg-success/15">
                    {w} كرتونة متاحة
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* قائمة الأصناف */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">استعراض الأصناف ({filtered.length})</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--app-muted,theme(colors.slate.500))]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالاسم أو الكود…"
              className="w-44 rounded-full border border-border bg-transparent py-1.5 pl-3 pr-9 text-xs text-slate-900 outline-none transition placeholder:text-[color:var(--app-muted,theme(colors.slate.500))] focus:border-[var(--app-accent,#2563EB)]/50 dark:text-slate-100"
            />
          </div>
        </div>

        {/* فلاتر الحالة */}
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "out", "low", "ok"] as StockFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                filter === f
                  ? "bg-[var(--app-accent,#2563EB)] text-white shadow-sm"
                  : "border border-border bg-card text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-accent,#2563EB)]/40 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد أصناف مطابقة</p>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.slice(0, 30).map(({ p, b, w }) => {
              const s = statusOf(b);
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                      <span className="ml-1.5 text-[10px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">{p.code}</span>
                      {p.name}
                    </p>
                    <p className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                      {p.category || "—"} · مخزن أكتوبر: {w}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">{b} كرتونة</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip[s]}`}>{statusText[s]}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > 30 && (
          <p className="mt-2 text-center text-[11px] text-[color:var(--app-muted,theme(colors.slate.500))]">
            عرض أول 30 من {filtered.length} صنف — استخدم البحث لتضييق النتائج
          </p>
        )}
      </div>
    </div>
  );
};

export default RealInventoryDashboard;
