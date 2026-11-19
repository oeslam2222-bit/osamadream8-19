import { readFileSync, writeFileSync } from 'fs';
import {
  buildProductFamilyLookup,
  isGenericFamilyValue,
  looksLikeItemCode,
  resolveItemGroup,
  resolveProductFamily
} from '../src/services/itemSalesAnalytics';
import type { CustomerItemSaleRecord, Product } from '../src/types';

/**
 * التقرير الإضافي لمبيعات الأصناف:
 *  1) أفضل العملاء (حسب المبلغ + الكمية)
 *  2) أفضل الأصناف (حسب المبلغ + الكمية)
 *  3) مقارنة شهر لشهر (مع نسبة النمو)
 */

const dataPath = 'C:/Users/Administrator/AppData/Local/Temp/opencode/cis_real_data.json';
const outPath = 'C:/Users/Administrator/AppData/Local/Temp/opencode/cis_extra_report.json';

const raw = JSON.parse(readFileSync(dataPath, 'utf8')) as {
  records?: CustomerItemSaleRecord[];
  products?: Product[];
};
const rawRecords = Array.isArray(raw) ? (raw as CustomerItemSaleRecord[]) : raw.records || [];
const sourceRecords = rawRecords.map((r) => {
  const out: Record<string, unknown> = { ...r };
  const map: Record<string, string> = {
    customer_account: 'customerAccount',
    invoiced_name: 'invoicingName',
    sales_order: 'salesOrder',
    rep_name: 'repName',
    warehouse: 'warehouse',
    item_code: 'itemCode',
    item_name: 'itemName',
    unified_code: 'unifiedCode',
    unit: 'unit',
    factor: 'factor',
    unit_price: 'unitPrice',
    discount: 'discount',
    quantity: 'quantity',
    amount: 'amount',
    item_group: 'itemGroup',
    definitions: 'definitions',
    family_dimension: 'familyDimension',
    created_at: 'createdAt',
  };
  for (const [snake, camel] of Object.entries(map)) {
    if (out[camel] === undefined || out[camel] === null) out[camel] = out[snake] ?? undefined;
  }
  return out as CustomerItemSaleRecord;
});
const records = sourceRecords;
const rawProducts = raw.products || [];
const products = rawProducts.map((p) => {
  const out: Record<string, unknown> = { ...p };
  const map: Record<string, string> = {
    unified_code: 'unifiedCode',
    family_name: 'familyName',
    classification: 'classification',
    department: 'department',
    item_group: 'itemGroup',
    category: 'category',
    sector: 'sector',
    code: 'code',
    name: 'name',
  };
  for (const [snake, camel] of Object.entries(map)) {
    if (out[camel] === undefined || out[camel] === null) out[camel] = out[snake] ?? undefined;
  }
  return out as Product;
});

const productMap = new Map<string, Product>();
for (const p of products) {
  const k = String(p.unifiedCode || p.code || '').trim();
  if (k && !productMap.has(k)) productMap.set(k, p);
}

const resolveSector = (record: CustomerItemSaleRecord): 'home' | 'electrical' => {
  const code = String(record.itemCode || '').trim();
  const unified = String(record.unifiedCode || '').trim();
  const key = (unified && looksLikeItemCode(unified) ? unified : code || unified) || '';
  const p = productMap.get(key);
  const s = String((p && (p as any).sector) || (record as any).sector || 'home').trim();
  if (s === 'electrical') return 'electrical';
  return 'home';
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- 1) أفضل العملاء ---------------- */
const customerMap = new Map<
  string,
  { customerCode: string; customerName: string; amount: number; quantity: number; items: Set<string>; orders: Set<string> }
>();
for (const r of records) {
  const code = String(r.customerAccount || '').trim() || '—';
  const name = String(r.invoicingName || '').trim() || code;
  const amount = Number(r.amount) || 0;
  const quantity = Number(r.quantity) || 0;
  const key = code;
  const cur = customerMap.get(key) || {
    customerCode: code,
    customerName: name,
    amount: 0,
    quantity: 0,
    items: new Set<string>(),
    orders: new Set<string>(),
  };
  cur.amount += amount;
  cur.quantity += quantity;
  if (String(r.itemCode || r.unifiedCode)) cur.items.add(String(r.unifiedCode || r.itemCode));
  const order = String(r.salesOrder || '').trim();
  if (order) cur.orders.add(order);
  customerMap.set(key, cur);
}
const topCustomers = Array.from(customerMap.values())
  .map((c) => ({
    customerCode: c.customerCode,
    customerName: c.customerName,
    totalAmount: round2(c.amount),
    totalQuantity: Math.round(c.quantity),
    distinctItemsCount: c.items.size,
    distinctOrdersCount: c.orders.size,
  }))
  .sort((a, b) => b.totalAmount - a.totalAmount)
  .slice(0, 25);

/* ---------------- 2) أفضل الأصناف ---------------- */
const itemMap = new Map<
  string,
  { itemCode: string; itemName: string; family: string; sector: 'home' | 'electrical'; amount: number; quantity: number; customers: Set<string> }
>();
for (const r of records) {
  const unified = String(r.unifiedCode || '').trim();
  const baseCode = String(r.itemCode || '').trim();
  const itemCode = (unified && looksLikeItemCode(unified) ? unified : baseCode || unified) || '—';
  const itemName = String(r.itemName || r.itemCode || '').trim() || 'صنف غير محدد';
  const familyRaw = String(resolveItemGroup(r) || r.familyDimension || r.itemGroup || '').trim();
  const lookup = buildProductFamilyLookup(products);
  const product = lookup.find(r);
  const family =
    isGenericFamilyValue(familyRaw) ? resolveProductFamily(product) || familyRaw || 'عام' : familyRaw;
  const sector = resolveSector(r);
  const key = itemCode;
  const cur = itemMap.get(key) || { itemCode, itemName, family, sector, amount: 0, quantity: 0, customers: new Set<string>() };
  cur.amount += Number(r.amount) || 0;
  cur.quantity += Number(r.quantity) || 0;
  cur.customers.add(String(r.customerAccount || '').trim());
  itemMap.set(key, cur);
}
const topItemsByAmount = Array.from(itemMap.values())
  .map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, family: i.family, sector: i.sector, totalAmount: round2(i.amount), totalQuantity: Math.round(i.quantity), customerCount: i.customers.size }))
  .sort((a, b) => b.totalAmount - a.totalAmount)
  .slice(0, 25);
const topItemsByQuantity = Array.from(itemMap.values())
  .map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, family: i.family, sector: i.sector, totalAmount: round2(i.amount), totalQuantity: Math.round(i.quantity), customerCount: i.customers.size }))
  .sort((a, b) => b.totalQuantity - a.totalQuantity)
  .slice(0, 25);

/* ---------------- 3) مقارنة شهر لشهر ---------------- */
const monthlyMap = new Map<number, { month: number; amount: number; quantity: number }>();
for (const r of records) {
  const m = Number(r.month) || 0;
  if (m < 1 || m > 12) continue;
  const cur = monthlyMap.get(m) || { month: m, amount: 0, quantity: 0 };
  cur.amount += Number(r.amount) || 0;
  cur.quantity += Number(r.quantity) || 0;
  monthlyMap.set(m, cur);
}
const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.month - b.month);
const monthlyComparison = monthly.map((m, idx) => {
  const prev = idx > 0 ? monthly[idx - 1] : null;
  const growthPct = prev && prev.amount > 0 ? ((m.amount - prev.amount) / prev.amount) * 100 : null;
  return { month: m.month, amount: round2(m.amount), quantity: Math.round(m.quantity), previousAmount: prev ? round2(prev.amount) : null, growthPct: growthPct === null ? null : round2(growthPct) };
});

const report = {
  generatedAt: new Date().toISOString(),
  source: 'supabase',
  rawRecordsCount: records.length,
  topCustomersByAmount: topCustomers,
  topCustomersByQuantity: [...topCustomers].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 25),
  topItemsByAmount,
  topItemsByQuantity,
  monthlyComparison,
};

writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`تم كتابة التقرير الإضافي: ${outPath}`);
console.log(`عدد السجلات: ${records.length}`);
console.log(`عدد العملاء: ${customerMap.size}`);
console.log(`عدد الأصناف: ${itemMap.size}`);
console.log(`أعلى عميل: ${topCustomers[0]?.customerName} — ${topCustomers[0]?.totalAmount}`);
console.log(`أعلى صنف: ${topItemsByAmount[0]?.itemName} — ${topItemsByAmount[0]?.totalAmount}`);
console.log(`أعلى شهر: ${monthly[monthly.length - 1]?.month} — ${monthly[monthly.length - 1]?.amount}`);
void 0;
