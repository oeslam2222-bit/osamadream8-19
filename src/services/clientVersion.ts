/**
 * بوابة إصدار العميل.
 *
 * المشكلة اللي بتحلها:
 *   بعد تفعيل RLS، أي نسخة قديمة متثبتة (PWA) بتفقد الوصول للبيانات.
 *   النتيجة الطبيعية في PostgREST إنها ترجع صفر صفوف — يعني **فشل صامت**
 *   المستخدم بيشوف شاشات فاضية ومش عارف السبب.
 *
 * الحل على مستويين:
 *   1) النسخة الحالية بتقارن نفسها بحد أدنى معروف (متغير بيئة أو RPC من القاعدة)
 *      وبتعرض شاشة إجبارية للتحديث قبل أي شغل.
 *   2) أي استجابة 401/403 بسبب صلاحيات (42501) بتُعتبر إشارة "نسخة قديمة/
 *      جلسة غير صالحة" وبتفتح نفس الشاشة بدل ما البيانات تفضل فاضية.
 *
 * حدود صادقة: الكود ده مش بيتحقن في نسخة قديمة متثبتة بالفعل. النسخة القديمة
 * مش عندها المنطق ده، فالحماية الفعلية ليها هي إن القاعدة بترفض طلباتها
 * بـ401 (مش بترجع فاضي) + إن الـService Worker بيحدّثها أوتوماتيك عند الفتح.
 * لذلك ترتيب النشر مهم — شوف docs/P0_AUTH_ROLLOUT.md.
 */

export const OUTDATED_CLIENT_EVENT = 'tantawy:client-outdated';

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim() ? __APP_VERSION__.trim() : '0.0.0';

/** الحد الأدنى من متغيرات البناء (احتياطي لو RPC غير متاح). */
export const ENV_MIN_CLIENT_VERSION = String(import.meta.env.VITE_MIN_CLIENT_VERSION || '').trim();

export interface OutdatedClientDetail {
  current: string;
  required: string;
  reason: 'version' | 'permission';
  message?: string;
}

function parseVersion(value: string): number[] {
  return (value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** يرجع 1 لو a أحدث، -1 لو b أحدث، 0 لو متساويتان. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length, 3);
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

export function isVersionOlder(current: string, required: string): boolean {
  if (!required || required === '0.0.0') return false;
  return compareVersions(current, required) < 0;
}

const notified = new Set<string>();

/**
 * يطلق حدث الحجب مرة واحدة لكل سبب. مستمع واحد في App.tsx بيعرض الشاشة.
 * exported عشان اختبارات الوحدة تقدر تتحقق من المنطق بدون DOM.
 */
export function notifyOutdatedClient(detail: OutdatedClientDetail): void {
  const key = `${detail.reason}:${detail.required}`;
  if (notified.has(key)) return;
  notified.add(key);
  try {
    window.dispatchEvent(new CustomEvent<OutdatedClientDetail>(OUTDATED_CLIENT_EVENT, { detail }));
  } catch {
    /* SSR / بيئة بدون window */
  }
}

/** للاختبارات فقط. */
export function resetOutdatedClientNotice(): void {
  notified.clear();
}
