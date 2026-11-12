/**
 * templates/invoices/InvoicesTemplate.tsx
 * Template #4 — Invoices (list + expandable details, doubles as the
 * "web admin data table" pattern).
 *
 * Mobile  : summary KPI strip + search/filter chips + invoice cards that
 *           expand inline to show items & totals (no navigation needed).
 * Desktop : real data table with sticky header — row click expands a
 *           detail row beneath it.
 */
import React, { useMemo, useState } from "react";
import {
  Ban,
  ChevronDown,
  ClipboardList,
  Clock,
  FileText,
  Printer,
  RotateCcw,
  Search,
  Truck,
} from "lucide-react";
import {
  fmtDate,
  formatEGP,
  invoiceFilters,
  invoiceStatusLabels,
  invoiceSummary,
  mockInvoices,
  type InvoiceStatus,
  type MockInvoice,
} from "./data";

/* ------------------------------------------------------------------ */

const statusChip: Record<InvoiceStatus, string> = {
  confirmed: "bg-success/10 text-success dark:bg-success/15",
  pending: "bg-warning/10 text-warning dark:bg-warning/15",
  returned: "bg-error/10 text-error dark:bg-error/15",
};

function SummaryStrip() {
  const s = invoiceSummary(mockInvoices);
  const cards = [
    { label: "فواتير الشهر", value: String(s.count), tone: "text-primary", icon: <FileText className="h-4 w-4" /> },
    { label: "قيمتها", value: formatEGP(s.totalValue), tone: "text-text", icon: <ClipboardList className="h-4 w-4" /> },
    { label: "كراتين مسحوبة", value: String(s.totalCartons), tone: "text-secondary", icon: <Truck className="h-4 w-4" /> },
    { label: "معلقة / مرتجعة", value: `${s.pendingCount} / ${s.returnedCount}`, tone: "text-warning", icon: <Clock className="h-4 w-4" /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-text-secondary">{c.label}</span>
            <span className={`shrink-0 ${c.tone}`}>{c.icon}</span>
          </div>
          <p className={`mt-1 text-base font-bold tabular-nums ${c.tone} sm:text-lg`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

function InvoiceItems({ invoice }: { invoice: MockInvoice }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-subtle/60 p-3">
      <ul className="divide-y divide-border-subtle">
        {invoice.items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-xs first:pt-0 last:pb-0">
            <span className="min-w-0 truncate text-text-secondary">
              {it.name}
              <span className="text-text-muted">
                {" "}
                — {it.cartons} كرتونة{it.pieces ? ` + ${it.pieces} قطعة` : ""}
              </span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-text">{formatEGP(it.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 space-y-1 border-t border-border-subtle pt-2 text-[11px]">
        <div className="flex items-center justify-between text-text-secondary">
          <span>عدد الكراتين</span>
          <span className="font-semibold tabular-nums">{invoice.totalCartons}</span>
        </div>
        <div className="flex items-center justify-between pt-0.5 text-sm">
          <span className="font-bold text-text">الإجمالي</span>
          <span className="font-extrabold tabular-nums text-primary">{formatEGP(invoice.estimatedGrandTotal)}</span>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-2 text-[11px] font-bold text-primary transition-colors hover:bg-primary/15">
          <Printer className="h-3.5 w-3.5" />
          طباعة
        </button>
        <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success/10 py-2 text-[11px] font-bold text-success transition-colors hover:bg-success/15">
          <Truck className="h-3.5 w-3.5" />
          توريد نواقص
        </button>
        {invoice.status === "pending" && (
          <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-error/10 py-2 text-[11px] font-bold text-error transition-colors hover:bg-error/15">
            <Ban className="h-3.5 w-3.5" />
            إلغاء
          </button>
        )}
        {invoice.status === "confirmed" && (
          <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-warning/10 py-2 text-[11px] font-bold text-warning transition-colors hover:bg-warning/15">
            <RotateCcw className="h-3.5 w-3.5" />
            مرتجع
          </button>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChip[status]}`}>
      {invoiceStatusLabels[status]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export function InvoicesTemplate() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    return mockInvoices.filter((inv) => {
      if (filter !== "all" && inv.status !== filter) return false;
      if (!q) return true;
      return (
        inv.customerName.includes(q) ||
        inv.invoiceNumber.includes(q) ||
        inv.customerCode.includes(q) ||
        inv.repName.includes(q)
      );
    });
  }, [query, filter]);

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div dir="rtl" className="pb-24 lg:pb-4">
      <div className="mb-5">
        <p className="text-xs text-text-muted">إدارة الفواتير</p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-extrabold tracking-tight text-text sm:text-2xl">
          <FileText className="h-6 w-6 text-primary" />
          الفواتير
        </h1>
      </div>

      <SummaryStrip />

      {/* search + filters */}
      <div className="relative mt-4">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث برقم الفاتورة، العميل، الكود أو المندوب…"
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-4 pr-10 text-sm text-text shadow-sm placeholder:text-text-muted focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {invoiceFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              filter === f.key
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-surface text-text-secondary hover:border-primary/30 hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ---------------- desktop table ---------------- */}
      <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-subtle/70 text-[11px] uppercase text-text-secondary">
              <th className="px-4 py-3 font-semibold">رقم الفاتورة</th>
              <th className="px-4 py-3 font-semibold">العميل</th>
              <th className="px-4 py-3 font-semibold">الفرع</th>
              <th className="px-4 py-3 font-semibold">المندوب</th>
              <th className="px-4 py-3 font-semibold">التاريخ</th>
              <th className="px-4 py-3 font-semibold">الحالة</th>
              <th className="px-4 py-3 font-semibold">الدفع</th>
              <th className="px-4 py-3 text-left font-semibold">الإجمالي</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <React.Fragment key={inv.id}>
                <tr
                  onClick={() => toggle(inv.id)}
                  className={`cursor-pointer border-b border-border-subtle transition-colors hover:bg-surface-subtle/60 ${
                    expanded === inv.id ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-bold tabular-nums text-primary">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-text">{inv.customerName}</p>
                    <p className="text-[11px] text-text-muted">{inv.customerCode}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{inv.branchName}</td>
                  <td className="px-4 py-3 text-text-secondary">{inv.repName}</td>
                  <td className="px-4 py-3 tabular-nums text-text-secondary">{fmtDate(inv.date)}</td>
                  <td className="px-4 py-3"><StatusChip status={inv.status} /></td>
                  <td className="px-4 py-3 text-[11px] text-text-secondary">{inv.paymentMethod}</td>
                  <td className="px-4 py-3 text-left font-bold tabular-nums text-text">{formatEGP(inv.estimatedGrandTotal)}</td>
                  <td className="px-2 py-3">
                    <ChevronDown
                      className={`h-4 w-4 text-text-muted transition-transform duration-200 ${expanded === inv.id ? "rotate-180" : ""}`}
                    />
                  </td>
                </tr>
                {expanded === inv.id && (
                  <tr className="border-b border-border-subtle">
                    <td colSpan={9} className="bg-surface-subtle/40 px-4 py-3">
                      <InvoiceItems invoice={inv} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-secondary">
                  مفيش فواتير مطابقة للبحث
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------------- mobile cards ---------------- */}
      <div className="mt-4 space-y-2.5 lg:hidden">
        {filtered.map((inv) => (
          <div key={inv.id} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <button
              onClick={() => toggle(inv.id)}
              className="flex w-full items-center justify-between gap-3 p-3 text-right"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tabular-nums text-primary">{inv.invoiceNumber}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-text">{inv.customerName}</p>
                <p className="text-[11px] text-text-muted">
                  {fmtDate(inv.date)} · {inv.branchName} · {inv.repName}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip status={inv.status} />
                <span className="text-sm font-bold tabular-nums text-text">{formatEGP(inv.estimatedGrandTotal)}</span>
              </div>
            </button>
            {expanded === inv.id && (
              <div className="border-t border-border-subtle p-3 pt-0">
                <div className="pt-3">
                  <InvoiceItems invoice={inv} />
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card py-12 text-center">
            <FileText className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-secondary">مفيش فواتير مطابقة للبحث</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InvoicesTemplate;
