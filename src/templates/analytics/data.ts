/**
 * templates/analytics/data.ts
 * Mock analytics data for the executive dashboard template.
 * Mirrors the shape of the real Supabase tables (orders, visits, customers)
 * so swapping mock → live data later is a straight replacement.
 */

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "flat";
  tone: "primary" | "success" | "warning" | "error";
}

export type PeriodKey = "today" | "week" | "month" | "quarter";

export const periodLabels: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "اليوم" },
  { key: "week", label: "الأسبوع" },
  { key: "month", label: "الشهر" },
  { key: "quarter", label: "الربع" },
];

export const kpisByPeriod: Record<PeriodKey, KpiItem[]> = {
  today: [
    { id: "sales", label: "مبيعات اليوم", value: "18,450 ج.م", delta: "+8.2% عن الأمس", direction: "up", tone: "primary" },
    { id: "collections", label: "تحصيلات", value: "12,300 ج.م", delta: "+3 طلبية", direction: "up", tone: "success" },
    { id: "returns", label: "مرتجعات", value: "890 ج.م", delta: "-12% عن الأمس", direction: "down", tone: "warning" },
    { id: "pending", label: "طلبيات معلقة", value: "14", delta: "3 بانتظار التأكيد", direction: "flat", tone: "error" },
  ],
  week: [
    { id: "sales", label: "مبيعات الأسبوع", value: "112,700 ج.م", delta: "+5.4% عن الأسبوع الماضي", direction: "up", tone: "primary" },
    { id: "collections", label: "تحصيلات", value: "84,150 ج.م", delta: "+21 طلبية", direction: "up", tone: "success" },
    { id: "returns", label: "مرتجعات", value: "5,340 ج.م", delta: "-2.1%", direction: "down", tone: "warning" },
    { id: "pending", label: "طلبيات معلقة", value: "38", delta: "9 بانتظار التأكيد", direction: "flat", tone: "error" },
  ],
  month: [
    { id: "sales", label: "مبيعات الشهر", value: "486,200 ج.م", delta: "+11.8% عن الشهر الماضي", direction: "up", tone: "primary" },
    { id: "collections", label: "تحصيلات", value: "391,000 ج.م", delta: "تحصيل 80%", direction: "up", tone: "success" },
    { id: "returns", label: "مرتجعات", value: "21,480 ج.م", delta: "-4.4%", direction: "down", tone: "warning" },
    { id: "pending", label: "طلبيات معلقة", value: "126", delta: "22 بانتظار التأكيد", direction: "flat", tone: "error" },
  ],
  quarter: [
    { id: "sales", label: "مبيعات الربع", value: "1,418,900 ج.م", delta: "+9.6% عن الربع الماضي", direction: "up", tone: "primary" },
    { id: "collections", label: "تحصيلات", value: "1,132,400 ج.م", delta: "تحصيل 79.8%", direction: "up", tone: "success" },
    { id: "returns", label: "مرتجعات", value: "64,250 ج.م", delta: "-6.2%", direction: "down", tone: "warning" },
    { id: "pending", label: "طلبيات معلقة", value: "347", delta: "51 بانتظار التأكيد", direction: "flat", tone: "error" },
  ],
};

export interface TrendPoint {
  label: string;
  sales: number;
  collections: number;
}

export const trendByPeriod: Record<PeriodKey, TrendPoint[]> = {
  today: [
    { label: "٩ص", sales: 1200, collections: 800 },
    { label: "١٠ص", sales: 2400, collections: 1600 },
    { label: "١١ص", sales: 3100, collections: 2100 },
    { label: "١٢م", sales: 2800, collections: 1900 },
    { label: "١م", sales: 3600, collections: 2500 },
    { label: "٢م", sales: 4200, collections: 3100 },
    { label: "٣م", sales: 1150, collections: 300 },
  ],
  week: [
    { label: "السبت", sales: 14200, collections: 10800 },
    { label: "الأحد", sales: 18600, collections: 14200 },
    { label: "الاثنين", sales: 15400, collections: 11800 },
    { label: "الثلاثاء", sales: 22100, collections: 17400 },
    { label: "الأربعاء", sales: 19800, collections: 15100 },
    { label: "الخميس", sales: 12600, collections: 9200 },
    { label: "الجمعة", sales: 10000, collections: 5650 },
  ],
  month: [
    { label: "الأسبوع 1", sales: 118000, collections: 94000 },
    { label: "الأسبوع 2", sales: 132400, collections: 101200 },
    { label: "الأسبوع 3", sales: 121800, collections: 97600 },
    { label: "الأسبوع 4", sales: 114000, collections: 98200 },
  ],
  quarter: [
    { label: "الشهر 1", sales: 438000, collections: 352000 },
    { label: "الشهر 2", sales: 492600, collections: 398400 },
    { label: "الشهر 3", sales: 488300, collections: 382000 },
  ],
};

export interface BranchPoint {
  name: string;
  sales: number;
  target: number;
}

export const branchPerformance: BranchPoint[] = [
  { name: "طنطا", sales: 168, target: 150 },
  { name: "القاهرة", sales: 142, target: 160 },
  { name: "الجيزة", sales: 118, target: 110 },
  { name: "المنوفية", sales: 58, target: 70 },
];

export interface MixSlice {
  name: string;
  value: number;
  color: "primary" | "secondary" | "success" | "violet";
}

export const productMix: MixSlice[] = [
  { name: "كاسات", value: 42, color: "primary" },
  { name: "قنينات", value: 26, color: "secondary" },
  { name: "أغطية", value: 19, color: "success" },
  { name: "أكياس", value: 13, color: "violet" },
];

export interface TopItem {
  name: string;
  units: string;
  revenue: string;
  trend: "up" | "down" | "flat";
}

export const topProducts: TopItem[] = [
  { name: "كاسة ١٨ لتر", units: "3,240 كارتون", revenue: "486,000 ج.م", trend: "up" },
  { name: "قنينة ١ لتر", units: "2,880 كارتون", revenue: "288,000 ج.م", trend: "up" },
  { name: "غطاء يد", units: "1,940 كارتون", revenue: "174,600 ج.م", trend: "flat" },
  { name: "كيس تغليف ٥٠×٦٠", units: "1,420 كارتون", revenue: "85,200 ج.م", trend: "down" },
];

export const topCustomers: TopItem[] = [
  { name: "مخابز النور", units: "142 فاتورة", revenue: "214,000 ج.م", trend: "up" },
  { name: "سوبر ماركت الأمانة", units: "98 فاتورة", revenue: "168,300 ج.م", trend: "up" },
  { name: "مطاعم الشام", units: "76 فاتورة", revenue: "131,500 ج.م", trend: "flat" },
  { name: "مصنع الدلتا للبلاستيك", units: "54 فاتورة", revenue: "96,800 ج.م", trend: "down" },
];

export interface RecentOrder {
  id: string;
  customer: string;
  branch: string;
  amount: string;
  status: "confirmed" | "pending" | "returned";
  time: string;
}

export const recentOrders: RecentOrder[] = [
  { id: "ORD-2451", customer: "مخابز النور", branch: "طنطا", amount: "12,400 ج.م", status: "confirmed", time: "منذ ١٢ د" },
  { id: "ORD-2450", customer: "سوبر ماركت الأمانة", branch: "الجيزة", amount: "8,750 ج.م", status: "pending", time: "منذ ٢٥ د" },
  { id: "ORD-2449", customer: "مطاعم الشام", branch: "القاهرة", amount: "5,200 ج.م", status: "confirmed", time: "منذ ٤٠ د" },
  { id: "ORD-2448", customer: "مصنع الدلتا للبلاستيك", branch: "طنطا", amount: "1,340 ج.م", status: "returned", time: "منذ ١ س" },
];

export const orderStatusLabels: Record<RecentOrder["status"], string> = {
  confirmed: "مؤكدة",
  pending: "معلقة",
  returned: "مرتجعة",
};
