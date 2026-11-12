/**
 * templates/reports/data.ts
 * Mock data for the reports template (#5).
 * Structure mirrors what a real reports aggregation would return
 * (scoped to month / quarter / year).
 */

export type ReportScope = "month" | "quarter" | "year";

export const scopeLabels: Record<ReportScope, string> = {
  month: "الشهر",
  quarter: "الربع",
  year: "السنة",
};

export const scopeOrder: ReportScope[] = ["month", "quarter", "year"];

/* ------------------------- مقارنة الفترات ------------------------- */

export interface ComparisonStat {
  label: string;
  current: number;
  previous: number;
  format: "money" | "count";
}

export const comparisonStats: Record<ReportScope, ComparisonStat[]> = {
  month: [
    { label: "مبيعات الفترة", current: 486500, previous: 421300, format: "money" },
    { label: "تحصيلات الفترة", current: 402800, previous: 389400, format: "money" },
    { label: "عدد الطلبيات", current: 312, previous: 287, format: "count" },
    { label: "عملاء نشطين", current: 148, previous: 139, format: "count" },
  ],
  quarter: [
    { label: "مبيعات الفترة", current: 1398200, previous: 1256700, format: "money" },
    { label: "تحصيلات الفترة", current: 1164200, previous: 1102900, format: "money" },
    { label: "عدد الطلبيات", current: 934, previous: 876, format: "count" },
    { label: "عملاء نشطين", current: 176, previous: 158, format: "count" },
  ],
  year: [
    { label: "مبيعات الفترة", current: 5244600, previous: 4781200, format: "money" },
    { label: "تحصيلات الفترة", current: 4392700, previous: 4109500, format: "money" },
    { label: "عدد الطلبيات", current: 3518, previous: 3245, format: "count" },
    { label: "عملاء نشطين", current: 214, previous: 189, format: "count" },
  ],
};

/* ------------------------- اتجاه الفترات ------------------------- */

export interface TrendPoint {
  label: string;
  current: number;
  previous: number;
}

export const trendByScope: Record<ReportScope, TrendPoint[]> = {
  month: [
    { label: "أ1", current: 14200, previous: 13100 },
    { label: "أ2", current: 16850, previous: 15900 },
    { label: "أ3", current: 15400, previous: 14250 },
    { label: "أ4", current: 18720, previous: 16800 },
    { label: "أ5", current: 21600, previous: 19850 },
    { label: "أ6", current: 23430, previous: 20500 },
  ],
  quarter: [
    { label: "ن1", current: 214600, previous: 198300 },
    { label: "ن2", current: 232400, previous: 211500 },
    { label: "ن3", current: 228900, previous: 205700 },
    { label: "ن4", current: 241700, previous: 223400 },
    { label: "ن5", current: 256300, previous: 207900 },
    { label: "ن6", current: 224300, previous: 209900 },
  ],
  year: [
    { label: "يونيو", current: 396500, previous: 362400 },
    { label: "يوليو", current: 428700, previous: 401300 },
    { label: "أغسطس", current: 412300, previous: 389700 },
    { label: "سبتمبر", current: 456800, previous: 415200 },
    { label: "أكتوبر", current: 491200, previous: 438600 },
    { label: "نوفمبر", current: 486500, previous: 421300 },
  ],
};

/* ------------------------- أداء المناديب ------------------------- */

export interface RepRow {
  name: string;
  branch: string;
  orders: number;
  sales: number;
  collections: number;
  target: number;
}

/** أرقام واقعية لكل مندوب حسب الفترة (متضاعفة من قاعدة شهرية). */
export const repRows: Record<ReportScope, RepRow[]> = {
  month: [
    { name: "أحمد سعيد", branch: "طنطا", orders: 62, sales: 96800, collections: 84200, target: 100000 },
    { name: "محمد رشاد", branch: "الجيزة", orders: 54, sales: 84500, collections: 71300, target: 90000 },
    { name: "كريم فؤاد", branch: "القاهرة", orders: 48, sales: 76200, collections: 68800, target: 80000 },
    { name: "عمرو حسن", branch: "المنوفية", orders: 44, sales: 63400, collections: 52600, target: 70000 },
    { name: "مصطفى لبيب", branch: "المنوفية", orders: 39, sales: 58900, collections: 47100, target: 65000 },
    { name: "إسلام فتحي", branch: "طنطا", orders: 37, sales: 51200, collections: 46800, target: 60000 },
    { name: "حسن عوض", branch: "القاهرة", orders: 33, sales: 32800, collections: 21400, target: 55000 },
    { name: "طارق سمير", branch: "الجيزة", orders: 28, sales: 26700, collections: 25600, target: 50000 },
  ],
  quarter: [
    { name: "أحمد سعيد", branch: "طنطا", orders: 178, sales: 278400, collections: 241300, target: 300000 },
    { name: "محمد رشاد", branch: "الجيزة", orders: 156, sales: 243200, collections: 205600, target: 270000 },
    { name: "كريم فؤاد", branch: "القاهرة", orders: 141, sales: 219700, collections: 198100, target: 240000 },
    { name: "عمرو حسن", branch: "المنوفية", orders: 127, sales: 182300, collections: 151900, target: 210000 },
    { name: "مصطفى لبيب", branch: "المنوفية", orders: 112, sales: 169400, collections: 135800, target: 195000 },
    { name: "إسلام فتحي", branch: "طنطا", orders: 106, sales: 147600, collections: 134900, target: 180000 },
    { name: "حسن عوض", branch: "القاهرة", orders: 94, sales: 94500, collections: 61700, target: 165000 },
    { name: "طارق سمير", branch: "الجيزة", orders: 81, sales: 76900, collections: 73700, target: 150000 },
  ],
  year: [
    { name: "أحمد سعيد", branch: "طنطا", orders: 712, sales: 1113600, collections: 965200, target: 1200000 },
    { name: "محمد رشاد", branch: "الجيزة", orders: 624, sales: 972800, collections: 822400, target: 1080000 },
    { name: "كريم فؤاد", branch: "القاهرة", orders: 564, sales: 878800, collections: 792400, target: 960000 },
    { name: "عمرو حسن", branch: "المنوفية", orders: 508, sales: 729200, collections: 607600, target: 840000 },
    { name: "مصطفى لبيب", branch: "المنوفية", orders: 448, sales: 677600, collections: 543200, target: 780000 },
    { name: "إسلام فتحي", branch: "طنطا", orders: 424, sales: 590400, collections: 539600, target: 720000 },
    { name: "حسن عوض", branch: "القاهرة", orders: 376, sales: 378000, collections: 246800, target: 660000 },
    { name: "طارق سمير", branch: "الجيزة", orders: 324, sales: 307600, collections: 294800, target: 600000 },
  ],
};

/* ------------------------- مساعدات ------------------------- */

export const formatEGP = (v: number) => `${v.toLocaleString("en-US")} ج.م`;

export const formatCompact = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}م`;
  if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
  return String(v);
};

/** نسبة التغير بين الفترة الحالية والسابقة (مقبولة للعرض). */
export const deltaPct = (current: number, previous: number) => {
  if (!previous) return 0;
  return Math.round(((current - previous) / previous) * 100);
};

/** نسبة تحقيق التارجت للمندوب. */
export const targetPct = (r: RepRow) =>
  r.target > 0 ? Math.min(100, Math.round((r.sales / r.target) * 100)) : 0;

/** نسبة التحصيل من المبيعات. */
export const collectionPct = (r: RepRow) =>
  r.sales > 0 ? Math.round((r.collections / r.sales) * 100) : 0;
