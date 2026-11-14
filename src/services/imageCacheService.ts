// Offline Image Caching and Data Saver Utility for Sales Reps
//
// الهدف من الملف ده: تخفيض Egress (البيانات الصادرة من السيرفر/التخزين)
// بحيث الصّور لما تتفتح مرة تُخزّن على الجهاز وتظهر تاني من غير ما تنزل تاني.
// بيستخدم:
//   1. Cache API (caches) – لتخزين استجابات HTTP للصّور.
//   2. IndexedDB – لتخزين نسخ مضغوطة من الصّور كـ Blobs وت Creation روابط محلية (blob:)
//      تبقى سارية حتى لو الكاش اتمسح أو الجهاز travailler offline.

export const IMAGE_CACHE_NAME = 'tantawy-group-images-v5';
const CACHE_NAME = IMAGE_CACHE_NAME;
const IDB_NAME = 'DreamDistributionImageCache';
const IDB_STORE = 'image_blobs';

/** حدّ أقصى للصّور اللي تُخزّن في IndexedDB عشان ما يملىءش مساحة الهاتف. */
const MAX_CACHED_IMAGES = 300;
const IDB_VERSION = 2; // v2: إضافة index على cachedAt عشان القص التلقائي

/** قصّ أقدم الصور لو عدّى السقف — نفس الـtransaction بتاع الكتابة. */
function pruneOldImageBlobs(store: IDBObjectStore, tx: IDBTransaction): void {
  try {
    const countReq = store.count();
    countReq.onsuccess = () => {
      const overflow = countReq.result - MAX_CACHED_IMAGES;
      if (overflow <= 0) return;
      let deleted = 0;
      const cursorReq = store.index('cachedAt').openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || deleted >= overflow) return;
        cursor.delete();
        deleted++;
        cursor.continue();
      };
    };
  } catch {
    // القص اختياري — فشله ما يمنعش تخزين الصورة نفسها.
  }
  void tx;
}

/** ---------------------------------------------------------------
 *  Cache API helpers
 * --------------------------------------------------------------- */

export function isCacheSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

/** افتح (أو أنشئ) الكاش المخصّص للصّور. */
async function openImageCache() {
  if (!isCacheSupported()) throw new Error('Cache API not supported');
  return await caches.open(CACHE_NAME);
}

/** تأكد إن الرابط موجود في الكاش ورجع Response لو لقيته. */
export async function getCachedImageResponse(url: string): Promise<Response | null> {
  if (!isCacheSupported()) return null;
  try {
    const cache = await openImageCache();
    const match = await cache.match(url);
    return match ?? null;
  } catch {
    return null;
  }
}

/** خزّن استجابة صورة في الكاش (يُستدعى بعد تحميل ناجح من الشبكة). */
export async function cacheImageResponse(url: string, response: Response): Promise<boolean> {
  if (!isCacheSupported()) return false;
  try {
    const cache = await openImageCache();
    // نوّخ نسخة عشان تُستخدم تاني (Response جسمه يستهلك مرة واحدة).
    await cache.put(url, response.clone());
    return true;
  } catch {
    return false;
  }
}

/** Preload and cache product images to device storage so they never redownload.
 *  العملية بتتم على دفعات (6 في المرة) للحفاظ على سرعة الشبكة. */
export async function cacheProductImages(imageUrls: string[]): Promise<{ cached: number; total: number }> {
  if (!isCacheSupported()) return { cached: 0, total: imageUrls.length };

  try {
    const cache = await openImageCache();
    let successCount = 0;

    const validUrls = imageUrls.filter(url => url && url.startsWith('http') && !url.startsWith('data:'));

    for (let i = 0; i < validUrls.length; i += 6) {
      const batch = validUrls.slice(i, i + 6);
      await Promise.allSettled(
        batch.map(async (url) => {
          const match = await cache.match(url);
          if (!match) {
            try {
              const res = await fetch(url, { mode: 'no-cors' });
              if (res) {
                await cache.put(url, res);
                successCount++;
              }
            } catch (e) {
              // Ignore single image failure
            }
          } else {
            successCount++;
          }
        })
      );
    }

    return { cached: successCount, total: validUrls.length };
  } catch (e) {
    return { cached: 0, total: imageUrls.length };
  }
}

/** عدد الصّور المخزّنة وحجمها التقريبي بالميجابايت. */
export async function getCachedImagesStats(): Promise<{ count: number; estimatedSizeMB: number }> {
  if (!isCacheSupported()) return { count: 0, estimatedSizeMB: 0 };

  try {
    const cache = await openImageCache();
    const keys = await cache.keys();
    const estimatedSizeMB = Math.round((keys.length * 0.035) * 10) / 10;
    return { count: keys.length, estimatedSizeMB };
  } catch (e) {
    return { count: 0, estimatedSizeMB: 0 };
  }
}

/** مسح كاش الصّور المخزّن لتحرير مساحة الهاتف. */
export async function clearCachedImages(): Promise<boolean> {
  if (!isCacheSupported()) return false;
  try {
    await caches.delete(CACHE_NAME);
    await clearImageBlobs();
    return true;
  } catch (e) {
    return false;
  }
}

/** ---------------------------------------------------------------
 *  IndexedDB blob storage (أكثـر ثباتاً من Cache API)
 * --------------------------------------------------------------- */

function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'url' });
      }
      // index على cachedAt عشان القص التلقائي (أقدم صورة تتمسح الأول).
      // إنشاؤه بيتبني تلقائياً من كل السجلات الموجودة — فما محتاجينش backfill.
      const store = request.transaction?.objectStore(IDB_STORE);
      if (store && !store.indexNames.contains('cachedAt')) {
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** خزّن صورة كـ Blob في IndexedDB (لاستخدامها محلياً عبر blob: URL). */
export async function storeImageBlob(url: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put({ url, blob, cachedAt: Date.now() });
      req.onsuccess = () => {
        // سقف المساحة: نحذف أقدم الصور لو عدّينا الحد.
        pruneOldImageBlobs(store, tx);
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** جنّب صورة من IndexedDB ورجع blob URL محلي لو لقيتها. */
export async function getCachedImageBlobUrl(url: string): Promise<string | null> {
  try {
    const db = await openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(url);
      req.onsuccess = () => {
        const row: { url: string; blob: Blob } | undefined = req.result;
        if (!row?.blob) {
          resolve(null);
          return;
        }
        const blobUrl = URL.createObjectURL(row.blob);
        resolve(blobUrl);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** مسح كل الصّور المخزّنة في IndexedDB. */
export async function clearImageBlobs(): Promise<boolean> {
  try {
    const db = await openImageDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** ---------------------------------------------------------------
 *  Unified: prob image source – كاش أول (IndexedDB blob > Cache API) ثم الشبكة
 * --------------------------------------------------------------- */

/** حاول إرجاع رابط صورة محلي (blob:) لو موجودة في IndexedDB، غير كده null. */
export async function getCachedImageUrl(url: string): Promise<string | null> {
  // 1. IndexedDB blob first (fastest, works offline, survives cache clear)
  const blobUrl = await getCachedImageBlobUrl(url);
  if (blobUrl) return blobUrl;

  // 2. Cache API next
  if (!isCacheSupported()) return null;
  try {
    const cache = await openImageCache();
    const match = await cache.match(url);
    if (match) {
      const blob = await match.blob();
      const blobUrl = URL.createObjectURL(blob);
      // persistent copy in IndexedDB for next time
      void storeImageBlob(url, blob);
      return blobUrl;
    }
  } catch {}
  return null;
}

/** تحميل صورة وتخزينها في الكاشين (يُستدعى عند أول عرض للصورة). */
export async function fetchAndCacheImage(url: string): Promise<string | null> {
  // لو موجودة بالفعل، رجعها من غير شبكة.
  const cached = await getCachedImageUrl(url);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    await storeImageBlob(url, blob);
    if (isCacheSupported()) {
      void cacheImageResponse(url, res);
    }
    return blobUrl;
  } catch {
    return null;
  }
}

/** Pré-cache قائمة من الروابط في الخلفية (بدون منع واجهة المستخدم). */
export async function precacheImageUrls(imageUrls: string[]): Promise<{ cached: number; total: number }> {
  return cacheProductImages(imageUrls);
}
