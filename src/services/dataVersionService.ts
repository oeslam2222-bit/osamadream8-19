import { supabase } from './supabaseService';
import { idbDelete, idbClear } from './storageService';

export const GLOBAL_VERSION_RECORD_ID = 'dream_app_global_sync_version_v1';
export const CLIENT_VERSION_STORAGE_KEY = 'dream_dist_client_data_version_meta_v1';

export type SyncScope = 'all' | 'products' | 'customers' | 'targets' | 'invoices' | 'visits';

export interface GlobalDataVersionMeta {
  id: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  scope: SyncScope;
  forcePurge: boolean;
  notes?: string;
  productsCount?: number;
  customersCount?: number;
  targetsCount?: number;
}

/**
 * Get current saved local version on this client
 */
export function getLocalDataVersion(): GlobalDataVersionMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_VERSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Persist client's known data version
 */
export function saveLocalDataVersion(meta: GlobalDataVersionMeta): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLIENT_VERSION_STORAGE_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn('Failed to save local data version:', e);
  }
}

/**
 * Fetch latest global data version published on the server
 */
export async function fetchRemoteDataVersion(): Promise<GlobalDataVersionMeta | null> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('items, total, updated_at, created_at')
      .eq('id', GLOBAL_VERSION_RECORD_ID)
      .limit(1);

    if (error || !data || data.length === 0 || !data[0].items) {
      return null;
    }

    const raw = data[0].items;
    const meta: GlobalDataVersionMeta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (meta && typeof meta.version === 'number') {
      return meta;
    }
    // Fallback if version was stored in total column
    if (typeof data[0].total === 'number' && data[0].total > 0) {
      return {
        id: GLOBAL_VERSION_RECORD_ID,
        version: data[0].total,
        updatedAt: data[0].updated_at || data[0].created_at || new Date().toISOString(),
        updatedBy: 'مدير النظام',
        scope: 'all',
        forcePurge: true,
        notes: 'تحديث عام لقاعدة البيانات',
      };
    }
    return null;
  } catch (err) {
    console.warn('Could not fetch remote data version:', err);
    return null;
  }
}

/**
 * Determine if the local client data version is stale compared to remote version
 */
export function isClientVersionStale(
  local: GlobalDataVersionMeta | null,
  remote: GlobalDataVersionMeta | null
): boolean {
  if (!remote || typeof remote.version !== 'number') return false;
  if (!local || typeof local.version !== 'number') return true;
  if (remote.version > local.version) return true;
  if (remote.forcePurge && remote.updatedAt !== local.updatedAt) return true;
  return false;
}

/**
 * Publish a new global data version to Supabase
 * All active client sessions will detect this and refresh their clean cache
 */
export async function publishNewDataVersion(params: {
  scope?: SyncScope;
  updatedBy?: string;
  notes?: string;
  forcePurge?: boolean;
  productsCount?: number;
  customersCount?: number;
  targetsCount?: number;
}): Promise<GlobalDataVersionMeta> {
  const currentRemote = await fetchRemoteDataVersion();
  const currentLocal = getLocalDataVersion();
  const baseVersion = Math.max(currentRemote?.version || 100, currentLocal?.version || 100);
  const nextVersion = baseVersion + 1;

  const newMeta: GlobalDataVersionMeta = {
    id: GLOBAL_VERSION_RECORD_ID,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    updatedBy: params.updatedBy || 'مدير النظام',
    scope: params.scope || 'all',
    forcePurge: params.forcePurge ?? true,
    notes: params.notes || 'تحديث عام لقاعدة البيانات ومزامنة الأجهزة',
    productsCount: params.productsCount,
    customersCount: params.customersCount,
    targetsCount: params.targetsCount,
  };

  try {
    const { error } = await supabase.from('orders').upsert({
      id: GLOBAL_VERSION_RECORD_ID,
      status: 'global_data_version_stamp',
      total: nextVersion,
      items: newMeta as any,
    });
    if (error) throw error;
  } catch (err) {
    console.warn('Failed to persist global data version stamp to Supabase:', err);
    throw err;
  }

  saveLocalDataVersion(newMeta);
  return newMeta;
}

/**
 * Purge stale local caches for specific scopes to prevent duplicates
 * Safely preserves user authentication, active cart, and pending offline orders.
 */
export async function purgeLocalDataCaches(scope: SyncScope = 'all'): Promise<void> {
  const tasks: Promise<any>[] = [];

  if (scope === 'all' || scope === 'products') {
    tasks.push(idbDelete('dream_dist_products_v9'));
    tasks.push(idbDelete('dream_dist_products_v8'));
    try {
      window.localStorage.removeItem('dream_dist_products_v9');
      window.localStorage.removeItem('dream_dist_products_v8');
    } catch {}
  }

  if (scope === 'all' || scope === 'customers') {
    tasks.push(idbDelete('dream_dist_customers_v9'));
    tasks.push(idbDelete('dream_dist_customers_v8'));
    tasks.push(idbDelete('dream_dist_customers_v3'));
    try {
      window.localStorage.removeItem('dream_dist_customers_v9');
      window.localStorage.removeItem('dream_dist_customers_v8');
      window.localStorage.removeItem('dream_dist_customers_v3');
    } catch {}
  }

  if (scope === 'all' || scope === 'targets') {
    tasks.push(idbDelete('dream_dist_targets_v1'));
    try {
      window.localStorage.removeItem('dream_dist_targets_v1');
    } catch {}
  }

  if (scope === 'all' || scope === 'invoices') {
    tasks.push(idbDelete('dream_dist_invoices_v9'));
    tasks.push(idbDelete('dream_dist_invoices_v8'));
    try {
      window.localStorage.removeItem('dream_dist_invoices_v9');
      window.localStorage.removeItem('dream_dist_invoices_v8');
    } catch {}
  }

  if (scope === 'all' || scope === 'visits') {
    tasks.push(idbDelete('dream_dist_customer_visits_v1'));
    try {
      window.localStorage.removeItem('dream_dist_customer_visits_v1');
    } catch {}
  }

  // When purging ALL scopes, also clear the entire IndexedDB store to catch any
  // legacy keys or orphaned entries that the individual deletes above might miss,
  // which is what causes the duplication users see when clearing cache.
  if (scope === 'all') {
    tasks.push(idbClear());
    try {
      // Clear any lingering localStorage keys
      Object.keys(window.localStorage).forEach((k) => {
        if (k.startsWith('dream_dist_')) {
          window.localStorage.removeItem(k);
        }
      });
    } catch {}
  }

  await Promise.allSettled(tasks);
}

