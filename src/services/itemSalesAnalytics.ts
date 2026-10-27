import { CustomerItemSaleRecord, Product } from '../types';
import { MONTH_LABELS, sumSalesAmount, sumSalesQuantity } from './customerItemSalesInsights';
import { normalizeProductCodeKey } from './productIdentity';

/**
 * طبقة تحليلات لوحة «مبيعات الأصناف» (Item-centric dashboard).
 *
 * كل الدوال Pure وبتشتغل على نفس السجلات المفلترة بالصلاحيات، عشان الأرقام
 * تفضل متسقة بين الكروت والرسوم والجداول. مفيش أي اعتماد على تصميم الواجهة.
 */

export const GROUP_COLORS = [
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

const monthOf = (record: CustomerItemSaleRecord): number => {
  const value = Number(record.month);
  return Number.isFinite(value) && value >= 1 && value <= 12 ? value : 0;
};

const itemKeyOf = (record: CustomerItemSaleRecord): string =>
  (record.itemCode || record.itemName || '').trim() || 'غير محدد';

const customerKeyOf = (record: CustomerItemSaleRecord): string =>
  (record.customerAccount || record.invoicingName || '').trim();

/**
 * مجموعة/فئة الصنف المعتمدة للعرض.
 * الأولوية لعمود «التعريفات» لأنه هو التصنيف الحقيقي في شيت الـ ERP
 * (Item group عندهم بيكون «عام» لكل الصفوف فمش مفيد)، وبعده Item group
 * ثم Family Dimension.
 */
export function resolveItemGroup(record: CustomerItemSaleRecord): string {
  const definitions = (record.definitions || '').trim();
  if (definitions) return definitions;
  const group = (record.itemGroup || '').trim();
  if (group && group !== 'عام') return group;
  const family = (record.familyDimension || '').trim();
  if (family && family !== 'عام') return family;
  return 'عام';
}

export const growthPct = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

/* ------------------------------------------------------------------ */
/* 1) توزيع المبيعات حسب الفئات (Donut)                                */
/* ------------------------------------------------------------------ */

export interface GroupShareInsight {
  name: string;
  amount: number;
  quantity: number;
  itemsCount: number;
  customersCount: number;
  sharePct: number;
  color: string;
}

export interface GroupMixResult {
  groups: GroupShareInsight[];
  totalAmount: number;
  totalQuantity: number;
  totalItems: number;
}

export function buildGroupInsights(
  records: CustomerItemSaleRecord[],
  maxSlices = 6
): GroupMixResult {
  const map = new Map<
    string,
    { amount: number; quantity: number; items: Set<string>; customers: Set<string> }
  >();

  records.forEach((record) => {
    const name = resolveItemGroup(record);
    const entry =
      map.get(name) ||
      { amount: 0, quantity: 0, items: new Set<string>(), customers: new Set<string>() };
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    entry.items.add(itemKeyOf(record));
    const customer = customerKeyOf(record);
    if (customer) entry.customers.add(customer);
    map.set(name, entry);
  });

  const totalAmount = Array.from(map.values()).reduce((acc, entry) => acc + entry.amount, 0);
  const allItems = new Set<string>();
  records.forEach((record) => allItems.add(itemKeyOf(record)));

  const sorted = Array.from(map.entries()).sort((a, b) => b[1].amount - a[1].amount);
  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const tailAmount = tail.reduce((acc, [, entry]) => acc + entry.amount, 0);
  const tailQuantity = tail.reduce((acc, [, entry]) => acc + entry.quantity, 0);
  const tailItems = new Set<string>();
  const tailCustomers = new Set<string>();
  tail.forEach(([, entry]) => {
    entry.items.forEach((item) => tailItems.add(item));
    entry.customers.forEach((customer) => tailCustomers.add(customer));
  });

  const groups: GroupShareInsight[] = head.map(([name, entry], index) => ({
    name,
    amount: entry.amount,
    quantity: entry.quantity,
    itemsCount: entry.items.size,
    customersCount: entry.customers.size,
    sharePct: totalAmount > 0 ? (entry.amount / totalAmount) * 100 : 0,
    color: GROUP_COLORS[index % GROUP_COLORS.length]
  }));

  if (tail.length > 0) {
    groups.push({
      name: `أخرى (${tail.length})`,
      amount: tailAmount,
      quantity: tailQuantity,
      itemsCount: tailItems.size,
      customersCount: tailCustomers.size,
      sharePct: totalAmount > 0 ? (tailAmount / totalAmount) * 100 : 0,
      color: GROUP_COLORS[GROUP_COLORS.length - 1]
    });
  }

  return {
    groups,
    totalAmount,
    totalQuantity: sumSalesQuantity(records),
    totalItems: allItems.size
  };
}
/* ------------------------------------------------------------------ */
/* 2) ترتيب الأصناف (أعلى قيمة / أعلى كمية / أقل حركة)                 */
/* ------------------------------------------------------------------ */

export type ItemRankingMetric = 'amount' | 'quantity';

export interface ItemRankingRow {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  unit: string;
  amount: number;
  quantity: number;
  customersCount: number;
  sharePct: number;
  growthPct: number | null;
  /** آخر شهر فيه حركة بيع للصنف داخل النطاق الكامل */
  lastMonth: number | null;
  lastMonthLabel: string;
}

interface ItemAccumulator {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  unit: string;
  amount: number;
  quantity: number;
  customers: Set<string>;
  lastMonth: number | null;
}

function accumulateItems(records: CustomerItemSaleRecord[]): Map<string, ItemAccumulator> {
  const map = new Map<string, ItemAccumulator>();

  records.forEach((record) => {
    const key = itemKeyOf(record);
    const entry: ItemAccumulator =
      map.get(key) || {
        itemCode: record.itemCode || '',
        itemName: record.itemName || record.definitions || 'صنف غير محدد',
        itemGroup: resolveItemGroup(record),
        unit: record.unit || 'وحدة',
        amount: 0,
        quantity: 0,
        customers: new Set<string>(),
        lastMonth: null
      };

    if (record.itemName) entry.itemName = record.itemName;
    if (record.unit) entry.unit = record.unit;
    entry.itemGroup = resolveItemGroup(record);
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    const customer = customerKeyOf(record);
    if (customer) entry.customers.add(customer);
    const month = monthOf(record);
    if (month > 0 && (entry.lastMonth === null || month > entry.lastMonth)) {
      entry.lastMonth = month;
    }
    map.set(key, entry);
  });

  return map;
}

export interface BuildItemRankingOptions {
  metric?: ItemRankingMetric;
  limit?: number;
  order?: 'desc' | 'asc';
  /** استبعاد الأصناف اللي مفيهاش أي حركة (افتراضي: نعم) */
  excludeZero?: boolean;
}

export function buildItemRanking(
  records: CustomerItemSaleRecord[],
  previousRecords: CustomerItemSaleRecord[] = [],
  options: BuildItemRankingOptions = {}
): ItemRankingRow[] {
  const { metric = 'amount', limit = 10, order = 'desc', excludeZero = true } = options;

  const current = accumulateItems(records);
  const previous = accumulateItems(previousRecords);
  const total = Array.from(current.values()).reduce(
    (acc, entry) => acc + (metric === 'quantity' ? entry.quantity : entry.amount),
    0
  );

  const rows: ItemRankingRow[] = Array.from(current.entries()).map(([key, entry]) => {
    const previousEntry = previous.get(key);
    const previousValue = previousEntry
      ? metric === 'quantity'
        ? previousEntry.quantity
        : previousEntry.amount
      : 0;
    const value = metric === 'quantity' ? entry.quantity : entry.amount;

    return {
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      itemGroup: entry.itemGroup,
      unit: entry.unit,
      amount: entry.amount,
      quantity: entry.quantity,
      customersCount: entry.customers.size,
      sharePct: total > 0 ? (value / total) * 100 : 0,
      growthPct: growthPct(value, previousValue),
      lastMonth: entry.lastMonth,
      lastMonthLabel: entry.lastMonth ? MONTH_LABELS[entry.lastMonth] : '—'
    };
  });

  const filtered = excludeZero
    ? rows.filter((row) => (metric === 'quantity' ? row.quantity : row.amount) > 0)
    : rows;

  filtered.sort((a, b) => {
    const first = metric === 'quantity' ? a.quantity : a.amount;
    const second = metric === 'quantity' ? b.quantity : b.amount;
    return order === 'asc' ? first - second : second - first;
  });

  return filtered.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 3) الأداء الشهري (آخر 6 أشهر)                                      */
/* ------------------------------------------------------------------ */

export interface MonthlyPerformancePoint {
  month: number;
  label: string;
  amount: number;
  quantity: number;
  orders: number;
  itemsCount: number;
  customersCount: number;
}

export function buildMonthlyPerformance(
  records: CustomerItemSaleRecord[],
  months = 6
): MonthlyPerformancePoint[] {
  const amounts = new Array<number>(13).fill(0);
  const quantities = new Array<number>(13).fill(0);
  const orders = Array.from({ length: 13 }, () => new Set<string>());
  const items = Array.from({ length: 13 }, () => new Set<string>());
  const customers = Array.from({ length: 13 }, () => new Set<string>());
  let latest = 0;

  records.forEach((record) => {
    const month = monthOf(record);
    if (!month) return;
    amounts[month] += amountOf(record);
    quantities[month] += quantityOf(record);
    const order = (record.salesOrder || '').trim();
    if (order) orders[month].add(order);
    items[month].add(itemKeyOf(record));
    const customer = customerKeyOf(record);
    if (customer) customers[month].add(customer);
    if (amounts[month] > 0 || quantities[month] > 0 || orders[month].size > 0) {
      if (month > latest) latest = month;
    }
  });

  const endMonth = latest > 0 ? latest : 12;
  const points: MonthlyPerformancePoint[] = [];

  for (let month = 1; month <= endMonth; month += 1) {
    points.push({
      month,
      label: MONTH_LABELS[month],
      amount: amounts[month],
      quantity: quantities[month],
      orders: orders[month].size,
      itemsCount: items[month].size,
      customersCount: customers[month].size
    });
  }

  return points.slice(-Math.max(1, months));
}



/* ------------------------------------------------------------------ */
/* 4) التحليل الشهري للعملاء (جدول)                                    */
/* ------------------------------------------------------------------ */

export interface MonthlyCustomerRow {
  month: number;
  label: string;
  orders: number;
  amount: number;
  quantity: number;
  itemsCount: number;
  customersCount: number;
  growthPct: number | null;
}

export function buildMonthlyCustomerAnalysis(
  records: CustomerItemSaleRecord[]
): MonthlyCustomerRow[] {
  const amounts = new Array<number>(13).fill(0);
  const quantities = new Array<number>(13).fill(0);
  const orders = Array.from({ length: 13 }, () => new Set<string>());
  const items = Array.from({ length: 13 }, () => new Set<string>());
  const customers = Array.from({ length: 13 }, () => new Set<string>());

  records.forEach((record) => {
    const month = monthOf(record);
    if (!month) return;
    amounts[month] += amountOf(record);
    quantities[month] += quantityOf(record);
    const order = (record.salesOrder || '').trim();
    if (order) orders[month].add(order);
    items[month].add(itemKeyOf(record));
    const customer = customerKeyOf(record);
    if (customer) customers[month].add(customer);
  });

  const rows: MonthlyCustomerRow[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const hasData = amounts[month] > 0 || quantities[month] > 0 || orders[month].size > 0;
    if (!hasData) continue;
    const previousAmount = month > 1 ? amounts[month - 1] : 0;

    rows.push({
      month,
      label: MONTH_LABELS[month],
      orders: orders[month].size,
      amount: amounts[month],
      quantity: quantities[month],
      itemsCount: items[month].size,
      customersCount: customers[month].size,
      growthPct: growthPct(amounts[month], previousAmount)
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* 5) أداء المناديب                                                    */
/* ------------------------------------------------------------------ */

export interface RepPerformanceInsight {
  repName: string;
  amount: number;
  quantity: number;
  orders: number;
  customersCount: number;
  itemsCount: number;
  sharePct: number;
}

export function buildRepPerformance(
  records: CustomerItemSaleRecord[],
  limit = 6
): RepPerformanceInsight[] {
  const map = new Map<
    string,
    {
      amount: number;
      quantity: number;
      orders: Set<string>;
      customers: Set<string>;
      items: Set<string>;
    }
  >();

  records.forEach((record) => {
    const name = (record.repName || 'غير محدد').trim() || 'غير محدد';
    const entry =
      map.get(name) ||
      { amount: 0, quantity: 0, orders: new Set<string>(), customers: new Set<string>(), items: new Set<string>() };
    entry.amount += amountOf(record);
    entry.quantity += quantityOf(record);
    const order = (record.salesOrder || '').trim();
    if (order) entry.orders.add(order);
    const customer = customerKeyOf(record);
    if (customer) entry.customers.add(customer);
    entry.items.add(itemKeyOf(record));
    map.set(name, entry);
  });

  const total = Array.from(map.values()).reduce((acc, entry) => acc + entry.amount, 0);

  return Array.from(map.entries())
    .map(([repName, entry]) => ({
      repName,
      amount: entry.amount,
      quantity: entry.quantity,
      orders: entry.orders.size,
      customersCount: entry.customers.size,
      itemsCount: entry.items.size,
      sharePct: total > 0 ? (entry.amount / total) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 6) الأصناف الراكدة / بدون حركة                                      */
/* ------------------------------------------------------------------ */

export interface IdleItemInsight {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  stock: number;
  status: string;
  lastMonth: number | null;
  lastMonthLabel: string;
}

export interface IdleItemsResult {
  items: IdleItemInsight[];
  /** عدد الأصناف اللي عليها رصيد وبدون أي حركة في الفترة */
  totalIdle: number;
  /** عدد أصناف الكتالوج اللي عليها رصيد فعلي */
  catalogWithStock: number;
  /** هل الحساب اتعمل من الكتالوج ولا من سجل المبيعات (الكتالوج فاضي) */
  source: 'catalog' | 'sales-history' | 'none';
}

const productStockOf = (product: Product): number =>
  (Number(product.branchStockActual) || 0) + (Number(product.mainWarehouseActual) || 0);

/**
 * الأصناف الراكدة = أصناف الكتالوج اللي عليها رصيد فعلي وبدون أي حركة بيع
 * في الفترة المحددة. لو الكتالوج غير محمّل، بنرجع لأصناف اتباعت قبل كده
 * واختفت من الفترة الحالية (مؤشر توقف حركة).
 */
export function buildIdleItems(
  periodRecords: CustomerItemSaleRecord[],
  allRecords: CustomerItemSaleRecord[],
  products: Product[],
  limit = 6
): IdleItemsResult {
  const soldInPeriod = new Set<string>();
  periodRecords.forEach((record) => {
    const key = itemKeyOf(record);
    soldInPeriod.add(key);
    if (record.itemCode) soldInPeriod.add(record.itemCode.trim());
  });

  const lastSoldByCode = new Map<string, number>();
  allRecords.forEach((record) => {
    const code = (record.itemCode || '').trim();
    if (!code) return;
    const month = monthOf(record);
    if (!month) return;
    const previous = lastSoldByCode.get(code);
    if (previous === undefined || month > previous) lastSoldByCode.set(code, month);
  });

  const catalogMap = new Map<string, IdleItemInsight>();
  let catalogWithStock = 0;

  (products || []).forEach((product) => {
    const stock = productStockOf(product);
    if (stock <= 0) return;
    const code = (product.code || '').trim();
    if (!code) return;
    const identity = normalizeProductCodeKey(product.unifiedCode || product.code) || code;
    if (catalogMap.has(identity)) return;
    catalogWithStock += 1;
    if (soldInPeriod.has(code) || soldInPeriod.has(identity)) return;
    const lastMonth = lastSoldByCode.get(code) ?? null;
    catalogMap.set(identity, {
      itemCode: code,
      itemName: product.name || 'صنف غير محدد',
      itemGroup: (product.itemGroup || product.category || product.department || 'عام').trim() || 'عام',
      stock,
      status: product.status || '—',
      lastMonth,
      lastMonthLabel: lastMonth ? MONTH_LABELS[lastMonth] : 'لم يُبع'
    });
  });

  if (catalogWithStock > 0) {
    const items = Array.from(catalogMap.values())
      .sort((a, b) => b.stock - a.stock)
      .slice(0, limit);
    return {
      items,
      totalIdle: catalogMap.size,
      catalogWithStock,
      source: 'catalog'
    };
  }

  // Fallback: أصناف اتباعت في السنة واختفت من الفترة المحددة
  const periodItemKeys = new Set<string>();
  periodRecords.forEach((record) => periodItemKeys.add(itemKeyOf(record)));
  const history = accumulateItems(allRecords);
  const idleFromHistory: IdleItemInsight[] = [];

  history.forEach((entry, key) => {
    if (periodItemKeys.has(key)) return;
    if (entry.amount <= 0 && entry.quantity <= 0) return;
    idleFromHistory.push({
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      itemGroup: entry.itemGroup,
      stock: 0,
      status: 'بدون حركة',
      lastMonth: entry.lastMonth,
      lastMonthLabel: entry.lastMonth ? MONTH_LABELS[entry.lastMonth] : '—'
    });
  });

  return {
    items: idleFromHistory
      .sort((a, b) => (b.lastMonth || 0) - (a.lastMonth || 0))
      .slice(0, limit),
    totalIdle: idleFromHistory.length,
    catalogWithStock: 0,
    source: idleFromHistory.length > 0 ? 'sales-history' : 'none'
  };
}

/* ------------------------------------------------------------------ */
/* 7) إجمالي الفترة (للكروت العلوية)                                    */
/* ------------------------------------------------------------------ */

export interface ItemSalesPeriodTotals {
  amount: number;
  quantity: number;
  itemsCount: number;
  customersCount: number;
  ordersCount: number;
}

export function buildPeriodTotals(records: CustomerItemSaleRecord[]): ItemSalesPeriodTotals {
  const items = new Set<string>();
  const customers = new Set<string>();
  const orders = new Set<string>();

  records.forEach((record) => {
    items.add(itemKeyOf(record));
    const customer = customerKeyOf(record);
    if (customer) customers.add(customer);
    const order = (record.salesOrder || '').trim();
    if (order) orders.add(order);
  });

  return {
    amount: sumSalesAmount(records),
    quantity: sumSalesQuantity(records),
    itemsCount: items.size,
    customersCount: customers.size,
    ordersCount: orders.size
  };
}

