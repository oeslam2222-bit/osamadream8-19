/**
 * components/RealAnalyticsDashboard.tsx
 * شاشة التحليلات الحقيقية — نفس لغة تصميم التيمبلت (تمبلت #1)
 * لكن بداتا حية من AppContext (Supabase) بدل الموك داتا.
 *
 * تبويب مخصص للإدارة العليا (admin / developer / branch_manager / supervisor).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarDays,
  Clapperboard,
  ClipboardList,
  FileText,
  Package,
  RotateCcw,
  Users,
  Wallet,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { formatCurrency } from "../services/invoiceService";
import { fetchSalesSummaryFromSupabase, type SalesSummary } from "../services/supabaseService";
import { normalizeArabicText } from "../services/arabicMatchingService";
import { useEncouragement } from "./EncouragementSystem";
import { chartPalette } from "../templates/theme";
import type { CustomerVisit, Invoice, InvoiceItem } from "../types";

type Period = "today" | "week" | "month";

const periodLabels: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
};

/** تطبيع تاريخ الفاتورة إلى YYYY-MM-DD (بتاريخ محلي مش UTC). */
const localISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** تصنيف حالة الطلبية العربية إلى مجموعة العرض. */
function statusGroup(status: string): "confirmed" | "pending" | "returned" | "cancelled" {
  if (status.includes("مرتجع")) return "returned";
  if (status.includes("معلقة")) return "pending";
  if (status.includes("ملغاة") || status.includes("مرفوضة")) return "cancelled";
  return "confirmed";
}

const statusChip: Record<string, string> = {
  confirmed: "bg-success/10 text-success dark:bg-success/15",
  pending: "bg-warning/10 text-warning dark:bg-warning/15",
  returned: "bg-error/10 text-error dark:bg-error/15",
  cancelled: "bg-text-muted/10 text-text-muted dark:bg-text-muted/15",
};

const statusLabel: Record<string, string> = {
  confirmed: "مؤكدة",
  pending: "معلقة",
  returned: "مرتجعة",
  cancelled: "ملغاة",
};

const invTotal = (inv: Invoice) =>
  Number(inv.estimatedGrandTotal) || Number(inv.subtotal) || 0;

const invDate = (inv: Invoice) => inv.date || (inv.createdAt ? inv.createdAt.slice(0, 10) : "");

export const RealAnalyticsDashboard: React.FC<{
  isDark: boolean;
  /** فتح بروفايل عميل من داخل الشاشة (مربوط بـ SmartProfilePage من App). */
  onOpenCustomerProfile?: (customerRef: string) => void;
}> = ({ isDark, onOpenCustomerProfile }) => {
  const { currentUser, getVisibleInvoices, getVisibleCustomers, getVisibleVisits, isOffline } = useApp();
  const palette = isDark ? chartPalette.dark : chartPalette.light;

  const [period, setPeriod] = useState<Period>("week");
  /* فصل القطاع المنزلي عن الكهربي + فلتر المنطقة للزيارات */
  const [sectorFilter, setSectorFilter] = useState<"all" | "home" | "electrical">("all");
  const [visitRegion, setVisitRegion] = useState<string>("all");
  const { showEncouragement } = useEncouragement();
  /* مبيعات باليوم — اختيار اليوم */
  const [selectedDay, setSelectedDay] = useState<string>(() => localISO(new Date()));
  const [dayBranch, setDayBranch] = useState<string>("all");
  const [dayRep, setDayRep] = useState<string>("all");
  const [dayCustomer, setDayCustomer] = useState<string>("all");

  /* ------------- 🚀 تجميع على السيرفر (RPC) مع fallback محلي ------------- */
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [summaryState, setSummaryState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
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
  }, [period]);

  const todayStr = useMemo(() => localISO(new Date()), []);

  const invoices = useMemo(() => getVisibleInvoices(), [getVisibleInvoices]);
  const visits = useMemo(() => getVisibleVisits(), [getVisibleVisits]);
  const customerCount = useMemo(() => getVisibleCustomers().length, [getVisibleCustomers]);

  /* ---------------------- نطاق الفترة ---------------------- */
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

  /* ---------------------- خريطة العملاء (قطاع + منطقة + خط السير) ---------------------- */
  const customerRefMap = useMemo(() => {
    const map = new Map<
      string,
      { sector: string; region: string; route: string; name: string }
    >();
    try {
      getVisibleCustomers().forEach((c) => {
        const entry = {
          sector: (c.sector as string) || "all",
          region: c.region || c.district || c.governorate || "غير محدد",
          route: c.route || "",
          name: c.name || "",
        };
        if (c.id) map.set(`id:${c.id}`, entry);
        const code = (c.code || "").trim().toLowerCase();
        if (code) map.set(`code:${code}`, entry);
        const key = normalizeArabicText(c.name || "");
        if (key) map.set(`name:${key}`, entry);
      });
    } catch {
      /* تجاهل — التحليلات الأساسية لا تعتمد على العملاء */
    }
    return map;
  }, [getVisibleCustomers]);

  const refOf = (id?: string, code?: string, name?: string) =>
    (id && customerRefMap.get(`id:${id}`)) ||
    (code && customerRefMap.get(`code:${String(code).trim().toLowerCase()}`)) ||
    (name && customerRefMap.get(`name:${normalizeArabicText(name)}`));

  const sectorMatches = (sector?: string): boolean => {
    if (sectorFilter === "all") return true;
    if (!sector || sector === "all" || sector === "both") return true;
    return sector === sectorFilter;
  };

  const invoiceSectorOk = (inv: Invoice): boolean =>
    sectorFilter === "all" || sectorMatches(refOf(inv.customerId, inv.customerCode, inv.customerName)?.sector);

  const visitSectorOk = (v: CustomerVisit): boolean => {
    if (sectorFilter === "all") return true;
    if (v.sector) return sectorMatches(v.sector);
    return sectorMatches(refOf(v.customerId, v.customerCode, v.customerName)?.sector);
  };

  const regionOfVisit = (v: CustomerVisit): string =>
    refOf(v.customerId, v.customerCode, v.customerName)?.region || v.branchName || "غير محدد";

  const periodInvoices = useMemo(
    () => invoices.filter((inv) => inRange(invDate(inv)) && invoiceSectorOk(inv)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, range.start, range.end, sectorFilter, customerRefMap]
  );
  const periodVisits = useMemo(
    () => visits.filter((v) => inRange(v.date || "") && visitSectorOk(v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visits, range.start, range.end, sectorFilter, customerRefMap]
  );

  /* ---------------------- مبيعات باليوم (بيانات محلية بالكامل — صفر EGRESS إضافي) ---------------------- */
  const dayMeta = useMemo(() => {
    const [y, m] = selectedDay.split("-").map((n) => parseInt(n, 10));
    if (!y || !m) return { prefix: "", label: selectedDay };
    return {
      prefix: `${y}-${String(m).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(
        new Date(y, m - 1, 1)
      ),
    };
  }, [selectedDay]);

  const dayBranches = useMemo(
    () => [...new Set(invoices.map((i) => i.branchName).filter(Boolean))].sort(),
    [invoices]
  );
  const dayReps = useMemo(
    () => [...new Set(invoices.map((i) => i.repName).filter(Boolean))].sort(),
    [invoices]
  );
  const dayCustomers = useMemo(
    () => [...new Set(invoices.map((i) => i.customerName).filter(Boolean))].sort(),
    [invoices]
  );

  const dayInvoices = useMemo(
    () =>
      invoices
        .filter((inv) => invDate(inv) === selectedDay)
        .filter((inv) => invoiceSectorOk(inv))
        .filter((inv) => dayBranch === "all" || inv.branchName === dayBranch)
        .filter((inv) => dayRep === "all" || inv.repName === dayRep)
        .filter((inv) => dayCustomer === "all" || inv.customerName === dayCustomer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, selectedDay, dayBranch, dayRep, dayCustomer, sectorFilter, customerRefMap]
  );

  const dayCollections = useMemo(
    () =>
      visits
        .filter((v) => (v.date || "").slice(0, 10) === selectedDay)
        .filter((v) => Number(v.collectedAmount) > 0)
        .filter((v) => visitSectorOk(v))
        .filter((v) => dayBranch === "all" || v.branchName === dayBranch)
        .filter((v) => dayRep === "all" || v.repName === dayRep)
        .filter((v) => dayCustomer === "all" || v.customerName === dayCustomer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visits, selectedDay, dayBranch, dayRep, dayCustomer, sectorFilter, customerRefMap]
  );

  const dayKpis = useMemo(() => {
    const sales = dayInvoices.reduce((s, inv) => s + invTotal(inv), 0);
    const cartons = dayInvoices.reduce(
      (s, inv) => s + inv.items.reduce((c, it: InvoiceItem) => c + (Number(it.cartonCount) || 0), 0),
      0
    );
    const collections = dayCollections.reduce((s, v) => s + (Number(v.collectedAmount) || 0), 0);
    return {
      sales,
      cartons,
      orders: dayInvoices.length,
      collections,
      collectionCount: dayCollections.length,
    };
  }, [dayInvoices, dayCollections]);

  /* مبيعات كل أيام شهر اليوم المحدد (للرسم + الضغط على يوم) */
  const monthDaily = useMemo(() => {
    if (!dayMeta.prefix) return [];
    const daysInMonth = new Date(
      parseInt(dayMeta.prefix.slice(0, 4), 10),
      parseInt(dayMeta.prefix.slice(5, 7), 10),
      0
    ).getDate();
    const map = new Map<string, number>();
    invoices.forEach((inv) => {
      if (!invoiceSectorOk(inv)) return;
      const d = invDate(inv).slice(0, 10);
      if (d.startsWith(dayMeta.prefix)) {
        map.set(d, (map.get(d) || 0) + invTotal(inv));
      }
    });
    const points: { day: string; label: string; sales: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${dayMeta.prefix}-${String(d).padStart(2, "0")}`;
      if (iso > todayStr) break;
      points.push({ day: iso, label: String(d), sales: Math.round(map.get(iso) || 0) });
    }
    return points;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, dayMeta.prefix, todayStr, sectorFilter, customerRefMap]);

  /* ---------------------- تحليل الزيارات (المنطقة + الأكثر←الأقل) ---------------------- */
  const visitRegions = useMemo(
    () => [...new Set(periodVisits.map(regionOfVisit))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodVisits, customerRefMap]
  );

  const periodVisitsRegion = useMemo(
    () =>
      periodVisits.filter(
        (v) => visitRegion === "all" || regionOfVisit(v) === visitRegion
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [periodVisits, visitRegion, customerRefMap]
  );

  const visitKpis = useMemo(() => {
    const unique = new Set(
      periodVisitsRegion.map(
        (v) =>
          v.customerId ||
          v.customerCode ||
          normalizeArabicText(v.customerName || "") ||
          "unknown"
      )
    ).size;
    const collected = periodVisitsRegion.reduce(
      (s, v) => s + (Number(v.collectedAmount) || 0),
      0
    );
    return { count: periodVisitsRegion.length, unique, collected };
  }, [periodVisitsRegion]);

  /** ترتيب عملاء الزيارات من الأكثر للأقل + خط السير لكل عميل. */
  const customerVisitRanks = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        code: string;
        count: number;
        region: string;
        route: string;
        lastDate: string;
        collected: number;
      }
    >();
    periodVisitsRegion.forEach((v) => {
      const ref = refOf(v.customerId, v.customerCode, v.customerName);
      const key = String(
        v.customerId ||
          v.customerCode ||
          normalizeArabicText(v.customerName || "") ||
          "unknown"
      );
      const cur =
        map.get(key) ||
        {
          key,
          name: v.customerName || "عميل غير معروف",
          code: v.customerCode || "—",
          count: 0,
          region: regionOfVisit(v),
          route: ref?.route || "",
          lastDate: "",
          collected: 0,
        };
      cur.count += 1;
      cur.collected += Number(v.collectedAmount) || 0;
      if (v.date && v.date > cur.lastDate) cur.lastDate = v.date;
      map.set(key, cur);
    });
    const list = [...map.values()].sort((a, b) => b.count - a.count).slice(0, 15);
    const max = list[0]?.count || 1;
    return list.map((x) => ({ ...x, pct: Math.round((x.count / max) * 100) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodVisitsRegion, customerRefMap]);

  /* ---------------------- KPIs ---------------------- */
  const kpis = useMemo(() => {
    const sales = periodInvoices.reduce((s, inv) => s + invTotal(inv), 0);
    const collections = periodVisits.reduce((s, v) => s + (Number(v.collectedAmount) || 0), 0);
    const cartons = periodInvoices.reduce(
      (s, inv) => s + inv.items.reduce((c, it: InvoiceItem) => c + (Number(it.cartonCount) || 0), 0),
      0
    );
    const active = periodInvoices.filter((inv) => statusGroup(inv.status) === "confirmed").length;
    return { sales, collections, cartons, orders: periodInvoices.length, active };
  }, [periodInvoices, periodVisits]);

  /* ---------------------- اتجاه المبيعات ---------------------- */
  const trendData = useMemo(() => {
    const byDay = new Map<string, number>();
    periodInvoices.forEach((inv) => {
      const d = invDate(inv).slice(0, 10);
      byDay.set(d, (byDay.get(d) || 0) + invTotal(inv));
    });

    const days = period === "today" ? 1 : period === "week" ? 7 : 30;
    const points: { label: string; sales: number; collections: number }[] = [];

    // التحصيلات حسب اليوم
    const colByDay = new Map<string, number>();
    periodVisits.forEach((v) => {
      const d = (v.date || "").slice(0, 10);
      colByDay.set(d, (colByDay.get(d) || 0) + (Number(v.collectedAmount) || 0));
    });

    if (period === "today") {
      // ساعات العمل: 8 صباحًا → 10 مساءً (التحصيلات بتظهر في الـ KPI فقط)
      const salesByHour = new Map<number, number>();
      periodInvoices.forEach((inv) => {
        const hour = parseInt((inv.time || "").slice(0, 2), 10);
        if (!Number.isNaN(hour) && hour >= 8 && hour <= 22) {
          salesByHour.set(hour, (salesByHour.get(hour) || 0) + invTotal(inv));
        }
      });
      for (let h = 8; h <= 22; h += 2) {
        points.push({
          label: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "ص" : "م"}`,
          sales: salesByHour.get(h) || 0,
          collections: 0,
        });
      }
      return points;
    }

    const step = period === "week" ? 1 : 3; // الشهر: كل 3 أيام نقطة
    for (let i = days - 1; i >= 0; i -= step) {
      const d = localISO(new Date(Date.now() - i * 86400000));
      points.push({
        label: new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(new Date(d)),
        sales: byDay.get(d) || 0,
        collections: colByDay.get(d) || 0,
      });
    }
    return points;
  }, [periodInvoices, periodVisits, period, todayStr]);

  /* ---------------------- أداء الفروع ---------------------- */
  const branchData = useMemo(() => {
    const byBranch = new Map<string, number>();
    periodInvoices.forEach((inv) => {
      const b = inv.branchName || "غير محدد";
      byBranch.set(b, (byBranch.get(b) || 0) + invTotal(inv));
    });
    return [...byBranch.entries()]
      .map(([name, sales]) => ({ name: name.replace(/^فرع\s*/, ""), sales: Math.round(sales) }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
  }, [periodInvoices]);

  /* ---------------------- الأصناف الأكثر مبيعًا ---------------------- */
  const topProducts = useMemo(() => {
    const byProduct = new Map<string, { sales: number; cartons: number }>();
    periodInvoices.forEach((inv) => {
      inv.items.forEach((it: InvoiceItem) => {
        const name = it.productName || "غير محدد";
        const cur = byProduct.get(name) || { sales: 0, cartons: 0 };
        cur.sales += Number(it.netTotal) || Number(it.totalPrice) || 0;
        cur.cartons += Number(it.cartonCount) || 0;
        byProduct.set(name, cur);
      });
    });
    const list = [...byProduct.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
    const max = list[0]?.sales || 1;
    return list.map((p) => ({ ...p, pct: Math.round((p.sales / max) * 100) }));
  }, [periodInvoices]);

  /* ---------------------- أهم العملاء ---------------------- */
  const topCustomers = useMemo(() => {
    const byCustomer = new Map<string, { sales: number; orders: number }>();
    periodInvoices.forEach((inv) => {
      const name = inv.customerName || "غير محدد";
      const cur = byCustomer.get(name) || { sales: 0, orders: 0 };
      cur.sales += invTotal(inv);
      cur.orders += 1;
      byCustomer.set(name, cur);
    });
    const list = [...byCustomer.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5);
    const max = list[0]?.sales || 1;
    return list.map((c) => ({ ...c, pct: Math.round((c.sales / max) * 100) }));
  }, [periodInvoices]);

  /* ---------------------- آخر الطلبيات ---------------------- */
  const recentInvoices = useMemo(
    () =>
      [...periodInvoices]
        .sort((a, b) => (invDate(b) + (b.time || "")).localeCompare(invDate(a) + (a.time || "")))
        .slice(0, 5),
    [periodInvoices]
  );

  /* ------------- 🚀 العرض من التجميع السيرفري لو متاح (fallback محلي) ------------- */
  const server = summaryState === "ready" && summary ? summary : null;

  const fmtDayLabel = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(d);
  };

  const displayKpis = server
    ? {
        sales: Number(server.kpis.sales) || 0,
        collections: kpis.collections, // التحصيلات من الزيارات المحلية
        cartons: Number(server.kpis.cartons) || 0,
        orders: Number(server.kpis.orders) || 0,
        active: Number(server.kpis.orders) || 0,
      }
    : kpis;

  const displayTrend = useMemo(() => {
    if (!server || period === "today") return trendData; // "اليوم" بالساعات من المحلي
    const daily = server.daily.map((d) => ({ day: d.day, sales: Number(d.sales) || 0 }));
    if (period === "week") {
      return daily.map((d) => ({ label: fmtDayLabel(d.day), sales: d.sales, collections: 0 }));
    }
    // الشهر: تجميع كل 3 أيام في نقطة
    const buckets: { label: string; sales: number; collections: number }[] = [];
    daily.forEach((d, i) => {
      const bi = Math.floor(i / 3);
      if (!buckets[bi]) buckets[bi] = { label: fmtDayLabel(d.day), sales: 0, collections: 0 };
      buckets[bi].sales += d.sales;
    });
    return buckets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, trendData, period]);

  const displayBranches = useMemo(
    () =>
      server
        ? server.by_branch.map((b) => ({ name: (b.name || "غير محدد").replace(/^فرع\s*/, ""), sales: Math.round(Number(b.sales) || 0) }))
        : branchData,
    [server, branchData]
  );

  const displayProducts = useMemo(() => {
    if (!server) return topProducts;
    const list = server.top_products.map((p) => ({
      name: p.product_name,
      sales: Number(p.sales) || 0,
      cartons: Number(p.cartons) || 0,
    }));
    const max = list[0]?.sales || 1;
    return list.map((p) => ({ ...p, pct: Math.round((p.sales / max) * 100) }));
  }, [server, topProducts]);

  const displayCustomers = useMemo(() => {
    if (!server) return topCustomers;
    const list = server.top_customers.map((c) => ({
      name: c.name || "غير محدد",
      sales: Number(c.sales) || 0,
      orders: Number(c.orders) || 0,
    }));
    const max = list[0]?.sales || 1;
    return list.map((c) => ({ ...c, pct: Math.round((c.sales / max) * 100) }));
  }, [server, topCustomers]);

  const displayRecent = useMemo(
    () =>
      server
        ? server.recent.map((r) => ({
            id: r.id,
            invoiceNumber: r.invoice_number || "—",
            customerName: r.customer_name || "—",
            branchName: r.branch_name || "—",
            dateStr: r.date || "",
            total: Number(r.estimated_grand_total) || 0,
            status: r.status || "معتمدة",
          }))
        : recentInvoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customerName,
            branchName: inv.branchName,
            dateStr: invDate(inv).slice(5),
            total: invTotal(inv),
            status: inv.status,
          })),
    [server, recentInvoices]
  );

  /* ---------------------- بطاقات KPI ---------------------- */
  const kpiCards = [
    { label: "مبيعات الفترة", value: formatCurrency(displayKpis.sales), tone: "text-primary", icon: <Wallet className="h-4 w-4" /> },
    { label: "تحصيلات الفترة", value: formatCurrency(displayKpis.collections), tone: "text-secondary", icon: <ClipboardList className="h-4 w-4" /> },
    { label: "طلبيات", value: `${displayKpis.orders} (${displayKpis.active} مؤكدة)`, tone: "text-text", icon: <FileText className="h-4 w-4" /> },
    { label: "كراتين مسحوبة", value: String(displayKpis.cartons), tone: "text-success", icon: <Package className="h-4 w-4" /> },
  ];

  /* ---------------------- Tooltip موحّد ---------------------- */
  const tooltipStyle = {
    backgroundColor: palette.card,
    border: `1px solid ${palette.border}`,
    borderRadius: "0.75rem",
    fontSize: "12px",
    fontFamily: "inherit",
    color: palette.textSecondary,
  };

  return (
    <div dir="rtl" className="pb-24 md:pb-8">
      {/* رأس الصفحة */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-[color:var(--app-muted,theme(colors.slate.500))]">
            {currentUser?.name ? `أهلاً ${currentUser.name} — ` : ""}لوحة التحليلات الحية
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
            <BarChart3 className="h-6 w-6 text-[var(--app-accent,#2563EB)]" />
            التحليلات
          </h1>
        </div>
        {isOffline && (
          <span className="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-semibold text-warning">
            أوفلاين — بيانات محلية
          </span>
        )}
        {summaryState === "loading" && (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
            جاري التجميع على السيرفر…
          </span>
        )}
        {server && (
          <span
            className="rounded-full bg-success/10 px-3 py-1 text-[11px] font-semibold text-success"
            title="الأرقام مجمعة داخل قاعدة البيانات (طلب واحد صغير) — توفير في التحميل"
          >
            ⚡ تجميع على السيرفر
          </span>
        )}
      </div>

      {/* مبدّل الفترة + فصل القطاع (منزلي/كهربائي) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[color:var(--app-muted,theme(colors.slate.500))]">القطاع:</span>
          {([
            ["all", "الكل"],
            ["home", "منزلي"],
            ["electrical", "كهربائي"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSectorFilter(key as "all" | "home" | "electrical")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                sectorFilter === key
                  ? "bg-[var(--app-ok,#0D9488)] text-white shadow-sm"
                  : "border border-border bg-card text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-ok,#0D9488)]/40 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* بطاقات KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">{c.label}</span>
              <span className={`shrink-0 ${c.tone}`}>{c.icon}</span>
            </div>
            <p className={`mt-1 text-sm font-bold tabular-nums sm:text-lg ${c.tone === "text-text" ? "text-slate-900 dark:text-slate-100" : c.tone}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {/* ============ المبيعات باليوم + آخر التحصيلات باليوم ============ */}
      <div className="mt-4 space-y-4">
        {/* شريط التحكم باليوم */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-accent,#2563EB)]/10 text-[var(--app-accent,#2563EB)]">
                <CalendarDays className="h-3.5 w-3.5" />
              </span>
              المبيعات باليوم
              <span className="rounded-full bg-[var(--app-accent,#2563EB)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--app-accent,#2563EB)]">
                {selectedDay}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDay}
                max={todayStr}
                onChange={(e) => {
                  if (e.target.value) setSelectedDay(e.target.value);
                }}
                className="rounded-xl border border-border bg-transparent px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--app-accent,#2563EB)]/50 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setSelectedDay(todayStr)}
                className="rounded-full bg-[var(--app-accent,#2563EB)]/10 px-3 py-1.5 text-xs font-bold text-[var(--app-accent,#2563EB)] transition hover:bg-[var(--app-accent,#2563EB)]/20"
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 1);
                  setSelectedDay(localISO(d));
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-[color:var(--app-muted,theme(colors.slate.500))] transition hover:border-[var(--app-accent,#2563EB)]/40 hover:text-slate-900 dark:hover:text-slate-100"
              >
                أمس
              </button>
            </div>
          </div>

          {/* فلاتر الفرع / المندوب / العميل */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={dayBranch}
              onChange={(e) => setDayBranch(e.target.value)}
              className="rounded-xl border border-border bg-transparent px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--app-accent,#2563EB)]/50 dark:text-slate-100"
            >
              <option value="all">كل الفروع</option>
              {dayBranches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <select
              value={dayRep}
              onChange={(e) => setDayRep(e.target.value)}
              className="rounded-xl border border-border bg-transparent px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--app-accent,#2563EB)]/50 dark:text-slate-100"
            >
              <option value="all">كل المندوبين</option>
              {dayReps.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={dayCustomer}
              onChange={(e) => setDayCustomer(e.target.value)}
              className="max-w-[180px] rounded-xl border border-border bg-transparent px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-[var(--app-accent,#2563EB)]/50 dark:text-slate-100"
            >
              <option value="all">كل العملاء</option>
              {dayCustomers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {(dayBranch !== "all" || dayRep !== "all" || dayCustomer !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setDayBranch("all");
                  setDayRep("all");
                  setDayCustomer("all");
                }}
                className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-[color:var(--app-muted,theme(colors.slate.500))] transition hover:border-[var(--app-accent,#2563EB)]/40 hover:text-slate-900 dark:hover:text-slate-100"
              >
                مسح الفلاتر
              </button>
            )}
          </div>

          {/* مؤشرات اليوم */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">مبيعات اليوم</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--app-accent,#2563EB)] sm:text-base">
                {formatCurrency(dayKpis.sales)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">طلبيات اليوم</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 sm:text-base">
                {dayKpis.orders}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">كراتين اليوم</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100 sm:text-base">
                {dayKpis.cartons}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">تحصيلات اليوم</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--app-ok,#0D9488)] sm:text-base">
                {formatCurrency(dayKpis.collections)}
              </p>
            </div>
          </div>
        </div>

        {/* رسم مبيعات الشهر — اضغط على أي يوم */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              مبيعات شهر {dayMeta.label} — اضغط على يوم لعرض مبيعاته
            </h3>
            <span className="text-[11px] font-semibold tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
              إجمالي الشهر: {formatCurrency(monthDaily.reduce((s, p) => s + p.sales, 0))}
            </span>
          </div>
          {monthDaily.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذا الشهر</p>
          ) : (
            <div dir="ltr" className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthDaily}
                  margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                  onClick={(state: any) => {
                    const day = state?.activePayload?.[0]?.payload?.day;
                    if (day) setSelectedDay(day);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: palette.textMuted }}
                    axisLine={false}
                    tickLine={false}
                    interval={monthDaily.length > 18 ? 1 : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: palette.textMuted }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number | string) => formatCurrency(Number(value))}
                    labelFormatter={(label) => `${dayMeta.prefix}-${String(label).padStart(2, "0")}`}
                    cursor={{ fill: palette.grid }}
                  />
                  <Bar dataKey="sales" name="مبيعات" radius={[6, 6, 0, 0]} maxBarSize={26}>
                    {monthDaily.map((entry) => (
                      <Cell
                        key={entry.day}
                        fill={entry.day === selectedDay ? palette.primary : `${palette.primary}38`}
                        cursor="pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* جدول مبيعات اليوم + جدول تحصيلات اليوم */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-accent,#2563EB)]/10 text-[var(--app-accent,#2563EB)]">
                <FileText className="h-3.5 w-3.5" />
              </span>
              مبيعات اليوم
              <span className="rounded-full bg-[var(--app-accent,#2563EB)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--app-accent,#2563EB)]">
                {dayKpis.orders} طلبية
              </span>
            </h3>
            {dayInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">
                لا توجد مبيعات في هذا اليوم
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {dayInvoices.map((inv) => {
                  const g = statusGroup(inv.status);
                  return (
                    <li key={inv.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenCustomerProfile?.(inv.customerId || inv.customerName)}
                          title="فتح بروفايل العميل"
                          className="truncate text-xs font-bold text-[var(--app-accent,#2563EB)] transition hover:underline"
                        >
                          {inv.customerName}
                        </button>
                        <p className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                          {inv.invoiceNumber} · {inv.repName} · {inv.branchName}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(invTotal(inv))}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip[g]}`}>
                          {statusLabel[g]}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-ok,#0D9488)]/10 text-[var(--app-ok,#0D9488)]">
                <ClipboardList className="h-3.5 w-3.5" />
              </span>
              آخر التحصيلات باليوم
              <span className="rounded-full bg-[var(--app-ok,#0D9488)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--app-ok,#0D9488)]">
                {dayKpis.collectionCount} تحصيلة
              </span>
            </h3>
            {dayCollections.length === 0 ? (
              <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">
                لا توجد تحصيلات في هذا اليوم
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {dayCollections.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenCustomerProfile?.(v.customerId || v.customerName)}
                        title="فتح بروفايل العميل"
                        className="truncate text-xs font-bold text-[var(--app-accent,#2563EB)] transition hover:underline"
                      >
                        {v.customerName || "عميل غير معروف"}
                      </button>
                      <p className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {v.repName} · {v.branchName || "—"}
                        {v.time ? ` · ${v.time}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--app-ok,#0D9488)]/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-[var(--app-ok,#0D9488)]">
                      {formatCurrency(Number(v.collectedAmount) || 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ============ تحليل الزيارات (المنطقة + الأكثر←الأقل + خط السير) ============ */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--app-ok,#0D9488)]/10 text-[var(--app-ok,#0D9488)]">
              <Clapperboard className="h-3.5 w-3.5" />
            </span>
            تحليل الزيارات — الأكثر زيارة أولًا
            <span className="rounded-full bg-[var(--app-ok,#0D9488)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--app-ok,#0D9488)]">
              {period === "today" ? "اليوم" : period === "week" ? "آخر 7 أيام" : "آخر 30 يوم"}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => showEncouragement("visit")}
              className="rounded-full border border-[var(--app-blue,#2563EB)]/30 bg-[var(--app-blue,#2563EB)]/5 px-2.5 py-1 text-[10px] font-bold text-[var(--app-blue,#2563EB)] transition hover:bg-[var(--app-blue,#2563EB)]/15"
            >
              رسالة زيارة
            </button>
            <button
              type="button"
              onClick={() => showEncouragement("collection")}
              className="rounded-full border border-[var(--app-ok,#0D9488)]/30 bg-[var(--app-ok,#0D9488)]/5 px-2.5 py-1 text-[10px] font-bold text-[var(--app-ok,#0D9488)] transition hover:bg-[var(--app-ok,#0D9488)]/15"
            >
              رسالة تحصيل
            </button>
            <button
              type="button"
              onClick={() => showEncouragement("returns")}
              className="rounded-full border border-[var(--app-warn,#B45309)]/30 bg-[var(--app-warn,#B45309)]/5 px-2.5 py-1 text-[10px] font-bold text-[var(--app-warn,#B45309)] transition hover:bg-[var(--app-warn,#B45309)]/15"
            >
              رسالة مرتجعات
            </button>
          </div>
        </div>

        {/* فلتر المنطقة */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-[color:var(--app-muted,theme(colors.slate.500))]">المنطقة:</span>
          <button
            type="button"
            onClick={() => setVisitRegion("all")}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              visitRegion === "all"
                ? "bg-[var(--app-accent,#2563EB)] text-white shadow-sm"
                : "border border-border text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-accent,#2563EB)]/40"
            }`}
          >
            كل المناطق
          </button>
          {visitRegions.slice(0, 10).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setVisitRegion(r)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                visitRegion === r
                  ? "bg-[var(--app-accent,#2563EB)] text-white shadow-sm"
                  : "border border-border text-[color:var(--app-muted,theme(colors.slate.500))] hover:border-[var(--app-accent,#2563EB)]/40"
              }`}
            >
              {r}
            </button>
          ))}
          {visitRegions.length > 10 && (
            <span className="text-[10px] text-[color:var(--app-muted,theme(colors.slate.500))]">
              +{visitRegions.length - 10} منطقة
            </span>
          )}
        </div>

        {/* مؤشرات الزيارات */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">عدد الزيارات</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{visitKpis.count}</p>
          </div>
          <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">عملاء مزارون</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">{visitKpis.unique}</p>
          </div>
          <div className="rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold text-[color:var(--app-muted,theme(colors.slate.500))]">تحصيلات من الزيارات</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-[var(--app-ok,#0D9488)]">{formatCurrency(visitKpis.collected)}</p>
          </div>
        </div>

        {/* ترتيب العملاء من الأكثر زيارة للأقل */}
        {customerVisitRanks.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">
            لا توجد زيارات في هذه الفترة{visitRegion !== "all" ? ` في منطقة ${visitRegion}` : ""}
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {customerVisitRanks.map((r, i) => (
              <li key={r.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                        i < 3
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{r.name}</span>
                    <span className="hidden sm:inline shrink-0 text-[10px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                      {r.code}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                    {r.count} زيارة · آخر: {r.lastDate || "—"}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-[var(--app-ok,#0D9488)] to-[var(--app-accent,#2563EB)] transition-all duration-700"
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[10px] text-[color:var(--app-muted,theme(colors.slate.500))]">
                  <span>المنطقة: {r.region}</span>
                  {r.route && <span>خط السير: {r.route}</span>}
                  {r.collected > 0 && <span>محصّل: {formatCurrency(r.collected)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* اتجاه المبيعات والتحصيلات */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">اتجاه المبيعات والتحصيلات — {periodLabels[period]}</h2>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-[color:var(--app-muted,theme(colors.slate.500))]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--app-accent,#2563EB)]" /> مبيعات
            </span>
            <span className="flex items-center gap-1 text-[color:var(--app-muted,theme(colors.slate.500))]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--app-ok,#0D9488)]" /> تحصيلات
            </span>
          </div>
        </div>
        <div dir="ltr" className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="raSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.primary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={palette.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="raCol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={palette.secondary} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={palette.secondary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} width={50} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => formatCurrency(Number(value))} />
              <Area type="monotone" dataKey="sales" name="مبيعات" stroke={palette.primary} strokeWidth={2} fill="url(#raSales)" />
              <Area type="monotone" dataKey="collections" name="تحصيلات" stroke={palette.secondary} strokeWidth={2} fill="url(#raCol)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* فروع + أصناف */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">أداء الفروع</h2>
          <div dir="ltr" className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={displayBranches} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11, fill: palette.textSecondary }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string) => formatCurrency(Number(value))} />
                <Bar dataKey="sales" name="مبيعات" fill={palette.primary} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">الأصناف الأكثر مبيعًا</h2>
          {displayProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد مبيعات في هذه الفترة</p>
          ) : (
            <ul className="space-y-3">
              {displayProducts.map((p, i) => (
                <li key={p.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--app-accent,#2563EB)]/10 text-[10px] font-bold text-[var(--app-accent,#2563EB)]">
                        {i + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                      {p.cartons > 0 && `${p.cartons} ك· `}
                      {formatCurrency(p.sales)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-gradient-to-l from-[var(--app-accent,#2563EB)] to-[var(--app-ok,#0D9488)]" style={{ width: `${p.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* عملاء + آخر الطلبيات */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Users className="h-4 w-4 text-[var(--app-accent,#2563EB)]" />
            أهم العملاء ({customerCount} عميل ظاهر)
          </h2>
          {displayCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا يوجد عملاء في هذه الفترة</p>
          ) : (
            <ul className="space-y-3">
              {displayCustomers.map((c, i) => (
                <li key={c.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--app-ok,#0D9488)]/10 text-[10px] font-bold text-[var(--app-ok,#0D9488)]">
                        {i + 1}
                      </span>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                      {c.orders} طلبية · {formatCurrency(c.sales)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-[var(--app-ok,#0D9488)]" style={{ width: `${c.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">آخر الطلبيات</h2>
          {displayRecent.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--app-muted,theme(colors.slate.500))]">لا توجد طلبيات في هذه الفترة</p>
          ) : (
            <ul className="divide-y divide-border">
              {displayRecent.map((inv) => {
                const g = statusGroup(inv.status);
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">{inv.customerName}</p>
                      <p className="text-[11px] tabular-nums text-[color:var(--app-muted,theme(colors.slate.500))]">
                        {inv.invoiceNumber} · {inv.dateStr} · {inv.branchName}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">{formatCurrency(inv.total)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip[g]}`}>{statusLabel[g]}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default RealAnalyticsDashboard;
