/**
 * نظام أرشفة البيانات الشهرية القديمة مع إمكانية تحديد الشهور
 * يمكن للمستخدم اختيار شهور محددة للأرشفة (مثل يناير، فبراير، إلخ)
 * البيانات المؤرشفة تُستبعد من الاستعلامات النشطة وتظل متاحة للتقارير القديمة
 */

import { Product, Customer, Invoice, TargetRecord } from '../types';

// مفتاح التخزين المحلي للأرشيف
const ARCHIVE_STORAGE_KEY = 'tantawy_archived_data';
const ARCHIVE_MONTH_THRESHOLD = 3; // الأشهر التي تُعتبر قديمة وتُؤرشف تلقائياً (الشهر الحالي ناقص 3)

/**
 * استخراج مفتاح الشهر من تاريخ (YYYY-MM)
 */
export function getMonthKey(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * التحقق إن كان الشهر قديمًا ويجب أرشفته تلقائياً
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
 * التحقق إن كان شهر معين في قائمة الشهور المحددة للأرشفة
 */
export function isMonthInArchiveList(monthKey: string, archiveMonths: string[]): boolean {
  return archiveMonths.includes(monthKey);
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