import { CustomerItemSaleRecord, CustomerItemSalesSummary } from '../types';

/**
 * طبقة تحليلات لوحة مبيعات العملاء بالصنف.
 * كل الدوال Pure وبتشتغل على نفس السجلات المفلترة بالصلاحيات
 * عشان تفضل الأرقام متسقة بين الكروت والرسوم والجداول.
 */

export const MONTH_LABELS: Record<number, string> = {
  1: 'يناير',
  2: 'فبراير',
  3: 'مارس',
  4: 'إبريل',
  5: 'مايو',
  6: 'يونيو',
  7: 'يوليو',
  8: 'أغسطس',
  9: 'سبتمبر',
  10: 'أكتوبر',
  11: 'نوفمبر',
  12: 'ديسمبر'
};

export const BRANCH_COLORS = [
  '#102b4e',
  '#c99a43',
  '#0e9f8a',
  '#1e5f9d',
  '#8b5cf6',
  '#ef7d3a',
  '#94a3b8'
];

const amountOf = (record: CustomerItemSaleRecord): number => {
  const value = Number(record.amount);
  return Number.isFinite(value) ? value : 0;
};

const quantityOf = (record: CustomerItemSaleRecord): number => {
  const value = Number(record.quantity);
  return Number.isFinite(value) ? value : 0;
};

export const sumSalesAmount = (records: CustomerItemSaleRecord[]): number =>
  records.reduce((acc, record) => acc + amountOf(record), 0);

export const sumSalesQuantity = (records: CustomerItemSaleRecord[]): number =>
  records.reduce((acc, record) => acc + quantityOf(record), 0);

/** آخر شهر فيه حركة فعلية — بنستخدمه كفترة افتراضية عند اختيار «كل الشهور». */
export function resolveLatestSalesMonth(records: CustomerItemSaleRecord[]): number | null {
  let latest: number | null = null;
  records.forEach((record) => {
    if (amountOf(record) === 0 && quantityOf(record) === 0) return;
    const month = Number(record.month);
    if (!Number.isFinite(month) || month < 1 || month > 12) return;
    if (latest === null || month > latest) latest = month;
  });
  return latest;
}

export function countDistinctOrders(records: CustomerItemSaleRecord[]): number {
  return new Set(
    records
      .map((record) => (record.salesOrder || '').trim())
      .filter((order) => order.length > 0)
  ).size;
}

export function hasSalesOrderData(records: CustomerItemSaleRecord[]): boolean {
  return records.some((record) => (record.salesOrder || '').trim().length > 0);
}

export interface PeriodComparison {
  /** الشهر المعروض (null لو كل الشهور) */
  month: number | null;
  /** الشهر اللي بنقارن بيه */
  previousMonth: number | null;
  currentAmount: number;
  previousAmount: number;
  growthPct: number | null;
  /** نمو أحدث شهر متاح — بيُعرض عند اختيار «كل الشهور» */
  latestMonthGrowthPct: number | null;
  latestMonthLabel: string;
  scopeLabel: string;
  comparisonLabel: string;
}

export function buildPeriodComparison(
  periodRecords: CustomerItemSaleRecord[],
  baseRecords: CustomerItemSaleRecord[],
  selectedMonth: number | 'all',
  latestMonth: number | null
): PeriodComparison {
  const currentAmount = sumSalesAmount(periodRecords);

  if (selectedMonth === 'all') {
    const latestAmount = latestMonth
      ? sumSalesAmount(baseRecords.filter((record) => Number(record.month) === latestMonth))
      : 0;
    const beforeLatest =
      latestMonth && latestMonth > 1
        ? sumSalesAmount(baseRecords.filter((record) => Number(record.month) === latestMonth - 1))
        : 0;
    const latestMonthGrowthPct =
      latestMonth && latestMonth > 1 && beforeLatest > 0
        ? ((latestAmount - beforeLatest) / beforeLatest) * 100
        : null;

    return {
      month: latestMonth,
      previousMonth: latestMonth && latestMonth > 1 ? latestMonth - 1 : null,
      currentAmount,
      previousAmount: 0,
      growthPct: null,
      latestMonthGrowthPct,
      latestMonthLabel: latestMonth ? MONTH_LABELS[latestMonth] : '',
      scopeLabel: 'إجمالي كل الشهور',
      comparisonLabel:
        latestMonth && latestMonth > 1
          ? `نمو ${MONTH_LABELS[latestMonth]} مقابل ${MONTH_LABELS[latestMonth - 1]}`
          : 'لا توجد فترة سابقة متاحة للمقارنة'
    };
  }

  const previousMonth = selectedMonth > 1 ? selectedMonth - 1 : null;
  const previousAmount = previousMonth
    ? sumSalesAmount(baseRecords.filter((record) => Number(record.month) === previousMonth))
    : 0;
  const growthPct =
    previousMonth && previousAmount > 0
      ? ((currentAmount - previousAmount) / previousAmount) * 100
      : null;

  return {
    month: selectedMonth,
    previousMonth,
    currentAmount,
    previousAmount,
    growthPct,
    latestMonthGrowthPct: null,
    latestMonthLabel: '',
    scopeLabel: `شهر ${MONTH_LABELS[selectedMonth] || ''}`,
    comparisonLabel: previousMonth
      ? `مقارنة بشهر ${MONTH_LABELS[previousMonth]}`
      : 'لا يوجد شهر سابق للمقارنة'
  };
}

export const growthToneClass = (growthPct: number | null): string => {
  if (growthPct === null) return 'text-slate-400 bg-slate-100 border-slate-200';
  if (growthPct > 0.5) return 'text-[var(--app-ok-text)] bg-[var(--app-ok-tint)] border-[var(--app-ok-line)]';
  if (growthPct < -0.5) return 'text-[var(--app-risk-text)] bg-[var(--app-risk-tint)] border-[var(--app-risk-line)]';
  return 'text-slate-500 bg-slate-100 border-slate-200';
};

export const formatGrowth = (growthPct: number | null): string => {
  if (growthPct === null) return '—';
  const rounded = Math.round(growthPct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('ar-EG')}%`;
};

/** اختصار أرقام محاور الرسوم: 65.3 ألف / 1.2 مليون */
export function formatCompactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} مليون`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)} ألف`;
  return Math.round(value).toLocaleString('ar-EG');
}

export function shortItemName(name: string, maxLength = 18): string {
  const clean = (name || '').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}…`;
}


export interface ItemSalesInsight {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  amount: number;
  quantity: number;
  customersCount: number;
  previousAmount: number;
  growthPct: number | null;
}

interface ItemAccumulator {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  amount: number;
  quantity: number;
  customers: Set<string>;
  previousAmount: number;
}

/** أعلى الأصناف قيمةً في الفترة، مع مقارنة بالشهر السابق (لو متاح). */
export function buildTopItemInsights(
  periodRecords: CustomerItemSaleRecord[],
  previousMonthRecords: CustomerItemSaleRecord[],
  limit = 5
): ItemSalesInsight[] {
  const map = new Map<string, ItemAccumulator>();

  const ensure = (record: CustomerItemSaleRecord): ItemAccumulator => {
    const key = record.itemCode || record.itemName || 'غير محدد';
    let entry = map.get(key);
    if (!entry) {
      entry = {
        itemCode: record.itemCode || '',
        itemName: record.itemName || 'صنف غير محدد',
        itemGroup: record.itemGroup || 'عام',
        amount: 0,
        quantity: 0,
        customers: new Set<string>(),
        previousAmount: 0
      };
      map.set(key, entry);
    }
    if (record.itemName) entry.itemName = record.itemName;
    if (record.itemGroup) entry.itemGroup = record.itemGroup;
    return entry;
  };

  periodRecords.forEach((record) => {
    const entry = ensure(record);
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    if (record.customerAccount || record.invoicingName) {
      entry.customers.add(record.customerAccount || record.invoicingName);
    }
  });

  previousMonthRecords.forEach((record) => {
    const key = record.itemCode || record.itemName || 'غير محدد';
    const entry = map.get(key);
    if (entry) entry.previousAmount += amountOf(record);
  });

  return Array.from(map.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
    .map((entry) => ({
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      itemGroup: entry.itemGroup,
      amount: entry.amount,
      quantity: entry.quantity,
      customersCount: entry.customers.size,
      previousAmount: entry.previousAmount,
      growthPct:
        entry.previousAmount > 0
          ? ((entry.amount - entry.previousAmount) / entry.previousAmount) * 100
          : null
    }));
}

export interface BranchSalesInsight {
  name: string;
  amount: number;
  quantity: number;
  customersCount: number;
  sharePct: number;
  color: string;
}

/** توزيع المبيعات على الفروع/المخازن مع تجميع الباقي في «أخرى». */
export function buildBranchInsights(
  records: CustomerItemSaleRecord[],
  maxSlices = 6
): { branches: BranchSalesInsight[]; totalAmount: number; totalCustomers: number } {
  const map = new Map<string, { amount: number; quantity: number; customers: Set<string> }>();

  records.forEach((record) => {
    const name = (record.warehouse || '').trim() || 'غير محدد';
    const entry = map.get(name) || { amount: 0, quantity: 0, customers: new Set<string>() };
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    if (record.customerAccount || record.invoicingName) {
      entry.customers.add(record.customerAccount || record.invoicingName);
    }
    map.set(name, entry);
  });

  const totalAmount = Array.from(map.values()).reduce((acc, entry) => acc + entry.amount, 0);
  const sorted = Array.from(map.entries()).sort((a, b) => b[1].amount - a[1].amount);

  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const tailAmount = tail.reduce((acc, [, entry]) => acc + entry.amount, 0);
  const tailQuantity = tail.reduce((acc, [, entry]) => acc + entry.quantity, 0);
  const tailCustomers = new Set<string>();
  tail.forEach(([, entry]) => entry.customers.forEach((customer) => tailCustomers.add(customer)));

  const branches: BranchSalesInsight[] = head.map(([name, entry], index) => ({
    name,
    amount: entry.amount,
    quantity: entry.quantity,
    customersCount: entry.customers.size,
    sharePct: totalAmount > 0 ? (entry.amount / totalAmount) * 100 : 0,
    color: BRANCH_COLORS[index % BRANCH_COLORS.length]
  }));

  if (tail.length > 0) {
    branches.push({
      name: `أخرى (${tail.length})`,
      amount: tailAmount,
      quantity: tailQuantity,
      customersCount: tailCustomers.size,
      sharePct: totalAmount > 0 ? (tailAmount / totalAmount) * 100 : 0,
      color: BRANCH_COLORS[BRANCH_COLORS.length - 1]
    });
  }

  return {
    branches,
    totalAmount,
    totalCustomers: new Set(
      records
        .map((record) => record.customerAccount || record.invoicingName)
        .filter((customer): customer is string => Boolean(customer))
    ).size
  };
}

export interface CustomerGrowth {
  currentAmount: number;
  previousAmount: number;
  growthPct: number | null;
}

/** نمو كل عميل: الشهر المحدد (أو آخر شهر) مقابل الشهر السابق له. */
export function buildCustomerGrowthMap(
  baseRecords: CustomerItemSaleRecord[],
  growthMonth: number | null
): Map<string, CustomerGrowth> {
  const map = new Map<string, CustomerGrowth>();
  if (!growthMonth) return map;

  const previousMonth = growthMonth > 1 ? growthMonth - 1 : null;

  const getEntry = (account: string): CustomerGrowth => {
    let entry = map.get(account);
    if (!entry) {
      entry = { currentAmount: 0, previousAmount: 0, growthPct: null };
      map.set(account, entry);
    }
    return entry;
  };

  baseRecords.forEach((record) => {
    const account = record.customerAccount || record.invoicingName || '';
    if (!account) return;
    const month = Number(record.month);
    if (month === growthMonth) {
      getEntry(account).currentAmount += amountOf(record);
    } else if (previousMonth && month === previousMonth) {
      getEntry(account).previousAmount += amountOf(record);
    }
  });

  map.forEach((entry) => {
    entry.growthPct =
      entry.previousAmount > 0
        ? ((entry.currentAmount - entry.previousAmount) / entry.previousAmount) * 100
        : null;
  });

  return map;
}

export interface CustomerSalesInsight {
  customerAccount: string;
  customerName: string;
  repName: string;
  warehouse: string;
  amount: number;
  quantity: number;
  itemsCount: number;
  invoicesCount: number;
  ordersAvailable: boolean;
  sharePct: number;
  growthPct: number | null;
  currentMonthAmount: number;
  previousMonthAmount: number;
  summary: CustomerItemSalesSummary;
}

export function buildCustomerInsights(
  summaries: CustomerItemSalesSummary[],
  periodRecords: CustomerItemSaleRecord[],
  growthMap: Map<string, CustomerGrowth>,
  totalAmount: number
): CustomerSalesInsight[] {
  const ordersAvailable = hasSalesOrderData(periodRecords);
  const invoiceMap = new Map<string, Set<string>>();

  periodRecords.forEach((record) => {
    const order = (record.salesOrder || '').trim();
    if (!order) return;
    const account = record.customerAccount || record.invoicingName || '';
    if (!account) return;
    const set = invoiceMap.get(account) || new Set<string>();
    set.add(order);
    invoiceMap.set(account, set);
  });

  return summaries.map((summary) => {
    const account = summary.customerAccount || summary.customerName;
    const growth = growthMap.get(account);
    const invoices = invoiceMap.get(account)?.size || 0;

    return {
      customerAccount: account,
      customerName: summary.customerName,
      repName: summary.repName,
      warehouse: summary.warehouse,
      amount: summary.totalAmount,
      quantity: summary.totalQuantity,
      itemsCount: summary.distinctItemsCount,
      invoicesCount: invoices,
      ordersAvailable,
      sharePct: totalAmount > 0 ? (summary.totalAmount / totalAmount) * 100 : 0,
      growthPct: growth?.growthPct ?? null,
      currentMonthAmount: growth?.currentAmount ?? 0,
      previousMonthAmount: growth?.previousAmount ?? 0,
      summary
    };
  });
}


export type CustomerAlertKind = 'stopped' | 'declining' | 'rising' | 'concentration';

export interface CustomerAlert {
  account: string;
  customerName: string;
  kind: CustomerAlertKind;
  title: string;
  detail: string;
  amount: number;
}

/** تنبيهات المتابعة: توقف الشراء، تراجع واضح، نمو يستحق الدعم، تركيز عالي. */
export function buildFollowUpAlerts(
  customers: CustomerSalesInsight[],
  maxAlerts = 4
): CustomerAlert[] {
  const alerts: CustomerAlert[] = [];

  customers.forEach((customer) => {
    if (customer.previousMonthAmount > 0 && customer.currentMonthAmount === 0) {
      alerts.push({
        account: customer.customerAccount,
        customerName: customer.customerName,
        kind: 'stopped',
        title: 'توقف عن الشراء',
        detail: `اشترى بقيمة ${formatCompactAmount(customer.previousMonthAmount)} في الشهر السابق`,
        amount: customer.previousMonthAmount
      });
      return;
    }

    if (customer.growthPct !== null && customer.growthPct <= -20) {
      alerts.push({
        account: customer.customerAccount,
        customerName: customer.customerName,
        kind: 'declining',
        title: `تراجع ${Math.abs(Math.round(customer.growthPct))}%`,
        detail: `من ${formatCompactAmount(customer.previousMonthAmount)} إلى ${formatCompactAmount(customer.currentMonthAmount)}`,
        amount: customer.currentMonthAmount
      });
      return;
    }

    if (customer.growthPct !== null && customer.growthPct >= 40) {
      alerts.push({
        account: customer.customerAccount,
        customerName: customer.customerName,
        kind: 'rising',
        title: `نمو ${Math.round(customer.growthPct)}%`,
        detail: 'فرصة لتوسيع الأصناف أو زيادة الكمية',
        amount: customer.currentMonthAmount
      });
      return;
    }

    if (customer.sharePct >= 35) {
      alerts.push({
        account: customer.customerAccount,
        customerName: customer.customerName,
        kind: 'concentration',
        title: 'تركيز مبيعات عالي',
        detail: `يمثل ${Math.round(customer.sharePct)}% من مبيعات الفترة`,
        amount: customer.amount
      });
    }
  });

  const priority: Record<CustomerAlertKind, number> = {
    stopped: 0,
    declining: 1,
    concentration: 2,
    rising: 3
  };

  return alerts
    .sort((a, b) => priority[a.kind] - priority[b.kind] || b.amount - a.amount)
    .slice(0, maxAlerts);
}

export interface MonthlyTrendPoint {
  month: number;
  label: string;
  amount: number;
  quantity: number;
}

export function buildMonthlyTrend(records: CustomerItemSaleRecord[]): MonthlyTrendPoint[] {
  const amounts = new Array<number>(13).fill(0);
  const quantities = new Array<number>(13).fill(0);

  records.forEach((record) => {
    const month = Number(record.month);
    if (!Number.isFinite(month) || month < 1 || month > 12) return;
    amounts[month] += amountOf(record);
    quantities[month] += quantityOf(record);
  });

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      month,
      label: MONTH_LABELS[month],
      amount: amounts[month],
      quantity: quantities[month]
    };
  });
}


export interface CustomerOrderInsight {
  salesOrder: string;
  date: string;
  amount: number;
  quantity: number;
  itemsCount: number;
}

/** آخر أوامر البيع لعميل معين من سجلات الأصناف. */
export function buildCustomerRecentOrders(
  records: CustomerItemSaleRecord[],
  customerAccount: string,
  limit = 3
): CustomerOrderInsight[] {
  const map = new Map<string, CustomerOrderInsight>();

  records.forEach((record) => {
    if ((record.customerAccount || record.invoicingName) !== customerAccount) return;
    const order = (record.salesOrder || '').trim();
    if (!order) return;

    const entry = map.get(order) || {
      salesOrder: order,
      date: record.date || '',
      amount: 0,
      quantity: 0,
      itemsCount: 0
    };
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    entry.itemsCount += 1;
    if (record.date && (!entry.date || record.date > entry.date)) entry.date = record.date;
    map.set(order, entry);
  });

  return Array.from(map.values())
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

