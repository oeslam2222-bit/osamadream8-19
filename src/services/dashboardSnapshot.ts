/**
 * لقطة أرقام محلية (Snapshot) — بنحفظ آخر أرقام صحيحة جاية من قاعدة البيانات
 * عشان الشاشة تفضل تعرضها لو النت قطع أو لسه مفيش تحديث جديد.
 * - مفتاح واحد لكل شاشة/مستخدم، وقيمة صغيرة (كائن أرقام) — مفيش تخزين صور أو داتا ثقيلة.
 * - أي فشل في التخزين (وضع التصفح الخاص / المساحة ممتلئة) بيتم تجاهله بهدوء،
 *   فالشاشة بتكمل بالأرقام الحية عادي.
 */

export interface SnapshotEntry<T> {
  data: T;
  savedAt: number;
}

const PREFIX = 'tantawy:snap:';

export function readSnapshot<T>(key: string): SnapshotEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotEntry<T>;
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    if (typeof parsed.savedAt !== 'number') parsed.savedAt = 0;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSnapshot<T>(key: string, data: T): number | null {
  try {
    const savedAt = Date.now();
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt }));
    return savedAt;
  } catch {
    return null;
  }
}

export function clearSnapshot(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* تجاهل */
  }
}

/** نص وقت مختصر لعرضه في الشارة: «14/11 · 09:45 ص» */
export function formatSnapshotTime(ts: number | null | undefined): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('ar-EG-u-nu-latn', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
