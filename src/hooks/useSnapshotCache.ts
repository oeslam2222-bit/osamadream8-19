import { useEffect, useRef, useState } from 'react';
import { readSnapshot, writeSnapshot, type SnapshotEntry } from '../services/dashboardSnapshot';

/**
 * يحتفظ بآخر قيمة صحيحة للشاشة في localStorage.
 * - لو عندنا قيمة حيّة (من قاعدة البيانات) بترجع هي وبتتحفظ.
 * - لو القيمة بقت null (مفيش داتا / أوفلاين / أول تحميل بطيء) بترجع آخر لقطة محفوظة
 *   مع علامة stale + وقت الحفظ.
 * مفيش أي مؤقتات أو استعلامات متكررة: العملية كلها عند تغيّر القيمة الفعلية بس.
 */
export function useSnapshotCache<T>(key: string, value: T | null | undefined): {
  data: T | null;
  stale: boolean;
  savedAt: number | null;
} {
  const [entry, setEntry] = useState<SnapshotEntry<T> | null>(() => readSnapshot<T>(key));
  const keyRef = useRef(key);

  // تغيير المفتاح (مستخدم/شهر مختلف) → اقرأ اللقطة الخاصة بيه
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setEntry(readSnapshot<T>(key));
  }, [key]);

  // حفظ القيمة الحيّة (كائن الأرقام فقط — خفيف جدًا)
  useEffect(() => {
    if (value == null) return;
    const savedAt = writeSnapshot(key, value);
    setEntry({ data: value, savedAt: savedAt ?? Date.now() });
  }, [key, value]);

  if (value != null) {
    return { data: value, stale: false, savedAt: entry?.savedAt ?? null };
  }
  return { data: entry?.data ?? null, stale: entry != null, savedAt: entry?.savedAt ?? null };
}
