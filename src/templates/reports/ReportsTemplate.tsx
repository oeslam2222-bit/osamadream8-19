/**
 * templates/reports/ReportsTemplate.tsx
 * Template #5 — Reports/Charts.
 *
 * مبدّل فترات (شهر/ربع/سنة) + مقارنة بالفترة السابقة (delta cards)
 * + شارت أعمدة مزدوج (حالي vs سابق) + جدول أداء المناديب
 * (كروت موبايل / جدول ويب) + أزرار تصدير.
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
  Legend,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Printer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { chartPalette, useTemplateTheme } from "../theme";
import {
  collectionPct,
  comparisonStats,
  deltaPct,
  formatEGP,
  repRows,
  scopeLabels,
  scopeOrder,
  targetPct,
  trendByScope,
  type ReportScope,
  type RepRow,
} from "./data";

const statIcons: Record<string, React.ReactNode> = {
  "مبيعات الفترة": <TrendingUp className="h-4 w-4" />,
  "تحصيلات الفترة": <Wallet className="h-4 w-4" />,
  "عدد الطلبيات": <ClipboardList className="h-4 w-4" />,
  "عملاء نشطين": <Users className="h-4 w-4" />,
};

/* ------------------------- بطاقة مقارنة ------------------------- */

function ComparisonCard({ label, current, previous, format }: { label: string; current: number; previous: number; format: "money" | "count" }) {
  const pct = deltaPct(current, previous);
  const up = pct >= 0;
  const value = format === "money" ? formatEGP(current) : current.toLocaleString("en-US");
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-text-secondary">{label}</span>
        <span className="shrink-0 text-text-muted">{statIcons[label]}</span>
      </div>
      <p className="mt-1 text-sm font-bold tabular-nums text-text sm:text-lg">{value}</p>
      <div
        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
          up ? "bg-success/10 text-success" : "bg-error/10 text-error"
        }`}
      >
        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {up ? "+" : ""}
        {pct}% عن الفترة السابقة
      </div>
    </div>
  );
}

/* ------------------------- صف مندوب (موبايل) ------------------------- */

function RepCard({ rep }: { rep: RepRow }) {
  const tPct = targetPct(rep);
  const cPct = collectionPct(rep);
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-text">{rep.name}</p>
          <p className="text-[11px] text-text-muted">{rep.branch} · {rep.orders} طلبية</p>
        </div>
        <div className="shrink-0 text-left">
          <p className="text-sm font-bold tabular-nums text-text">{formatEGP(rep.sales)}</p>
          <p className="text-[10px] tabular-nums text-text-secondary">
            تحصيل {collectionPct(rep)}%
          </p>
        </div>
      </div>
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-text-muted">التارجت</span>
          <span className={`font-bold tabular-nums ${tPct >= 90 ? "text-success" : tPct >= 70 ? "text-warning" : "text-error"}`}>
            {tPct}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className={`h-full rounded-full ${
              tPct >= 90 ? "bg-success" : tPct >= 70 ? "bg-warning" : "bg-error"
            }`}
            style={{ width: `${tPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------- التيمبلت ------------------------- */

export function ReportsTemplate() {
  const { colorMode } = useTemplateTheme();
  const palette = chartPalette[colorMode];
  const [scope, setScope] = useState<ReportScope>("month");
  const [exportState, setExportState] = useState<"idle" | "excel" | "pdf">("idle");

  const stats = comparisonStats[scope];
  const trend = trendByScope[scope];
  const reps = useMemo(() => repRowsOf(scope), [scope]);

  const totalCurrent = stats.find((s) => s.label === "مبيعات الفترة")?.current || 0;
  const totalPrevious = stats.find((s) => s.label === "مبيعات الفترة")?.previous || 0;

  const fakeExport = (kind: "excel" | "pdf") => {
    setExportState(kind);
    window.setTimeout(() => setExportState("idle"), 1600);
  };
  return (
    <div dir="rtl" className="pb-24 lg:pb-4">
      <div className="mb-5">
        <p className="text-xs text-text-muted">تقارير تحليلية</p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text sm:text-2xl">
          <TrendingUp className="h-6 w-6 text-primary" />
          التقارير
        </h1>
      </div>

      {/* مبدّل الفترة + التصدير */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {scopeOrder.map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
                scope === s
                  ? "bg-primary text-white shadow-sm"
                  : "border border-border bg-surface text-text-secondary hover:border-primary/30 hover:text-text"
              }`}
            >
              {scopeLabels[s]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fakeExport("excel")}
            className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-1.5 text-[11px] font-bold text-success transition-colors hover:bg-success/15"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {exportState === "excel" ? "جاري التصدير…" : "Excel"}
          </button>
          <button
            onClick={() => fakeExport("pdf")}
            className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15"
          >
            <Printer className="h-3.5 w-3.5" />
            {exportState === "pdf" ? "جاري التصدير…" : "PDF"}
          </button>
        </div>
      </div>

      {/* مقارنة الفترات */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <ComparisonCard key={s.label} {...s} />
        ))}
      </div>

      {/* شارت المقارنة */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-text">
            المبيعات — {scopeLabels[scope]} الحالي vs السابق
          </h2>
          <span className="text-[11px] tabular-nums text-text-secondary">
            الإجمالي: {formatEGP(totalCurrent)} <span className="text-text-muted">({deltaPct(totalCurrent, totalPrevious) >= 0 ? "+" : ""}{deltaPct(totalCurrent, totalPrevious)}%)</span>
          </span>
        </div>
        <div dir="ltr" className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.textMuted }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: palette.textMuted }}
                axisLine={false}
                tickLine={false}
                width={46}
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
              />
              <Tooltip
                cursor={{ fill: colorMode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}
                contentStyle={{
                  backgroundColor: palette.card,
                  border: `1px solid ${palette.border}`,
                  borderRadius: "0.75rem",
                  fontSize: "12px",
                  fontFamily: "inherit",
                }}
                formatter={(value: number | string, name: string) =>
                  name === "current" ? [formatEGP(Number(value)), "الحالي"] : [formatEGP(Number(value)), "السابق"]
                }
              />
              <Legend
                formatter={(value: string) => (value === "current" ? "الفترة الحالية" : "الفترة السابقة")}
                wrapperStyle={{ fontSize: "11px", fontFamily: "inherit" }}
              />
              <Bar dataKey="previous" name="previous" fill={palette.textMuted} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="current" name="current" fill={palette.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* أداء المناديب — جدول ويب */}
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle/70 text-[11px] uppercase text-text-secondary">
              <th className="px-4 py-3 font-semibold">المندوب</th>
              <th className="px-4 py-3 font-semibold">الفرع</th>
              <th className="px-4 py-3 font-semibold">الطلبيات</th>
              <th className="px-4 py-3 font-semibold">المبيعات</th>
              <th className="px-4 py-3 font-semibold">التحصيلات</th>
              <th className="px-4 py-3 font-semibold">نسبة التحصيل</th>
              <th className="px-4 py-3 font-semibold">التارجت</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => {
              const tPct = targetPct(rep);
              return (
                <tr key={rep.name} className="border-b border-border-subtle transition-colors hover:bg-surface-subtle/60">
                  <td className="px-4 py-3 font-semibold text-text">{rep.name}</td>
                  <td className="px-4 py-3 text-text-secondary">{rep.branch}</td>
                  <td className="px-4 py-3 tabular-nums text-text-secondary">{rep.orders}</td>
                  <td className="px-4 py-3 font-bold tabular-nums text-text">{formatEGP(rep.sales)}</td>
                  <td className="px-4 py-3 tabular-nums text-text-secondary">{formatEGP(rep.collections)}</td>
                  <td className="px-4 py-3 tabular-nums text-text-secondary">{collectionPct(rep)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-subtle">
                        <div
                          className={`h-full rounded-full ${tPct >= 90 ? "bg-success" : tPct >= 70 ? "bg-warning" : "bg-error"}`}
                          style={{ width: `${tPct}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${tPct >= 90 ? "text-success" : tPct >= 70 ? "text-warning" : "text-error"}`}>
                        {tPct}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* أداء المناديب — كروت موبايل */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:hidden">
        {reps.map((rep) => (
          <RepCard key={rep.name} rep={rep} />
        ))}
      </div>

      {/* ملاحظة أطال */}
      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-text-muted">
        <FileText className="h-3.5 w-3.5" />
        التقارير بتتحدث تلقائيًا مع كل مزامنة للبيانات — التصدير بياخد القيم المعروضة بالفترة المختارة.
      </p>
    </div>
  );
}

/** helper داخل الملف: نسخة مرتبة من صفوف المناديب للفترة. */
function repRowsOf(scope: ReportScope): RepRow[] {
  return [...repRows[scope]].sort((a, b) => b.sales - a.sales);
}

export default ReportsTemplate;
