/**
 * templates/customers/data.ts
 * Mock customers for the list+detail template.
 * Mirrors the real `Customer` shape (types.ts) — fields we actually display —
 * so swapping mock → Supabase is a straight replacement.
 */

export type CustomerStatus = "active" | "inactive" | "churn_risk" | "new_customer";
export type CustomerTier = "مميز" | "راقي" | "متوسط" | "عادي";

export interface MockCustomer {
  id: string;
  code: string;
  name: string;
  storeName?: string;
  tier: CustomerTier;
  phone: string;
  region: string;
  branchName: string;
  repName: string;
  supervisorName: string;
  status: CustomerStatus;
  totalSpent: number;
  overdueBalance: number;
  totalOrdersCount: number;
  lastOrderDate: string;
  lastCollectionDate: string;
  lastCollectionAmount: number;
  creditLimit: number;
  paymentTerms: string;
  guaranteeDocs: string;
  activityType: string;
  monthlySales2026: number[]; // 12 شهر (يناير → ديسمبر)
}

export const customerStatusLabels: Record<CustomerStatus, string> = {
  active: "نشط",
  inactive: "غير نشط",
  churn_risk: "خطر توقف",
  new_customer: "عميل جديد",
};

export const customerFilters: { key: "all" | CustomerStatus; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "churn_risk", label: "خطر توقف" },
  { key: "new_customer", label: "جديد" },
  { key: "inactive", label: "غير نشط" },
];

export const monthLabels = [
  "ينا", "فبر", "مار", "أبر", "ماي", "يون",
  "يول", "أغس", "سبت", "أكت", "نوف", "ديس",
];

export const mockCustomers: MockCustomer[] = [
  {
    id: "c1", code: "CUS-0121", name: "مخابز النور", storeName: "سلسلة مخابز",
    tier: "مميز", phone: "01001234567", region: "طنطا - شارع البحر",
    branchName: "طنطا", repName: "أحمد سعيد", supervisorName: "محمود السيد",
    status: "active", totalSpent: 214000, overdueBalance: 0, totalOrdersCount: 142,
    lastOrderDate: "2026-11-09", lastCollectionDate: "2026-11-08", lastCollectionAmount: 12500,
    creditLimit: 50000, paymentTerms: "أسبوعي", guaranteeDocs: "شيك", activityType: "جملة",
    monthlySales2026: [14500, 16200, 15800, 17100, 18400, 19200, 17800, 16900, 18100, 19500, 20600, 21500],
  },
  {
    id: "c2", code: "CUS-0098", name: "سوبر ماركت الأمانة", storeName: "سوبر ماركت",
    tier: "مميز", phone: "01009876543", region: "الجيزة - فيصل",
    branchName: "الجيزة", repName: "محمد رشاد", supervisorName: "هاني شريف",
    status: "active", totalSpent: 168300, overdueBalance: 2400, totalOrdersCount: 98,
    lastOrderDate: "2026-11-10", lastCollectionDate: "2026-11-05", lastCollectionAmount: 8200,
    creditLimit: 35000, paymentTerms: "آجل ١٥ يوم", guaranteeDocs: "إيصال أمانة", activityType: "قطاعي",
    monthlySales2026: [11200, 12800, 13400, 12100, 13900, 14200, 15100, 13800, 12900, 14400, 15200, 16100],
  },
  {
    id: "c3", code: "CUS-0233", name: "مطاعم الشام", storeName: "مجموعة مطاعم",
    tier: "راقي", phone: "01066554433", region: "القاهرة - مدينة نصر",
    branchName: "القاهرة", repName: "كريم فؤاد", supervisorName: "محمود السيد",
    status: "active", totalSpent: 131500, overdueBalance: 0, totalOrdersCount: 76,
    lastOrderDate: "2026-11-07", lastCollectionDate: "2026-11-06", lastCollectionAmount: 6400,
    creditLimit: 30000, paymentTerms: "نقدي", guaranteeDocs: "بدون", activityType: "قطاعي",
    monthlySales2026: [8900, 9800, 10400, 11200, 11800, 12500, 12100, 11600, 12300, 12800, 13100, 13500],
  },
  {
    id: "c4", code: "CUS-0451", name: "مصنع الدلتا للبلاستيك", storeName: "مصنع",
    tier: "مميز", phone: "01044556677", region: "طنطا - المنطقة الصناعية",
    branchName: "طنطا", repName: "أحمد سعيد", supervisorName: "محمود السيد",
    status: "churn_risk", totalSpent: 96800, overdueBalance: 18700, totalOrdersCount: 54,
    lastOrderDate: "2026-09-28", lastCollectionDate: "2026-09-15", lastCollectionAmount: 3000,
    creditLimit: 60000, paymentTerms: "شهري", guaranteeDocs: "كمبيالة", activityType: "توكيلات",
    monthlySales2026: [9200, 10500, 9800, 8900, 7600, 6800, 5900, 5200, 4100, 2800, 1400, 0],
  },
  {
    id: "c5", code: "CUS-0512", name: "بقالية الأمل", storeName: "بقالة",
    tier: "عادي", phone: "01077889900", region: "المنوفية - شبين الكوم",
    branchName: "المنوفية", repName: "عمرو حسن", supervisorName: "وليد طارق",
    status: "new_customer", totalSpent: 12400, overdueBalance: 0, totalOrdersCount: 6,
    lastOrderDate: "2026-11-08", lastCollectionDate: "2026-11-08", lastCollectionAmount: 1200,
    creditLimit: 10000, paymentTerms: "نقدي", guaranteeDocs: "بدون", activityType: "قطاعي",
    monthlySales2026: [0, 0, 0, 0, 0, 0, 0, 0, 3200, 3800, 2600, 2800],
  },
  {
    id: "c6", code: "CUS-0187", name: "كافيه الركن الهادي", storeName: "كافيه",
    tier: "متوسط", phone: "01011223344", region: "الجيزة - الدقي",
    branchName: "الجيزة", repName: "محمد رشاد", supervisorName: "هاني شريف",
    status: "active", totalSpent: 47800, overdueBalance: 850, totalOrdersCount: 31,
    lastOrderDate: "2026-11-05", lastCollectionDate: "2026-11-01", lastCollectionAmount: 2400,
    creditLimit: 15000, paymentTerms: "أسبوعي", guaranteeDocs: "بدون", activityType: "قطاعي",
    monthlySales2026: [3100, 3600, 4200, 3900, 4400, 4800, 5100, 4600, 4300, 4700, 4900, 5200],
  },
  {
    id: "c7", code: "CUS-0366", name: "معرض الصفا للاثاث", storeName: "معرض",
    tier: "متوسط", phone: "01099887766", region: "القاهرة - المهندسين",
    branchName: "القاهرة", repName: "كريم فؤاد", supervisorName: "محمود السيد",
    status: "inactive", totalSpent: 28600, overdueBalance: 5300, totalOrdersCount: 18,
    lastOrderDate: "2026-08-19", lastCollectionDate: "2026-08-10", lastCollectionAmount: 1800,
    creditLimit: 20000, paymentTerms: "آجل ٣٠ يوم", guaranteeDocs: "رهن", activityType: "قطاعي",
    monthlySales2026: [2600, 2900, 3100, 2800, 2400, 1900, 1500, 900, 0, 0, 0, 0],
  },
  {
    id: "c8", code: "CUS-0590", name: "فروع نجار للمنتجات الغذائية", storeName: "جملة",
    tier: "مميز", phone: "01022334455", region: "طنطا - سوق الجمعة",
    branchName: "طنطا", repName: "عمرو حسن", supervisorName: "وليد طارق",
    status: "active", totalSpent: 189200, overdueBalance: 1250, totalOrdersCount: 121,
    lastOrderDate: "2026-11-09", lastCollectionDate: "2026-11-07", lastCollectionAmount: 9800,
    creditLimit: 45000, paymentTerms: "أسبوعي", guaranteeDocs: "شيك", activityType: "جملة",
    monthlySales2026: [12800, 13400, 14200, 13800, 14600, 15100, 15900, 14800, 15200, 15600, 16200, 16800],
  },
];

export interface MockCustomerOrder {
  id: string;
  customerId: string;
  date: string;
  items: string;
  amount: number;
  status: "confirmed" | "pending" | "returned";
}

export const mockOrders: MockCustomerOrder[] = [
  { id: "ORD-2451", customerId: "c1", date: "2026-11-09", items: "كاسة ١٨ لتر × ٤٠، قنينة ١ لتر × ٢٠", amount: 9400, status: "confirmed" },
  { id: "ORD-2438", customerId: "c1", date: "2026-11-02", items: "كاسة ١٨ لتر × ٣٥، أكياس × ١٠", amount: 8100, status: "confirmed" },
  { id: "ORD-2426", customerId: "c1", date: "2026-10-26", items: "غطاء يد × ٣٠", amount: 2700, status: "confirmed" },
  { id: "ORD-2450", customerId: "c2", date: "2026-11-10", items: "قنينة ١ لتر × ٥٠، أكياس × ١٥", amount: 7200, status: "pending" },
  { id: "ORD-2441", customerId: "c2", date: "2026-11-03", items: "كاسة ١٨ لتر × ٢٥", amount: 5900, status: "confirmed" },
  { id: "ORD-2449", customerId: "c3", date: "2026-11-07", items: "أغطية × ٤٠، أكياس × ٢٥", amount: 5200, status: "confirmed" },
  { id: "ORD-2448", customerId: "c4", date: "2026-11-01", items: "كاسة ١٨ لتر × ١٠", amount: 1340, status: "returned" },
  { id: "ORD-2452", customerId: "c5", date: "2026-11-08", items: "قنينة ١ لتر × ٣٠", amount: 2800, status: "pending" },
  { id: "ORD-2447", customerId: "c6", date: "2026-11-05", items: "أكياس × ٢٠، أغطية × ١٠", amount: 1900, status: "confirmed" },
  { id: "ORD-2453", customerId: "c8", date: "2026-11-09", items: "كاسة ١٨ لتر × ٦٠، قنينة × ٤٠", amount: 12600, status: "confirmed" },
];

export interface MockCustomerVisit {
  customerId: string;
  date: string;
  note: string;
  outcome: "order" | "collection" | "follow_up";
}

export const mockVisits: MockCustomerVisit[] = [
  { customerId: "c1", date: "2026-11-09", note: "زيارة أسبوعية — طلبيت كاملة", outcome: "order" },
  { customerId: "c1", date: "2026-11-08", note: "تحصيل ١٢٥٠٠ ج.م", outcome: "collection" },
  { customerId: "c2", date: "2026-11-10", note: "طلبية جديدة بانتظار التأكيد", outcome: "order" },
  { customerId: "c4", date: "2026-11-01", note: "متابعة سداد المتأخرات — وعد بأسبوع", outcome: "follow_up" },
  { customerId: "c5", date: "2026-11-08", note: "أول زيارة — استقبال جيد", outcome: "order" },
];
