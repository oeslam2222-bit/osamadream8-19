import type { Customer, CustomerItemSaleRecord, Product } from '../types';

/**
 * موحّد تحديد قطاع حركة المبيعات (منزلي / كهربائي).
 *
 * السبب في إنشاء الملف: الصفحة كان فيها مسارين فلترة مختلفين —
 * `rbacSales` كان بيفلتر بـ sector العميل فقط (بحث بالمرجع والاسم)،
 * و`baseSales` كان بيستخدم resolver قديم يبحث بالـ linkedCustomerId فقط
 * ويعتمد على المنتج. النتيجة: حركة ممكن تتسقط في مسار وتعدي في التاني،
 * وفلتر القطاع بينزّل كل حاجة في «منزلي» لأن السياسة الجماعية
 * (add_customer_sector_column.sql) كتبت sector='home' على العملاء الفاضيين.
 *
 * دلوقتي resolver واحد بيستخدمه: فلتر RBAC + فلتر الصفحة + التحليل + الأجنحة.
 */

export type SectorFilter = 'home' | 'electrical';
export type ResolvedSector = 'home' | 'electrical' | 'both' | 'all';

const ELECTRICAL_RE = /كهرب/;

/** الكشف التلقائي: أي نص فيه «كهرب» (كهربا / كهرباء / كهربائي) → قطاع كهربائي. */
export function isElectricalLabel(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => ELECTRICAL_RE.test(String(value || '')));
}

/**
 * قطاع العميل بعد الكشف التلقائي — يغلب قيمة 'home' اللي كتبتها سياسة
 * التعبئة الجماعية على العملاء الفاضيين. القيم الموثوقة ('both' / 'all')
 * بتفضل زي ما هي، و'electrical' مش محتاج تأكيد.
 *
 * المعايير المعتمدة (بموافقة الإدارة): اسم العميل + اسم المحل + اسم المندوب.
 */
export function applyCustomerSectorHeuristic(customer: {
  sector?: Customer['sector'];
  name?: string;
  storeName?: string;
  repName?: string;
  salesRepName?: string;
}): Customer['sector'] {
  const sector = customer.sector;
  if (sector === 'both' || sector === 'all') return sector;
  if (isElectricalLabel(customer.name, customer.storeName, customer.repName, customer.salesRepName)) {
    return 'electrical';
  }
  return sector;
}

export interface ItemSalesSectorResolver {
  /** home | electrical للتحليل والتجميع (both/all بتتحوّل home — سلوك قديم، كل سطر في سطر واحد). */
  resolve(record: CustomerItemSaleRecord): SectorFilter;
  /** القيمة الكاملة بما فيها both/all (للفلترة). */
  resolveFull(record: CustomerItemSaleRecord): ResolvedSector;
  /** هل الحركة تنطبق على القطاع المطلوب؟ both/all بتعدي أي قطاع. */
  matches(record: CustomerItemSaleRecord, sector: SectorFilter): boolean;
}

const cleanCode = (value?: string): string =>
  String(value || '').trim().replace(/^#+/, '').trim().toLowerCase();

/**
 * بناء resolver موحّد من قوائم العملاء والمنتجات (يُبنى مرة واحدة ويُخزّن بالـ memo).
 *
 * أولوية القرار:
 *  1. عمود القطاع على الحركة نفسها (من الشيت) — المصدر الأعلى.
 *  2. sector 'both'/'all' على العميل — موثوق (السياسة الجماعية ما كتبتهش).
 *  3. كشف تلقائي «كهرب» من اسم/محل/مندوب العميل أو اسم/مندوب الحركة — يغلب 'home' الغلط.
 *  4. sector العميل المُعلن ('electrical' / 'home').
 *  5. إشارة إيجابية من linkedSector القديم (إشارته 'home' مش موثوق فنتجاهله).
 *  6. sector المنتج من الكتالوج (للحركات بلا عميل مطابق).
 *  7. الافتراضي: منزلي.
 */
export function createItemSalesSectorResolver(
  customers: Customer[],
  products: Product[]
): ItemSalesSectorResolver {
  const customerByRef = new Map<string, Customer>();
  const customersByName = new Map<string, Customer[]>();
  customers.forEach((customer) => {
    if (customer.id) customerByRef.set(customer.id.trim().toLowerCase(), customer);
    if (customer.code) customerByRef.set(customer.code.trim().toLowerCase(), customer);
    const name = String(customer.name || '').trim().toLowerCase();
    if (name) customersByName.set(name, [...(customersByName.get(name) || []), customer]);
  });

  const productByCode = new Map<string, Product>();
  const productByUnified = new Map<string, Product>();
  products.forEach((product) => {
    const code = cleanCode(product.code);
    const unified = cleanCode(product.unifiedCode);
    if (code && !productByCode.has(code)) productByCode.set(code, product);
    if (unified && !productByUnified.has(unified)) productByUnified.set(unified, product);
  });

  const findCustomer = (record: CustomerItemSaleRecord): Customer | undefined => {
    const refs = [record.linkedCustomerId, record.linkedCustomerCode, record.customerAccount]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase());
    for (const ref of refs) {
      const hit = customerByRef.get(ref);
      if (hit) return hit;
    }
    // مطابقة بالاسم فقط لو الاسم فريد (نفس منطق فلتر RBAC القديم).
    const name = String(record.invoicingName || '').trim().toLowerCase();
    const byName = name ? customersByName.get(name) : undefined;
    return byName && byName.length === 1 ? byName[0] : undefined;
  };

  // كاش لكل سطر أثناء عمر الـ resolver (بيتحدّث لما العملاء/المنتجات تتغيّر).
  const cache = new WeakMap<CustomerItemSaleRecord, ResolvedSector>();

  const compute = (record: CustomerItemSaleRecord): ResolvedSector => {
    // 1) عمود القطاع على الحركة نفسها (من الشيت).
    const own = record.sector;
    if (own === 'electrical' || own === 'home' || own === 'both') return own;

    const customer = findCustomer(record);

    // 2) قطاع معلن 'both'/'all' على العميل — موثوق.
    if (customer?.sector === 'both' || customer?.sector === 'all') return customer.sector;

    // 3) كشف تلقائي «كهرب» — يغلب 'home' اللي كتبته السياسة الجماعية.
    if (
      isElectricalLabel(
        customer?.name,
        customer?.storeName,
        customer?.repName,
        customer?.salesRepName,
        record.invoicingName,
        record.repName,
        record.linkedRepName
      )
    ) {
      return 'electrical';
    }

    // 4) قطاع العميل المُعلن.
    if (customer?.sector === 'electrical') return 'electrical';
    if (customer?.sector === 'home') return 'home';

    // 5) إشارة إيجابية من الربط القديم — إشارته 'home' مش موثوق فنتجاهله.
    if (record.linkedSector === 'electrical' || record.linkedSector === 'both') {
      return record.linkedSector;
    }

    // 6) قطاع المنتج من الكتالوج (للحركات بلا عميل مطابق).
    const itemCode = cleanCode(record.itemCode);
    const unified = cleanCode(record.unifiedCode);
    const product =
      (itemCode ? productByCode.get(itemCode) : undefined) ||
      (unified ? productByUnified.get(unified) : undefined);
    if (product?.sector === 'electrical') return 'electrical';

    // 7) الافتراضي: منزلي.
    return 'home';
  };

  const resolveFull = (record: CustomerItemSaleRecord): ResolvedSector => {
    const cached = cache.get(record);
    if (cached) return cached;
    const result = compute(record);
    cache.set(record, result);
    return result;
  };

  return {
    resolveFull,
    resolve: (record) => (resolveFull(record) === 'electrical' ? 'electrical' : 'home'),
    matches: (record, sector) => {
      const resolved = resolveFull(record);
      return resolved === sector || resolved === 'both' || resolved === 'all';
    },
  };
}
