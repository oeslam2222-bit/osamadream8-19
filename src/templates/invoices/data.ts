/**
 * templates/invoices/data.ts
 * Mock invoices for the invoices template.
 * Mirrors the real `Invoice` shape (types.ts) — only fields we display.
 */

export type InvoiceStatus = "confirmed" | "pending" | "returned";
export type PaymentMethod = "نقدي" | "آجل ١٥ يوم" | "أسبوعي" | "شهري";

export interface MockInvoiceItem {
  name: string;
  cartons: number;
  pieces: number;
  amount: number;
}

export interface MockInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerCode: string;
  date: string;
  time: string;
  branchName: string;
  repName: string;
  items: MockInvoiceItem[];
  totalCartons: number;
  subtotal: number;
  estimatedGrandTotal: number;
  paymentMethod: PaymentMethod;
  status: InvoiceStatus;
}

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  confirmed: "مؤكدة",
  pending: "معلقة",
  returned: "مرتجعة",
};

export const invoiceFilters: { key: "all" | InvoiceStatus; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "confirmed", label: "مؤكدة" },
  { key: "pending", label: "معلقة" },
  { key: "returned", label: "مرتجعة" },
];

export const mockInvoices: MockInvoice[] = [
  {
    id: "i1", invoiceNumber: "DRM-2026-0451", customerName: "مخابز النور", customerCode: "CUS-0121",
    date: "2026-11-10", time: "09:24", branchName: "طنطا", repName: "أحمد سعيد",
    items: [
      { name: "كاسة ١٨ لتر", cartons: 40, pieces: 0, amount: 5960 },
      { name: "قنينة ١ لتر", cartons: 20, pieces: 5, amount: 2025 },
    ],
    totalCartons: 60, subtotal: 7985,
    estimatedGrandTotal: 9103, paymentMethod: "أسبوعي", status: "confirmed",
  },
  {
    id: "i2", invoiceNumber: "DRM-2026-0450", customerName: "سوبر ماركت الأمانة", customerCode: "CUS-0098",
    date: "2026-11-10", time: "10:02", branchName: "الجيزة", repName: "محمد رشاد",
    items: [
      { name: "شباك ٢ لتر", cartons: 25, pieces: 0, amount: 3150 },
      { name: "أكياس ٥٠×٦٠", cartons: 10, pieces: 20, amount: 624 },
    ],
    totalCartons: 35, subtotal: 3774,
    estimatedGrandTotal: 4302, paymentMethod: "آجل ١٥ يوم", status: "pending",
  },
  {
    id: "i3", invoiceNumber: "DRM-2026-0449", customerName: "مطاعم الشام", customerCode: "CUS-0233",
    date: "2026-11-09", time: "11:41", branchName: "القاهرة", repName: "كريم فؤاد",
    items: [{ name: "غطاء يد ١٨", cartons: 40, pieces: 10, amount: 3750 }],
    totalCartons: 40, subtotal: 3750,
    estimatedGrandTotal: 4275, paymentMethod: "نقدي", status: "confirmed",
  },
  {
    id: "i4", invoiceNumber: "DRM-2026-0448", customerName: "مصنع الدلتا للبلاستيك", customerCode: "CUS-0451",
    date: "2026-11-09", time: "12:15", branchName: "طنطا", repName: "أحمد سعيد",
    items: [{ name: "كاسة ١٨ لتر", cartons: 10, pieces: 0, amount: 1410 }],
    totalCartons: 10, subtotal: 1410,
    estimatedGrandTotal: 1607, paymentMethod: "شهري", status: "returned",
  },
  {
    id: "i5", invoiceNumber: "DRM-2026-0447", customerName: "فروع نجار للمنتجات الغذائية", customerCode: "CUS-0590",
    date: "2026-11-09", time: "13:08", branchName: "طنطا", repName: "عمرو حسن",
    items: [
      { name: "كاسة ١٨ لتر", cartons: 60, pieces: 0, amount: 8940 },
      { name: "جرة ١٦ لتر", cartons: 15, pieces: 0, amount: 3300 },
      { name: "غطاء يد ١٨", cartons: 20, pieces: 0, amount: 1800 },
    ],
    totalCartons: 95, subtotal: 14040,
    estimatedGrandTotal: 16006, paymentMethod: "أسبوعي", status: "confirmed",
  },
  {
    id: "i6", invoiceNumber: "DRM-2026-0446", customerName: "كافيه الركن الهادي", customerCode: "CUS-0187",
    date: "2026-11-08", time: "14:33", branchName: "الجيزة", repName: "محمد رشاد",
    items: [{ name: "أكياس ٥٠×٦٠", cartons: 20, pieces: 0, amount: 1200 }],
    totalCartons: 20, subtotal: 1200,
    estimatedGrandTotal: 1368, paymentMethod: "نقدي", status: "confirmed",
  },
  {
    id: "i7", invoiceNumber: "DRM-2026-0445", customerName: "بقالية الأمل", customerCode: "CUS-0512",
    date: "2026-11-08", time: "15:50", branchName: "المنوفية", repName: "عمرو حسن",
    items: [{ name: "قنينة ١ لتر", cartons: 30, pieces: 0, amount: 3000 }],
    totalCartons: 30, subtotal: 3000,
    estimatedGrandTotal: 3420, paymentMethod: "نقدي", status: "pending",
  },
];

/** Month-to-date summary strip. */
export function invoiceSummary(invoices: MockInvoice[]) {
  const confirmed = invoices.filter((i) => i.status === "confirmed");
  const pending = invoices.filter((i) => i.status === "pending");
  const returned = invoices.filter((i) => i.status === "returned");
  const totalValue = confirmed.reduce((s, i) => s + i.estimatedGrandTotal, 0);
  const totalCartons = confirmed.reduce((s, i) => s + i.totalCartons, 0);
  return {
    count: invoices.length,
    totalValue,
    totalCartons,
    pendingCount: pending.length,
    returnedCount: returned.length,
  };
}

export const formatEGP = (v: number) => `${v.toLocaleString("en-US")} ج.م`;

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(d);
};
