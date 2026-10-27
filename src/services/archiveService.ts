/**
 * نظام أرشفة البيانات الشهرية القديمة
 * البيانات القديمة (مثل يناير) تُنقل إلى جداول أرشيف منفصلة
 * وتستبعد من الاستعلامات النشطة (التارجت، المبيعات بالصنف، إلخ)
 * مع بقائها متاحة للاستعلام عند الحاجة
 */

import { Product, Customer, Invoice, TargetRecord } from '../types';

// مفتاح التخزين المحلي للأرشيف
const ARCHIVE_STORAGE_KEY = 'tantawy_archived_data';
const ARCHIVE_MONTH_THRESHOLD = 3; // الأشهر التي تُعتبر قديمة وتُؤرشف (الشهر الحالي ناقص 3)

/**
 * استخراج مفتاح الشهر من تاريخ (YYYY-MM)
 */
export function getMonthKey(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * التحقق إن كان الشهر قديمًا ويجب أرشفته
 */
export function isMonthArchivable(monthKey: string): boolean {
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (monthKey >= currentMonthKey) return false; // الشهر الحالي أو مستقبلاً لا يُؤرشف

  const [archYear, archMonth] = monthKey.split('-').map(Number);
  const [currYear, currMonth] = currentMonthKey.split('-').map(Number);
  const monthsDiff = (currYear - archYear) * 12 + (currMonth - archMonth);
  return monthsDiff >= ARCHIVE_MONTH_THRESHOLD;
}

/**
 * تحميل البيانات المؤرشفة من localStorage
 */
export function loadArchivedData(): {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  targets: TargetRecord[];
} {
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (!raw) return { products: [], customers: [], invoices: [], targets: [] };
    return JSON.parse(raw);
  } catch {
    return { products: [], customers: [], invoices: [], targets: [] };
  }
}

/**
 * حفظ البيانات المؤرشفة في localStorage
 */
export function saveArchivedData(data: {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  targets: TargetRecord[];
}): void {
  try {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * نقل البيانات القديمة للأرشيف (يُستدعى عند الرفع اليومي)
 * يتم استبعاد الفواتير والتارجت القديمة من البيانات النشطة ونقلها للأرشيف
 */
export function archiveOldData({
  products,
  customers,
  invoices,
  targets,
}: {
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  targets: TargetRecord[];
}): {
  activeProducts: Product[];
  activeCustomers: Customer[];
  activeInvoices: Invoice[];
  activeTargets: TargetRecord[];
  archived: { products: Product[]; customers: Customer[]; invoices: Invoice[]; targets: TargetRecord[] };
} {
  const alreadyArchived = loadArchivedData();

  const archivedProducts: Product[] = [];
  const archivedCustomers: Customer[] = [];
  const archivedInvoices: Invoice[] = [];
  const archivedTargets: TargetRecord[] = [];

  const activeProducts = products.filter((p) => {
    // منتج بدون تاريخ إنشاء لا يُؤرشف
    const mk = getMonthKey((p as any).createdAt);
    if (mk && isMonthArchivable(mk)) {
      archivedProducts.push(p);
      return false;
    }
    return true;
  });

  const activeInvoices = invoices.filter((inv) => {
    const mk = getMonthKey((inv as any).date || (inv as any).createdAt);
    if (mk && isMonthArchivable(mk)) {
      archivedInvoices.push(inv);
      return false;
    }
    return true;
  });

  const activeTargets = targets.filter((t) => {
    const mk = getMonthKey(t.date);
    if (mk && isMonthArchivable(mk)) {
      archivedTargets.push(t);
      return false;
    }
    return true;
  });

  // دمج مع البيانات المؤرشفة مسبقاً وتجنب التكرار
  const mergedArchived = {
    products: [...alreadyArchived.products, ...archivedProducts],
    customers: [...alreadyArchived.customers, ...archivedCustomers],
    invoices: [...alreadyArchived.invoices, ...archivedInvoices],
    targets: [...alreadyArchived.targets, ...archivedTargets],
  };

  // إزالة التكرار حسب الكود/المفتاح
  const dedup = <T extends { code?: string; id?: string }>(items: T[]): T[] => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.code || item.id || JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  saveArchivedData({
    products: dedup(mergedArchived.products),
    customers: dedup(mergedArchived.customers),
    invoices: dedup(mergedArchived.invoices),
    targets: dedup(mergedArchived.targets),
  });

  return {
    activeProducts,
    activeCustomers: customers, // العملاء لا يُؤرشفون عادةً ولكن يمكن تفعيله لاحقًا
    activeInvoices,
    activeTargets,
    archived: {
      products: archivedProducts,
      customers: archivedCustomers,
      invoices: archivedInvoices,
      targets: archivedTargets,
    },
  };
}

/**
 * جلب البيانات المؤرشفة لعرضها في تقارير خاصة
 */
export function getArchivedProducts(): Product[] {
  return loadArchivedData().products;
}

export function getArchivedInvoices(): Invoice[] {
  return loadArchivedData().invoices;
}

export function getArchivedTargets(): TargetRecord[] {
  return loadArchivedData().targets;
}