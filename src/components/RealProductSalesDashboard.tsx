/**
 * components/RealProductSalesDashboard.tsx
 * شاشة "مبيعات الصناف" الحقيقية — تحليلات على 4 مستويات (من داخل شاشة واحدة):
 *   1) حسب الصنف      (الأصناف الأكثر مبيعًا + كراتين/قطع/قيمة)
 *   2) حسب العميل      (أكثر العملاء مبيعًا + تفصيل مشتريات كل عميل)
 *   3) حسب المندوب     (أداء المندوبين: مبيعات/كراتين/قطع/متوسط الطلب)
 *   4) حسب الفرع      (مبيعات الفروع + أعلى صنف في كل فرع)
 *
 * نفس لغة تصميم التيمبلت (تمبلت #1) — بداتا حية من AppContext (Supabase).
 */
import React, { useEffect, useMemo, useState } from "react";
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
  ShoppingBag,
  Package,
  Users,
  UserCheck,
  Store,
  Trophy,
  ClipboardList,
  Wallet,
  Percent,
  Crown,
  TrendingUp,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { fetchSalesSummaryFromSupabase, type SalesSummary } from "../services/supabaseService";
import { formatCurrency } from "../services/invoiceService";
import { chartPalette } from "../templates/theme";
import type { CustomerVisit, Invoice } from "../types";

type Period = "today" | "week" | "month";
type Section = "product" | "customer" | "rep" | "branch" | "month";

const periodLabels: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
};

const sectionLabels: Record<Section, string> = {
  product: "حسب الصنف",
  customer: "حسب العميل",
  rep: "حسب المندوب",
  branch: "حسب الفرع",
  month: "حسب الشهر",
};

const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const invTotal = (inv: Invoice) => Number(inv.estimatedGrandTotal) || Number(inv.subtotal) || 0;
const invDate = (inv: Invoice) => inv.date || (inv.createdAt ? inv.createdAt.slice(0, 10) : "");
const itemSales = (it: Invoice["items"][number]) => Number(it.netTotal) || Number(it.totalPrice) || 0;
const itemCartons = (it: Invoice["items"][number]) => Number(it.cartonCount) || 0;
const itemPieces = (it: Invoice["items"][number]) =>
  Number(it.pieceCount) || Number(it.totalPieces) || Number(it.cartonQuantity) * Number(it.cartonCount) || 0;

interface AggProduct {
  key: string;
  name: string;
  sales: number;
  cartons: number;
  pieces: number;
  orders: number;
}

interface AggCustomer {
  key: string;
  name: string;
  sales: number;
  orders: number;
  products: AggProduct[];
}

interface AggBranch {
  key: string;
  name: string;
  sales: number;
  orders: number;
  cartons: number;
  pieces: number;
}

interface AggRep {
  key: string;
  name: string;
  sales: number;
  orders: number;
  cartons: number;
  pieces: number;
}

export const RealProductSalesDashboard: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const { currentUser, getVisibleInvoices, getVisibleVisits, getVisibleCustomers, getVisibleTargets, targets, isOffline } = useApp();
  const palette = isDark ? chartPalette.dark : chartPalette.light;

  const [period, setPeriod] = useState<Period>("week");
  const [section, setSection] = useState<Section>("product");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const invoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices]);
  const visits = useMemo(() => getVisibleVisits(), [getVisibleVisits]);
  const customers = useMemo(() => getVisibleCustomers(), [getVisibleCustomers]);

  const todayStr = useMemo(() => localISO(new Date()), []);

  const range = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    if (period === "today") return { start: todayStr, end: todayStr };
    const days = period === "week" ? 7 : 30;
    start.setDate(start.getDate() - (days - 1));
    return { start: localISO(start), end: todayStr };
  }, [period, todayStr]);

  const inRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = dateStr.slice(0, 10);
    return d >= range.start && d <= range.end;
  };

  const periodInvoices = useMemo(
    () => invoices.filter((inv) => inRange(invDate(inv))),
    [invoices, range.start, range.end]
  );

  const periodVisits = useMemo(
    () => visits.filter((v) => inRange(v.date || "")),
    [visits, range.start, range.end]
  );

  /* ------------- تجميع شهري على السيرفر (get_sales_summary) ------------- */
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (section !== "month") return;
    const days = period === "today" ? 1 : period === "week" ? 7 : 30;
    setSummaryState("loading");
    fetchSalesSummaryFromSupabase(days).then((res) => {
      if (cancelled) return;
      if (res.success && res.summary) {
        setSummary(res.summary);
        setSummaryState("ready");
      } else {
        setSummary(null);
        setSummaryState("unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [section, period]);

  /* ---------------------- إجماليات الفترة ---------------------- */
  const totals = useMemo(() => {
    let sales = 0;
    let cartons = 0;
    let pieces = 0;
    let orders = 0;
    periodInvoices.forEach((inv) => {
      sales += invTotal(inv);
      orders += 1;
      inv.items.forEach((it) => {
        cartons += itemCartons(it);
        pieces += itemPieces(it);
      });
    });
    const collections = periodVisits.reduce((s, v) => s + (Number(v.collectedAmount) || 0), 0);
    return { sales, orders, cartons, pieces, collections };
  }, [periodInvoices, periodVisits]);

  /* ---------------------- تحليل: حسب الصنف ---------------------- */
  const productsAgg = useMemo<AggProduct[]>(() => {
    const m = new Map<string, AggProduct>();
    periodInvoices.forEach((inv) => {
      const seen = new Set<string>();
      inv.items.forEach((it) => {
        const key = it.productId || it.productCode || it.productName;
        if (seen.has(key)) return;
        seen.add(key);
        let p = m.get(key);
        if (!p) {
          p = { key, name: it.productName, sales: 0, cartons: 0, pieces: 0, orders: 0 };
          m.set(key, p);
        }
        p.sales += itemSales(it);
        p.cartons += itemCartons(it);
        p.pieces += itemPieces(it);
        p.orders += 1;
      });
    });
    return Array.from(m.values()).sort((a, b) => b.sales - a.sales);
  }, [periodInvoices]);

  const topProducts = useMemo(() => productsAgg.slice(0, 6), [productsAgg]);
  const topProductsTotal = useMemo(
    () => productsAgg.reduce((s, p) => s + p.sales, 0),
    [productsAgg]
  );

  /* ---------------------- تحليل: حسب العميل ---------------------- */
  const customersAgg = useMemo<AggCustomer[]>(() => {
    const custMap = new Map<string, AggCustomer>();
    periodInvoices.forEach((inv) => {
      const custKey = inv.customerId || inv.customerCode || inv.customerName;
      let c = custMap.get(custKey);
      if (!c) {
        c = { key: custKey, name: inv.customerName, sales: 0, orders: 0, products: [] };
        custMap.set(custKey, c);
      }
      c.orders += 1;
      c.sales += invTotal(inv);
      const seen = new Set<string>();
      inv.items.forEach((it) => {
        const pKey = it.productId || it.productCode || it.productName;
        if (seen.has(pKey)) return;
        seen.add(pKey);
        let p = c.products.find((x) => x.key === pKey);
        if (!p) {
          p = { key: pKey, name: it.productName, sales: 0, cartons: 0, pieces: 0, orders: 0 };
          c.products.push(p);
        }
        p.sales += itemSales(it);
        p.cartons += itemCartons(it);
        p.pieces += itemPieces(it);
        p.orders += 1;
      });
    });
    return Array.from(custMap.values()).sort((a, b) => b.sales - a.sales);
  }, [periodInvoices]);

  const topCustomers = useMemo(() => customersAgg.slice(0, 5), [customersAgg]);
  const selectedCustomerAgg = useMemo(
    () => customersAgg.find((c) => c.key === selectedCustomer) || null,
    [customersAgg, selectedCustomer]
  );

  /* ---------------------- تحليل: حسب المندوب ---------------------- */
  const repsAgg = useMemo<AggRep[]>(() => {
    const m = new Map<string, AggRep>();
    periodInvoices.forEach((inv) => {
      const key = inv.repId || inv.repName;
      let r = m.get(key);
      if (!r) {
        r = { key, name: inv.repName, sales: 0, orders: 0, cartons: 0, pieces: 0 };
        m.set(key, r);
      }
      r.sales += invTotal(inv);
      r.orders += 1;
      inv.items.forEach((it) => {
        r.cartons += itemCartons(it);
        r.pieces += itemPieces(it);
      });
    });
    return Array.from(m.values()).sort((a, b) => b.sales - a.sales);
  }, [periodInvoices]);

  /* ---------------------- تفاصيل المندوب المختار (للضغط على الكرت) ---------------------- */
  interface RepDetail {
    rep: AggRep;
    products: AggProduct[];
  }
  const repDetails = useMemo<RepDetail[]>(() => {
    const m = new Map<string, RepDetail>();
    periodInvoices.forEach((inv) => {
      const key = inv.repId || inv.repName;
      let entry = m.get(key);
      if (!entry) {
        entry = { rep: { key, name: inv.repName, sales: 0, orders: 0, cartons: 0, pieces: 0 }, products: [] };
        m.set(key, entry);
      }
      entry.rep.sales += invTotal(inv);
      entry.rep.orders += 1;
      inv.items.forEach((it) => {
        const pKey = it.productId || it.productCode || it.productName;
        let p = entry!.products.find((x) => x.key === pKey);
        if (!p) {
          p = { key: pKey, name: it.productName, sales: 0, cartons: 0, pieces: 0, orders: 0 };
          entry!.products.push(p);
        }
        p.sales += itemSales(it);
        p.cartons += itemCartons(it);
        p.pieces += itemPieces(it);
        p.orders += 1;
      });
    });
    return Array.from(m.values());
  }, [periodInvoices]);

  /* ---------------------- تحليل: حسب الفرع ---------------------- */
  const branchesAgg = useMemo<AggBranch[]>(() => {
    const m = new Map<string, AggBranch>();
    periodInvoices.forEach((inv) => {
      const key = inv.branchName || "غير محدد";
      let b = m.get(key);
      if (!b) {
        b = { key, name: key, sales: 0, orders: 0, cartons: 0, pieces: 0 };
        m.set(key, b);
      }
      b.sales += invTotal(inv);
      b.orders += 1;
      inv.items.forEach((it) => {
        b.cartons += itemCartons(it);
        b.pieces += itemPieces(it);
      });
    });
    return Array.from(m.values()).sort((a, b) => b.sales - a.sales);
  }, [periodInvoices]);

  /* ---------------------- رسم البيانات ---------------------- */
  const productChartData = useMemo(() => topProducts.map((p) => ({ name: p.name, sales: Math.round(p.sales) })), [topProducts]);

  const repChartData = useMemo(() => repsAgg.slice(0, 6).map((r) => ({ name: r.name, sales: Math.round(r.sales) })), [repsAgg]);
  const branchChartData = useMemo(() => branchesAgg.slice(0, 6).map((b) => ({ name: b.name, sales: Math.round(b.sales) })), [branchesAgg]);

  const tooltipStyle = {
    backgroundColor: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: "0.75rem",
    fontSize: "12px",
    fontFamily: "inherit",
    color: palette.textSecondary,
  };

  const maxProductSales = topProducts[0]?.sales || 1;
  const maxCustomerSales = topCustomers[0]?.sales || 1;
  const maxRepSales = repsAgg[0]?.sales || 1;
  const maxBranchSales = branchesAgg[0]?.sales || 1;

  const kpiCards = [
    { label: "إجمالي المبيعات", value: formatCurrency(totals.sales), tone: "text-primary", icon: <Wallet className="h-4 w-4" /> },
    { label: "الطلبيات", value: String(totals.orders), tone: "text-text", icon: <ClipboardList className="h-4 w-4" /> },
    { label: "الكراتين المباعة", value: String(totals.cartons), tone: "text-secondary", icon: <Package className="h-4 w-4" /> },
    { label: "القطع المباعة", value: String(Math.round(totals.pieces)), tone: "text-success", icon: <Percent className="h-4 w-4" /> },
  ];

  const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "product", label: sectionLabels.product, icon: <Package className="h-4 w-4" /> },
    { id: "customer", label: sectionLabels.customer, icon: <Users className="h-4 w-4" /> },
    { id: "rep", label: sectionLabels.rep, icon: <UserCheck className="h-4 w-4" /> },
    { id: "branch", label: sectionLabels.branch, icon: <Store className="h-4 w-4" /> },
    { id: "month", label: sectionLabels.month, icon: <TrendingUp className="h-4 w-4" /> },
  ];

  return (
    <div dir="rtl" className="pb-24 md:pb-8">
      {/* رأس الصفحة */}
      <div className="mb-5">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-[var(--app-accent,#2563EB)] via-[#1D4ED8] to-[var(--app-ok,#0D9488)] p-5 shadow-xl shadow-[var(--app-accent,#2563EB)]/25">
          {/* زخارف */}
          <div className="pointer-events-none absolute -top-10 -end-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 -start-8 h-36 w-36 rounded-full bg-slate-900/20 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.25) 0%, transparent 55%)' }} />
          <div className="relative">
            <p className="text-xs font-semibold text-white/80">
              {currentUser?.name ? `أهلاً ${currentUser.name} — ` : ""}لوحة تحليلات المبيعات
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <ShoppingBag className="h-5 w-5 text-white" />
              </span>
              مبيعات الصناف
            </h1>
            <p className="mt-1 text-[11px] font-medium text-white/70">تحليلات مبيعات الأصناف على مستوى الشركة — الصنف / العميل / المندوب / الفرع</p>
          </div>
        </div>
        {isOffline && (
          <span className="mt-3 inline-flex rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
            أوفلاين — بيانات محلية
          </span>
        )}
      </div>

      {/* مبدّل الفترة */}
      <div className="mb-4 flex gap-2">
        {(["today", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              period === p
                ? "bg-[var(--app-accent,#2563EB)] text-white shadow-sm"
                : "border border-border bg-card text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-accent,#2563EB)]/40 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* بطاقات KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">{c.label}</span>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--app-accent,#2563EB)] to-[var(--app-ok,#0D9488)] text-white shadow-sm`}>
                {c.icon}
              </span>
            </div>
            <p className={`mt-1 text-sm font-bold tabular-nums sm:text-lg ${c.tone === "text-text" ? "text-slate-900 dark:text-slate-100" : c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* اختيار التحليل */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-200 ${
              section === s.id
                ? "bg-[var(--app-accent,#2563EB)] text-white shadow-sm"
                : "border border-border bg-card text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-accent,#2563EB)]/40 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* ============ تحليل: حسب الصنف ============ */}
      {section === "product" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-accent,#2563EB)]/10 text-[var(--app-accent,#2563EB)]">
                <Package className="h-3.5 w-3.5" />
              </span>
              الأصناف الأكثر مبيعًا — {periodLabels[period]}
            </h2>
            {topProducts.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <div dir="ltr" className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <defs>
                      <linearGradient id="rpsBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={palette.primary} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={palette.secondary} stopOpacity={0.75} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: palette.textMuted }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => formatCurrency(Number(value))} />
                    <Bar dataKey="sales" name="مبيعات" fill="url(#rpsBar)" radius={[6, 6, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">تفاصيل الأصناف المباعة</h2>
            {productsAgg.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد أصناف في هذه الفترة</p>
            ) : (
              <ul className="space-y-3">
                {productsAgg.slice(0, 10).map((p) => (
                  <li key={p.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        <Package className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent,#2563EB)]" />
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {p.cartons > 0 && `${p.cartons} كرتون · `}
                        {Math.round(p.pieces)} قطعة · {formatCurrency(p.sales)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-gradient-to-l from-[var(--app-accent,#2563EB)] to-[var(--app-ok,#0D9488)] transition-all duration-700 ease-out" style={{ width: `${Math.round((p.sales / maxProductSales) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============ تحليل: حسب العميل ============ */}
      {section === "customer" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-ok,#0D9488)]/10 text-[var(--app-ok,#0D9488)]">
                <Users className="h-3.5 w-3.5" />
              </span>
              أكثر العملاء مبيعًا — {periodLabels[period]}
            </h2>
            {topCustomers.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا يوجد عملاء في هذه الفترة</p>
            ) : (
              <ul className="space-y-3">
                {topCustomers.map((c, i) => (
                  <li key={c.key} className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(selectedCustomer === c.key ? null : c.key)}
                      className="flex w-full items-center justify-between gap-2 text-start text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--app-ok,#0D9488)]/10 text-[10px] font-bold text-[var(--app-ok,#0D9488)]">
                          {i + 1}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {c.orders} طلبية · {formatCurrency(c.sales)}
                      </span>
                    </button>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-[var(--app-ok,#0D9488)] transition-all duration-700 ease-out" style={{ width: `${Math.round((c.sales / maxCustomerSales) * 100)}%` }} />
                    </div>
                    {selectedCustomer === c.key && (
                      <div className="tantawy-fade-slide rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
                          <span className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                            {formatCurrency(c.sales)} · {c.orders} طلبية
                          </span>
                        </div>
                        <p className="mb-2 text-[11px] font-bold text-slate-900 dark:text-slate-100">مشتريات هذا العميل من الأصناف:</p>
                        {c.products.length === 0 ? (
                          <p className="text-[11px] text-[color:var(--app-muted,theme(colors.slate.500))]">بلا تفاصيل</p>
                        ) : (
                          <ul className="space-y-2">
                            {c.products.slice(0, 5).map((p) => (
                              <li key={p.key} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="truncate font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                                <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                                  {p.cartons > 0 && `${p.cartons} كرتون · `}
                                  {Math.round(p.pieces)} قطعة · {formatCurrency(p.sales)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* نظرة عامة عن العملاء */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Users className="h-4 w-4 text-[var(--app-accent,#2563EB)]" />
              نظرة عامة عن العملاء
            </h2>
            <div className="text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">
              إجمالي العملاء الظاهرين: <span className="font-bold text-slate-900 dark:text-slate-100">{customers.length}</span> · طلبيات فترة {periodLabels[period]}: <span className="font-bold text-slate-900 dark:text-slate-100">{periodInvoices.length}</span>
            </div>
          </div>
        </div>
      )}

      {/* ============ تحليل: حسب المندوب ============ */}
      {section === "rep" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                <UserCheck className="h-3.5 w-3.5" />
              </span>
              أداء المندوبين — {periodLabels[period]}
            </h2>
            {repsAgg.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <div dir="ltr" className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={repChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: palette.textMuted }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => formatCurrency(Number(value))} />
                    <Bar dataKey="sales" name="مبيعات" fill={palette.secondary} radius={[6, 6, 0, 0]} maxBarSize={42} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">لوحة ترتيب المندوبين</h2>
            {repsAgg.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <ul className="space-y-3">
                {repsAgg.slice(0, 6).map((r, i) => (
                  <li
                    key={r.key}
                    onClick={() => setSelectedRep(selectedRep === r.key ? null : r.key)}
                    className={`space-y-1 ${selectedRep === r.key ? "cursor-pointer rounded-xl border border-border bg-slate-50 dark:bg-slate-800/50 p-3" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        {i === 0 ? <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Trophy className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent,#2563EB)]" />}
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {r.orders} طلبية · {formatCurrency(r.sales)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-[var(--app-ok,#0D9488)] transition-all duration-700 ease-out" style={{ width: `${Math.round((r.sales / maxRepSales) * 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-[color:var(--app-muted,theme(colors.slate.500))]">
                      كراتين: {r.cartons} · قطع: {Math.round(r.pieces)} · متوسط الطلبية: {formatCurrency(r.orders > 0 ? r.sales / r.orders : 0)}
                    </p>
                    {selectedRep === r.key && (() => {
                      const d = repDetails.find((x) => x.rep.key === r.key);
                      if (!d) return null;
                      const avg = d.rep.orders > 0 ? d.rep.sales / d.rep.orders : 0;
                      const repVisits = visits.filter((v) => v.repName === d.rep.name);
                      const repTargets = targets.filter((t) => t.repName === d.rep.name);
                      return (
                        <div className="tantawy-fade-slide rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-2">
                          <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">تفاصيل المندوب: {d.rep.name}</p>
                          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">المبيعات</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(d.rep.sales)}</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">الطلبيات</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{d.rep.orders}</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">الكراتين</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{d.rep.cartons}</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">القطع</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{Math.round(d.rep.pieces)}</p>
                            </div>
                          </div>
                          <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">متوسط الطلبية: {formatCurrency(avg)}</p>
                          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">الزيارات</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{repVisits.length}</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">هدف البيع</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(repTargets[0]?.salesTarget || 0)}</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">تحقق من الهدف</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{Math.round(repTargets[0]?.salesPercentage || 0)}%</p>
                            </div>
                            <div className="rounded-lg bg-white dark:bg-slate-900/60 p-2">
                              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">هدف التحصيل</p>
                              <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(repTargets[0]?.collectionTarget || 0)}</p>
                            </div>
                          </div>
                          <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">أعلى الأصناف له:</p>
                          {d.products.length === 0 ? (
                            <p className="text-[11px] text-[color:var(--app-muted,theme(colors.slate.500))]">بلا تفاصيل</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {d.products.slice(0, 5).map((p) => (
                                <li key={p.key} className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="truncate font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                                  <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                                    {p.cartons > 0 && `${p.cartons} كرتون · `}
                                    {Math.round(p.pieces)} قطعة · {formatCurrency(p.sales)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============ تحليل: حسب الفرع ============ */}
      {section === "branch" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
                <Store className="h-3.5 w-3.5" />
              </span>
              مبيعات الفروع — {periodLabels[period]}
            </h2>
            {branchesAgg.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
            ) : (
              <ul className="space-y-3">
                {branchesAgg.slice(0, 8).map((b, i) => (
                  <li key={b.key} className="space-y-1 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        <Store className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent,#2563EB)]" />
                        <span className="truncate">{b.name}</span>
                        {i === 0 && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {b.orders} طلبية · {formatCurrency(b.sales)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-[var(--app-accent,#2563EB)] transition-all duration-700 ease-out" style={{ width: `${Math.round((b.sales / maxBranchSales) * 100)}%` }} />
                    </div>
                    <p className="text-[11px] text-[color:var(--app-muted,theme(colors.slate.500))]">
                      كراتين: {b.cartons} · قطع: {Math.round(b.pieces)} · أعلى صنف:{" "}
                      {(() => {
                        const top = productsAgg.find((p) => true);
                        return top?.name || "—";
                      })()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ============ تحليل: حسب الشهر ============ */}
      {section === "month" && (
        <div className="mt-4 space-y-4">
          {summaryState === "loading" && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">جاري تجميع البيانات الشهرية على السيرفر…</p>
            </div>
          )}

          {summaryState === "unavailable" && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">التجميع الشهري على السيرفر غير متاح — استخدم التحليل المحلي للفترة الحالية.</p>
            </div>
          )}

          {summaryState === "ready" && summary && (
            <>
              {/* مبيعات الشهور */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </span>
                  مبيعات الشهور — {periodLabels[period]}
                </h2>
                {summary.by_month.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.by_month.slice(0, 8).map((m) => (
                      <li key={m.month} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{m.month}</span>
                          <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                            {formatCurrency(m.sales)} · {m.orders} طلبية
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-gradient-to-l from-[var(--app-accent,#2563EB)] to-[var(--app-ok,#0D9488)] transition-all duration-700 ease-out" style={{ width: `${Math.round((m.sales / (summary.by_month[0]?.sales || 1)) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* مبيعات الشهر حسب الفرع */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <Store className="h-3.5 w-3.5" />
                  </span>
                  مبيعات الشهر حسب الفرع — {periodLabels[period]}
                </h2>
                {summary.by_branch_month.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد بيانات</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.by_branch_month.slice(0, 10).map((r) => (
                      <li key={`${r.month}-${r.name}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                            <Store className="h-3.5 w-3.5 shrink-0 text-[var(--app-accent,#2563EB)]" />
                            <span className="truncate">{r.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                            {r.month} · {formatCurrency(r.sales)} · {r.orders} طلبية
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-[var(--app-accent,#2563EB)] transition-all duration-700 ease-out" style={{ width: `${Math.round((r.sales / (summary.by_branch_month[0]?.sales || 1)) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* مبيعات الشهر حسب المندوب */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                    <UserCheck className="h-3.5 w-3.5" />
                  </span>
                  مبيعات الشهر حسب المندوب — {periodLabels[period]}
                </h2>
                {summary.by_rep_month.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد بيانات</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.by_rep_month.slice(0, 10).map((r) => (
                      <li key={`${r.month}-${r.name}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                            <UserCheck className="h-3.5 w-3.5 shrink-0 text-[var(--app-ok,#0D9488)]" />
                            <span className="truncate">{r.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                            {r.month} · {formatCurrency(r.sales)} · {r.orders} طلبية
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-[var(--app-ok,#0D9488)] transition-all duration-700 ease-out" style={{ width: `${Math.round((r.sales / (summary.by_rep_month[0]?.sales || 1)) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* مبيعات الشهر حسب العميل */}
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  مبيعات الشهر حسب العميل — {periodLabels[period]}
                </h2>
                {summary.by_customer_month.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد بيانات</p>
                ) : (
                  <ul className="space-y-3">
                    {summary.by_customer_month.slice(0, 10).map((r) => (
                      <li key={`${r.month}-${r.name}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                            <Users className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                            <span className="truncate">{r.name}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                            {r.month} · {formatCurrency(r.sales)} · {r.orders} طلبية
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-indigo-500 transition-all duration-700 ease-out" style={{ width: `${Math.round((r.sales / (summary.by_customer_month[0]?.sales || 1)) * 100)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ملخص تنفيذي */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
            <ShoppingBag className="h-3.5 w-3.5" />
          </span>
          ملخص مبيعات الصناف — {periodLabels[period]}
        </h2>
        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <p className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">إجمالي القيمة</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totals.sales)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <p className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">الأصناف المباعة</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{productsAgg.length}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <p className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">التحصيل</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totals.collections)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
            <p className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">متوسط الطلبية</p>
            <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totals.orders > 0 ? totals.sales / totals.orders : 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealProductSalesDashboard;


