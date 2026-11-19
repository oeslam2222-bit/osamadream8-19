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
 * تجميع بيانات مبيعات الأصناف إلى صفوف مجمعة (مش صفوف خام):
 *   كود العميل · الشهر · الصنف · الصنف بالعائلة · القطاع · عدد القطع · المبلغ
 *
 * هدف scripts/collect-item-sales-data.ts: ياخد 175 ألف سجل مبيعات ويخرج صفوف
 * مجمعة (عميل + شهر + صنف + عائلة + قطاع) بمجموع الكمية والمبلغ — بس مفيش حاجة
 * من الصف الخام.
 */

export interface CollectedItemSalesRow {
  customerCode: string;
  customerName: string;
  month: number;
  itemCode: string;
  itemName: string;
  family: string;
  sector: 'home' | 'electrical';
  quantity: number;
  amount: number;
}

const MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'إبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر'
];

const monthNameOf = (month: number): string => MONTH_NAMES[month] || 'غير محدد';

const customerNameOf = (record: CustomerItemSaleRecord): string => {
  const invoiced = String(record.invoicingName || '').trim();
  const code = String(record.customerAccount || '').trim();
  if (invoiced && invoiced !== code) return invoiced;
  return invoiced || code || 'عميل غير محدد';
};

/** تحويل منتجات قاعدة البيانات (snake_case) لمسماك الأنواع (camelCase). */
const PRODUCT_CAMEL_FIELDS: Record<string, string> = {
  unified_code: 'unifiedCode',
  family_name: 'familyName',
  classification: 'classification',
  department: 'department',
  item_group: 'itemGroup',
  category: 'category',
  sector: 'sector',
  code: 'code',
  name: 'name',
  id: 'id'
};

const normalizeProduct = (raw: Record<string, unknown>): Product => {
  const out: Record<string, unknown> = { ...raw };
  for (const [snake, camel] of Object.entries(PRODUCT_CAMEL_FIELDS)) {
    if (out[camel] === undefined || out[camel] === null) {
      out[camel] = (out as Record<string, unknown>)[snake] ?? undefined;
    }
  }
  return out as Product;
};

/**
 * يجمع السجلات الخام لمبيعات الأصناف إلى صفوف مجمعة.
 * كل صف = مجموع (كود العميل + الشهر + الصنف + العائلة + القطاع).
 */
export function collectItemSalesAggregates(
  records: CustomerItemSaleRecord[],
  products: Product[] = []
): CollectedItemSalesRow[] {
  const lookup = buildProductFamilyLookup(products);
  const grouped = new Map<string, CollectedItemSalesRow>();

  (records || []).forEach((record) => {
    const customerCode = String(record.customerAccount || '').trim() || '—';
    const month = Math.min(12, Math.max(0, Number(record.month) || 0));
    const unified = String(record.unifiedCode || '').trim();
    const baseCode = String(record.itemCode || '').trim();
    const itemCode = (unified && looksLikeItemCode(unified) ? unified : baseCode || unified) || '—';
    const itemName = String(record.itemName || record.itemCode || '').trim() || 'صنف غير محدد';
    const familyRaw = String(
      resolveItemGroup(record) || record.familyDimension || record.itemGroup || ''
    ).trim();
    const product = lookup.find(record);
    const family =
      isGenericFamilyValue(familyRaw) ? resolveProductFamily(product) || familyRaw || 'عام' : familyRaw;
    const sector: 'home' | 'electrical' =
      (record.sector === 'electrical' || record.sector === 'home') ? record.sector : 'home';
    const quantity = Number(record.quantity) || 0;
    const amount = Number(record.amount) || 0;

    const key = `${customerCode}|${month}|${itemCode}|${family}|${sector}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.amount += amount;
      return;
    }

    grouped.set(key, {
      customerCode,
      customerName: customerNameOf(record),
      month,
      itemCode,
      itemName,
      family,
      sector,
      quantity,
      amount
    });
  });

  return Array.from(grouped.values());
}

const escapeCell = (value: unknown): string => {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};

export function downloadCollectedItemSalesCsv(rows: CollectedItemSalesRow[], filePath: string): void {
  const header = [
    'كود العميل',
    'اسم العميل',
    'الشهر',
    'الصنف',
    'الصنف بالعائلة',
    'القطاع',
    'عدد القطع',
    'المبلغ'
  ];
  const lines = rows.map((row) =>
    [
      row.customerCode,
      row.customerName,
      monthNameOf(row.month),
      row.itemName,
      row.family,
      row.sector === 'electrical' ? 'كهربائي' : 'منزلي',
      Math.round(row.quantity),
      Number(row.amount.toFixed(2))
    ]
      .map(escapeCell)
      .join(',')
  );
  const csv = `\uFEFF${[header.map(escapeCell).join(','), ...lines].join('\r\n')}`;
  writeFileSync(filePath, csv, 'utf8');
}

export function runCollectionFromFile(inputPath: string): {
  rows: CollectedItemSalesRow[];
  totalQuantity: number;
  totalAmount: number;
  sourceRecordsCount: number;
} {
  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as {
    records?: CustomerItemSaleRecord[];
    products?: Product[];
  };
  const sourceRecords = (Array.isArray(raw) ? raw : raw.records || []).map((r) => normalizeRecord(r));
  const products = (raw.products || []).map((p) => normalizeProduct(p));
  const rows = collectItemSalesAggregates(sourceRecords, products);

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return { rows, totalQuantity, totalAmount, sourceRecordsCount: sourceRecords.length };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : '';
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : '';

  const result = runCollectionFromFile(inputPath);
  console.log(`عدد السجلات الخام اللي تم تجميعها: ${result.sourceRecordsCount}`);
  console.log(`عدد الصفوف المجمعة الناتجة: ${result.rows.length}`);
  console.log(`إجمالي القطع: ${Math.round(result.totalQuantity)}`);
  console.log(`إجمالي المبلغ: ${Number(result.totalAmount.toFixed(2))}`);

  const target = outputPath || 'C:/Users/Administrator/AppData/Local/Temp/opencode/مبيعات_الأصناف_مجمعة.csv';
  downloadCollectedItemSalesCsv(result.rows, target);
  console.log(`تم كتابة ملف التجميع: ${target}`);
}

const invokedDirectly = Boolean(process.argv[1] && process.argv[1].includes('collect-item-sales'));

/** تحويل الحقول بال snake_case (customer_account, invoiced_name...) لمسماك الدوال/الأنواع (customerAccount, invoicedName...). */
const CAMEL_FIELDS: Record<string, string> = {
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
  created_at: 'createdAt'
};

const normalizeRecord = (raw: Record<string, unknown>): CustomerItemSaleRecord => {
  const out: Record<string, unknown> = { ...raw };
  for (const [snake, camel] of Object.entries(CAMEL_FIELDS)) {
    if (out[camel] === undefined || out[camel] === null) {
      out[camel] = (out as Record<string, unknown>)[snake] ?? undefined;
    }
  }
  return out as CustomerItemSaleRecord;
};

if (invokedDirectly) {
  void main();
}
