import { CustomerItemSaleRecord } from '../types';
import { idbGet, idbSet } from './storageService';
import { supabase } from './supabaseService';

/**
 * طبقة تجميع مبيعات الأصناف.
 *
 * المشكلة: جدول `customer_item_sales` بيوصل لـ100 ألف صف (~30MB). تحليلات
 * الصفحة (ترتيب الأصناف، العائلات، المناديب، أفضل العملاء، الشهور) كلها
 * محتاجة إجماليات مش الصفوف نفسها. تنزيل الصفوف على 500 جهاز = egress ضخم
 * وذاكرة كبيرة على الموبايل.
 *
 * الحل: بنحسب ملخص لكل (شهر × قطاع) مرة واحدة وقت الاستيراد/المزامنة،
 * وبنحفظه في صف صغير بجدول `orders` (نفس نمط dream_catalog_chunk_*)،
 * والصفحة بتقرأ الملخص بدل ما تنزّل الجدول.
 *
 * حجم الملخص: ~20-80KB للشهر/القطاع بدل 3-5MB من الصفوف الخام.
 */

export const ITEM_SALES_AGG_PREFIX = 'dream_item_agg_v1_';

export type ItemSalesSector = 'home' | 'electrical';

export interface ItemSalesAggItem {
  c: string; // item code
  n: string; // item name
  f: string; // family dimension
  g: string; // item group
  p: number; // pieces/quantity
  a: number; // amount
  cu: number; // distinct customers
}

export interface ItemSalesAggRep {
  n: string;
  p: number;
  a: number;
  cu: number;
}

export interface ItemSalesAggWarehouse {
  n: string;
  p: number;
  a: number;
  cu: number;
}

export interface ItemSalesAggCustomer {
  c: string;
  n: string;
  p: number;
  a: number;
  items: number;
}

export interface ItemSalesAggDoc {
  v: 1;
  month: number; // 1..12
  sector: ItemSalesSector;
  rows: number;
  updatedAt: string;
  totals: { p: number; a: number; cu: number };
  items: ItemSalesAggItem[];
  reps: ItemSalesAggRep[];
  warehouses: ItemSalesAggWarehouse[];
  customers: ItemSalesAggCustomer[];
}

export interface BuildAggregateOptions {
  /** يحوّل كود/اسم الصنف لقطاعه — القطاع مش موجود في جدول المبيعات نفسه. */
  resolveSector?: (record: CustomerItemSaleRecord) => ItemSalesSector;
  /** أقصى عدد عملاء محفوظين في الملخص (الباقي يدخل في الإجماليات بس). */
  maxCustomers?: number;
}

const round = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

export function itemSalesAggregateId(month: number, sector: ItemSalesSector): string {
  return `${ITEM_SALES_AGG_PREFIX}${sector}_${String(month).padStart(2, '0')}`;
}

/**
 * يبني ملخص واحد لكل (شهر × قطاع) من الصفوف المتاحة محليًا.
 * بيتنادى بعد الاستيراد/المزامنة — مش على جهاز المندوب.
 */
export function buildItemSalesAggregates(
  records: CustomerItemSaleRecord[],
  options: BuildAggregateOptions = {}
): ItemSalesAggDoc[] {
  const maxCustomers = options.maxCustomers ?? 400;
  const resolveSector = options.resolveSector ?? (() => 'home' as ItemSalesSector);

  type Bucket = {
    doc: ItemSalesAggDoc;
    items: Map<string, ItemSalesAggItem & { customerSet: Set<string> }>;
    reps: Map<string, ItemSalesAggRep & { customerSet: Set<string> }>;
    warehouses: Map<string, ItemSalesAggWarehouse & { customerSet: Set<string> }>;
    customers: Map<string, ItemSalesAggCustomer & { itemSet: Set<string> }>;
    totalsCustomers: Set<string>;
  };

  const buckets = new Map<string, Bucket>();

  for (const record of records || []) {
    const month = Number(record.month);
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    const quantity = Number(record.quantity) || 0;
    const amount = Number(record.amount) || 0;
    if (quantity === 0 && amount === 0) continue;

    const sector = resolveSector(record);
    const key = `${sector}-${month}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        doc: {
          v: 1,
          month,
          sector,
          rows: 0,
          updatedAt: new Date().toISOString(),
          totals: { p: 0, a: 0, cu: 0 },
          items: [],
          reps: [],
          warehouses: [],
          customers: [],
        },
        items: new Map(),
        reps: new Map(),
        warehouses: new Map(),
        customers: new Map(),
        totalsCustomers: new Set(),
      };
      buckets.set(key, bucket);
    }

    const customerCode = String(record.customerAccount || record.linkedCustomerCode || '').trim();
    const customerName = String(record.invoicingName || record.linkedCustomerId || '').trim();
    // الكود الموحد فريد لكل لون، وكود المنتج ممكن يتكرر — فبنقدّم الموحد.
    const itemCode = String(record.unifiedCode || record.itemCode || '').trim();
    const itemName = String(record.itemName || '').trim();
    const family = String(record.familyDimension || '').trim();
    const group = String(record.itemGroup || '').trim();
    const repName = String(record.repName || '').trim();
    const warehouse = String(record.warehouse || '').trim();

    bucket.doc.rows += 1;
    bucket.doc.totals.p += quantity;
    bucket.doc.totals.a += amount;
    if (customerCode) bucket.totalsCustomers.add(customerCode);

    const itemKey = itemCode || itemName;
    if (itemKey) {
      const item = bucket.items.get(itemKey) || { c: itemCode, n: itemName, f: family, g: group, p: 0, a: 0, cu: 0, customerSet: new Set<string>() };
      item.p += quantity;
      item.a += amount;
      if (customerCode) item.customerSet.add(customerCode);
      if (!item.f && family) item.f = family;
      if (!item.g && group) item.g = group;
      bucket.items.set(itemKey, item);
    }

    if (repName) {
      const rep = bucket.reps.get(repName) || { n: repName, p: 0, a: 0, cu: 0, customerSet: new Set<string>() };
      rep.p += quantity;
      rep.a += amount;
      if (customerCode) rep.customerSet.add(customerCode);
      bucket.reps.set(repName, rep);
    }

    if (warehouse) {
      const wh = bucket.warehouses.get(warehouse) || { n: warehouse, p: 0, a: 0, cu: 0, customerSet: new Set<string>() };
      wh.p += quantity;
      wh.a += amount;
      if (customerCode) wh.customerSet.add(customerCode);
      bucket.warehouses.set(warehouse, wh);
    }

    if (customerCode) {
      const customer =
        bucket.customers.get(customerCode) ||
        ({ c: customerCode, n: customerName, p: 0, a: 0, items: 0, itemSet: new Set<string>() } as ItemSalesAggCustomer & { itemSet: Set<string> });
      customer.p += quantity;
      customer.a += amount;
      if (itemKey) customer.itemSet.add(itemKey);
      if (!customer.n && customerName) customer.n = customerName;
      bucket.customers.set(customerCode, customer);
    }
  }

  const docs: ItemSalesAggDoc[] = [];
  buckets.forEach((bucket) => {
    // maxCustomers = 0 يعني مايتحفظش أي تفصيل بأسماء العملاء ومبالغهم في
    // صف بيتقرأ بمفتاح publishable — بنحفظ إجماليات بس.

    bucket.doc.totals.cu = bucket.totalsCustomers.size;
    bucket.doc.totals.p = round(bucket.doc.totals.p);
    bucket.doc.totals.a = round(bucket.doc.totals.a);
    bucket.doc.items = Array.from(bucket.items.values())
      .map(({ customerSet, ...item }) => ({ ...item, p: round(item.p), a: round(item.a), cu: customerSet.size }))
      .sort((left, right) => right.a - left.a);
    bucket.doc.reps = Array.from(bucket.reps.values())
      .map(({ customerSet, ...rep }) => ({ ...rep, p: round(rep.p), a: round(rep.a), cu: customerSet.size }))
      .sort((left, right) => right.a - left.a);
    bucket.doc.warehouses = Array.from(bucket.warehouses.values())
      .map(({ customerSet, ...wh }) => ({ ...wh, p: round(wh.p), a: round(wh.a), cu: customerSet.size }))
      .sort((left, right) => right.a - left.a);
    bucket.doc.customers = Array.from(bucket.customers.values())
      .map(({ itemSet, ...customer }) => ({
        ...customer,
        p: round(customer.p),
        a: round(customer.a),
        items: itemSet.size,
      }))
      .sort((left, right) => right.a - left.a)
      .slice(0, Math.max(0, maxCustomers));
    docs.push(bucket.doc);
  });

  return docs.sort((left, right) => left.month - right.month || left.sector.localeCompare(right.sector));
}

/** يحفظ الملخصات في صفوف صغيرة بجدول orders (بدون أي تغيير في الشيم). */
export async function saveItemSalesAggregates(docs: ItemSalesAggDoc[]): Promise<{ success: boolean; saved: number; error?: string }> {
  if (!docs || docs.length === 0) return { success: true, saved: 0 };
  try {
    const payload = docs.map((doc) => ({
      id: itemSalesAggregateId(doc.month, doc.sector),
      invoice_number: itemSalesAggregateId(doc.month, doc.sector),
      customer_name: `ملخص مبيعات الأصناف — شهر ${doc.month}`,
      customer_phone: '',
      rep_name: '',
      branch_name: doc.sector === 'electrical' ? 'كهرباء' : 'منزلي',
      status: 'aggregate',
      total_cartons: doc.rows,
      total_pieces: doc.totals.p,
      estimated_grand_total: doc.totals.a,
      items: JSON.stringify(doc),
      created_at: doc.updatedAt,
    }));
    const chunkSize = 5;
    let saved = 0;
    for (let index = 0; index < payload.length; index += chunkSize) {
      const chunk = payload.slice(index, index + chunkSize);
      const { error } = await supabase.from('orders').upsert(chunk, { onConflict: 'id' });
      if (error) {
        return { success: false, saved, error: error.message };
      }
      saved += chunk.length;
    }
    return { success: true, saved };
  } catch (err: any) {
    return { success: false, saved: 0, error: err?.message || 'فشل حفظ ملخصات مبيعات الأصناف' };
  }
}

const AGG_CACHE_KEY_PREFIX = 'tantawy_item_sales_agg_docs_v1::';

interface CachedAggEnvelope {
  updatedAt: number;
  docs: ItemSalesAggDoc[];
}

export async function getCachedItemSalesAggregates(options?: {
  month?: number;
  sector?: ItemSalesSector;
}): Promise<ItemSalesAggDoc[]> {
  if (typeof window === 'undefined') return [];
  const sectors: ItemSalesSector[] = options?.sector ? [options.sector] : ['home', 'electrical'];
  const all: ItemSalesAggDoc[] = [];
  for (const sec of sectors) {
    try {
      const env = await idbGet<CachedAggEnvelope>(`${AGG_CACHE_KEY_PREFIX}${sec}`);
      if (env && Array.isArray(env.docs)) {
        all.push(...env.docs);
      }
    } catch {}
  }
  return all
    .filter((doc) => (options?.month ? doc.month === options.month : true))
    .filter((doc) => (options?.sector ? doc.sector === options.sector : true))
    .sort((left, right) => left.month - right.month || left.sector.localeCompare(right.sector));
}

export async function saveCachedItemSalesAggregates(
  docs: ItemSalesAggDoc[],
  sectorScope?: ItemSalesSector
): Promise<void> {
  if (typeof window === 'undefined') return;
  const sectors: ItemSalesSector[] = sectorScope ? [sectorScope] : ['home', 'electrical'];
  for (const sec of sectors) {
    const sectorDocs = docs.filter((d) => d.sector === sec);
    if (sectorDocs.length > 0 || sectorScope === sec) {
      try {
        await idbSet<CachedAggEnvelope>(`${AGG_CACHE_KEY_PREFIX}${sec}`, {
          updatedAt: Date.now(),
          docs: sectorDocs,
        });
      } catch {}
    }
  }
}

/** يقرأ ملخصات الشهور المطلوبة فقط (صف أو اتنين لكل شهر/قطاع) مع كاش محلي للشبكات الضعيفة. */
export async function fetchItemSalesAggregates(options?: {
  month?: number;
  sector?: ItemSalesSector;
}): Promise<{ success: boolean; docs: ItemSalesAggDoc[]; fromCache?: boolean; error?: string }> {
  try {
    const month = options?.month;
    const sector = options?.sector;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cached = await getCachedItemSalesAggregates(options);
      return { success: cached.length > 0, docs: cached, fromCache: true };
    }

    const idPrefix =
      month && sector
        ? itemSalesAggregateId(month, sector)
        : month
          ? `${ITEM_SALES_AGG_PREFIX}`
          : ITEM_SALES_AGG_PREFIX;

    let query = supabase
      .from('orders')
      .select('id, items, updated_at')
      .like('id', `${idPrefix}%`)
      .order('id', { ascending: true })
      .limit(40);
    if (month && sector) query = query.eq('id', itemSalesAggregateId(month, sector));

    const { data, error } = await query;
    if (error) {
      const cached = await getCachedItemSalesAggregates(options);
      return {
        success: cached.length > 0,
        docs: cached,
        fromCache: cached.length > 0,
        error: error.message,
      };
    }

    const docs: ItemSalesAggDoc[] = [];
    (data || []).forEach((row: any) => {
      try {
        const parsed = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
        if (parsed && parsed.v === 1 && Array.isArray(parsed.items)) {
          docs.push(parsed as ItemSalesAggDoc);
        }
      } catch {
        // صف ملخص تالف — نتخطاه
      }
    });

    const filtered = docs
      .filter((doc) => (month ? doc.month === month : true))
      .filter((doc) => (sector ? doc.sector === sector : true))
      .sort((left, right) => left.month - right.month);

    if (!month && filtered.length > 0) {
      void saveCachedItemSalesAggregates(filtered, sector);
    }

    return { success: true, docs: filtered };
  } catch (err: any) {
    const cached = await getCachedItemSalesAggregates(options);
    return {
      success: cached.length > 0,
      docs: cached,
      fromCache: cached.length > 0,
      error: err?.message || 'فشل قراءة ملخصات مبيعات الأصناف',
    };
  }
}

/**
 * مبيعات صنف واحد لعميل واحد — استعلام مباشر مقيّد بكود العميل.
 * ده اللي يستخدمه كرت العميل بدل تنزيل الجدول كله.
 */
export async function fetchItemSalesForCustomer(
  customerCode: string,
  options?: { limit?: number; month?: number }
): Promise<{ success: boolean; rows: CustomerItemSaleRecord[]; error?: string }> {
  const code = String(customerCode || '').trim();
  if (!code) return { success: true, rows: [] };
  try {
    const { mapSupabaseRowToCustomerItemSale } = await import('./customerItemSalesService');
    let query = supabase
      .from('customer_item_sales')
      .select('*')
      .eq('customer_account', code)
      .order('month', { ascending: false })
      .limit(Math.min(2000, Math.max(50, options?.limit ?? 500)));
    if (options?.month) query = query.eq('month', options.month);
    const { data, error } = await query;
    if (error) return { success: false, rows: [], error: error.message };
    return { success: true, rows: (data || []).map(mapSupabaseRowToCustomerItemSale) };
  } catch (err: any) {
    return { success: false, rows: [], error: err?.message || 'فشل جلب مبيعات العميل بالصنف' };
  }
}

/** مبيعات مندوب واحد — مقيّدة باسمه، لحد صفحة البروفايل. */
export async function fetchItemSalesForRep(
  repName: string,
  options?: { limit?: number; month?: number }
): Promise<{ success: boolean; rows: CustomerItemSaleRecord[]; error?: string }> {
  const name = String(repName || '').trim();
  if (name.length < 2) return { success: true, rows: [] };
  try {
    const { mapSupabaseRowToCustomerItemSale } = await import('./customerItemSalesService');
    let query = supabase
      .from('customer_item_sales')
      .select('*')
      .ilike('rep_name', `%${name}%`)
      .order('month', { ascending: false })
      .limit(Math.min(3000, Math.max(100, options?.limit ?? 1000)));
    if (options?.month) query = query.eq('month', options.month);
    const { data, error } = await query;
    if (error) return { success: false, rows: [], error: error.message };
    return { success: true, rows: (data || []).map(mapSupabaseRowToCustomerItemSale) };
  } catch (err: any) {
    return { success: false, rows: [], error: err?.message || 'فشل جلب مبيعات المندوب بالصنف' };
  }
}
