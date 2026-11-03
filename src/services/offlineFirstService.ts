/**
 * Offline-First data layer for Tantawy Group.
 *
 * Reads (customers, invoices, products, ...) follow this rule:
 *   1. If device is ONLINE  → try Supabase first; on success save a snapshot to IndexedDB.
 *   2. If device is OFFLINE   → read the latest snapshot from IndexedDB immediately.
 *   3. If ONLINE but network fails → fall back gracefully to IndexedDB snapshot.
 *
 * Writes (create/update/delete) follow this rule:
 *   1. Update local React state + IndexedDB immediately (optimistic).
 *   2. If ONLINE → push to Supabase right away.
 *   3. If OFFLINE  → park the mutation in the offline outbox (offlineQueueService);
 *      it is drained automatically the moment the connection returns.
 *
 * This makes the app behave like Facebook/WhatsApp: it opens instantly from
 * local storage, shows the last known data while offline, and self-heals when
 * the network comes back.
 */

import { idbGet, idbSet } from './storageService';
import {
  enqueueMutation,
  countQueuedMutations,
} from './offlineQueueService';
import type { Customer, Invoice, Product } from '../types';

/** Keys shared with appContextHelpers STORAGE_KEYS so both layers read/write the same buckets. */
export const OFFLINE_STORAGE_KEYS = {
  CUSTOMERS: 'dream_dist_customers_v9',
  INVOICES: 'dream_dist_invoices_v9',
  PRODUCTS: 'dream_dist_products_v9',
  USERS: 'dream_dist_users_v10',
  VISITS: 'dream_dist_customer_visits_v1',
} as const;

type EntityKey = 'customers' | 'invoices' | 'products' | 'users' | 'visits';

/** Map friendly entity name → IndexedDB key. */
function keyFor(entity: EntityKey): string {
  const map: Record<EntityKey, string> = {
    customers: OFFLINE_STORAGE_KEYS.CUSTOMERS,
    invoices: OFFLINE_STORAGE_KEYS.INVOICES,
    products: OFFLINE_STORAGE_KEYS.PRODUCTS,
    users: OFFLINE_STORAGE_KEYS.USERS,
    visits: OFFLINE_STORAGE_KEYS.VISITS,
  };
  return map[entity];
}

/** Read latest local snapshot for an entity from IndexedDB. */
export async function getOfflineSnapshot<T>(entity: EntityKey): Promise<T[] | null> {
  try {
    const raw = await idbGet<T[]>(keyFor(entity));
    return raw ?? null;
  } catch {
    return null;
  }
}

/** Save a snapshot to IndexedDB (fire-and-safe). */
export async function saveOfflineSnapshot<T>(entity: EntityKey, data: T[]): Promise<boolean> {
  try {
    return await idbSet(keyFor(entity), data);
  } catch {
    return false;
  }
}

/**
 * Fetch with offline fallback.
 *
 * @param entity          Which collection (customers | invoices | products ...)
 * @param fetchFromNetwork Async function that calls Supabase and returns T[]
 * @param isOffline       Current connectivity flag
 * @param onNetworkSuccess Optional callback when network data is received
 */
export async function fetchWithOfflineFallback<T>(
  entity: EntityKey,
  fetchFromNetwork: () => Promise<{ success: boolean; data?: T[]; error?: string }>,
  isOffline: boolean,
  onNetworkSuccess?: (data: T[]) => void
): Promise<{ success: boolean; data: T[]; source: 'network' | 'offline' | 'empty'; error?: string }> {
  // 1. Device is offline → serve from IndexedDB immediately, no network attempts.
  if (isOffline || !navigator.onLine) {
    const snapshot = await getOfflineSnapshot<T>(entity);
    if (snapshot && snapshot.length > 0) {
      return { success: true, data: snapshot, source: 'offline' };
    }
    return { success: true, data: [], source: 'empty', error: 'لا يوجد اتصال بالإنترنت ولا بيانات محلية محفوظة' };
  }

  // 2. Online → try network first.
  try {
    const res = await fetchFromNetwork();
    if (res.success && res.data) {
      await saveOfflineSnapshot(entity, res.data);
      onNetworkSuccess?.(res.data);
      return { success: true, data: res.data, source: 'network' };
    }
    // Network responded but with an error → fall back to local snapshot if any.
    const snapshot = await getOfflineSnapshot<T>(entity);
    if (snapshot && snapshot.length > 0) {
      return { success: true, data: snapshot, source: 'offline', error: res.error };
    }
    return { success: false, data: [], source: 'empty', error: res.error || 'فشل الاتصال بالخادم' };
  } catch (err: any) {
    // 3. Network threw (e.g. DNS failure, timeout) → fall back to IndexedDB.
    const snapshot = await getOfflineSnapshot<T>(entity);
    if (snapshot && snapshot.length > 0) {
      return { success: true, data: snapshot, source: 'offline', error: err?.message || 'انقطع الاتصال' };
    }
    return {
      success: false,
      data: [],
      source: 'empty',
      error: err?.message || 'لا يوجد اتصال بالإنترنت',
    };
  }
}

/**
 * Optimistic write with offline queue.
 *
 * Updates local state + IndexedDB immediately. If online, pushes to Supabase.
 * If offline, parks the mutation in IndexedDB outbox to be synced later.
 *
 * @param entity        Collection name
 * @param op            'upsert' | 'delete' | 'replace'
 * @param entityId      Id of the affected row
 * @param payload       Data to write (null for deletes)
 * @param saveLocal     Function to update IndexedDB snapshot optimistically
 * @param pushToNetwork Function that calls Supabase (skipped when offline)
 */
export async function writeWithOfflineQueue<T>(
  entity: EntityKey,
  op: 'upsert' | 'delete' | 'replace',
  entityId: string,
  payload: T | null,
  saveLocal: () => Promise<void>,
  pushToNetwork?: () => Promise<void>
): Promise<{ success: boolean; queued: boolean; synced: boolean; message: string }> {
  // Always update local state + IndexedDB first (optimistic UI).
  try {
    await saveLocal();
  } catch {
    // Local write failed — still allow queueing for later.
  }

  const isOnline = navigator.onLine;

  // If online and we have a network push function, try it now.
  if (isOnline && pushToNetwork) {
    try {
      await pushToNetwork();
      return { success: true, queued: false, synced: true, message: 'تم الحفظ والمزامنة مع الخادم' };
    } catch (networkErr: any) {
      // Network failed mid-write → park in outbox so it self-heals later.
      await enqueueMutation({
        entity,
        op,
        entityId,
        payload: payload as any,
        queuedAt: Date.now(),
        attempts: 0,
      });
      return {
        success: true,
        queued: true,
        synced: false,
        message: 'تم الحفظ محلياً وسيتم المزامنة تلقائياً عند عودة الإنترنت',
      };
    }
  }

  // Offline → park in IndexedDB outbox.
  if (!isOnline) {
    await enqueueMutation({
      entity,
      op,
      entityId,
      payload: payload as any,
      queuedAt: Date.now(),
      attempts: 0,
    });
    return {
      success: true,
      queued: true,
      synced: false,
      message: 'لا يوجد اتصال — تم حفظ التعديل محلياً وسيتم رفعه تلقائياً عند عودة الإنترنت',
    };
  }

  return { success: true, queued: false, synced: false, message: 'تم الحفظ محلياً' };
}

/** Return how many mutations are waiting in the offline outbox. */
export async function getOfflineQueueCount(): Promise<number> {
  try {
    return await countQueuedMutations();
  } catch {
    return 0;
  }
}