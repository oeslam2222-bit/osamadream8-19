import { idbGetStrict, idbSet } from './storageService';
import type {
  CollectionForecastRecord,
  Customer,
  CustomerCommentRecord,
  CustomerVisit,
  ForecastMonthPlan,
  Invoice,
  User,
} from '../types';

/**
 * Offline outbox.
 *
 * Every mutation the user makes while the device has no network is appended here
 * instead of being sent (and silently lost). The queue lives in IndexedDB, so
 * it survives a reload or a crash, and it is drained automatically the moment
 * the connection comes back.
 *
 * Only the two bulk entities (products / targets) are stored as a "replace"
 * marker without a payload: their Supabase writers are authoritative full-table
 * replacements, so the flush sends whatever the local state holds at flush time
 * rather than a stale snapshot.
 */
export type QueueEntity = 'invoices' | 'visits' | 'customers' | 'users' | 'products' | 'targets' | 'forecasts' | 'forecast_plans' | 'customer_comments';
export type QueueOp = 'upsert' | 'delete' | 'replace';

export interface QueuedMutation {
  id: string;
  entity: QueueEntity;
  op: QueueOp;
  entityId: string;
  payload?: Invoice | CustomerVisit | Customer | User | CollectionForecastRecord | ForecastMonthPlan | CustomerCommentRecord;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

const QUEUE_KEY = 'dream_dist_offline_queue_v1';

const makeId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function getQueuedMutations(): Promise<QueuedMutation[]> {
  const stored = await idbGetStrict<QueuedMutation[]>(QUEUE_KEY);
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) {
    throw new Error('Offline queue data is invalid; refusing to overwrite it.');
  }
  return stored;
}

async function writeQueue(items: QueuedMutation[]): Promise<void> {
  const saved = await idbSet(QUEUE_KEY, items);
  if (!saved) throw new Error('Failed to persist offline queue in IndexedDB.');
}

/**
 * Append a mutation to the outbox. Re-queuing the same entity+id collapses into
 * the pending entry so a device that stays offline for a day does not grow a
 * queue of thousands of stale rows.
 */
export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'queuedAt' | 'attempts'>
): Promise<number> {
  return enqueueMutations([mutation]);
}

export async function enqueueMutations(
  mutations: Array<Omit<QueuedMutation, 'id' | 'queuedAt' | 'attempts'>>
): Promise<number> {
  if (mutations.length === 0) return (await getQueuedMutations()).length;
  const items = await getQueuedMutations();
  const next = [...items];
  for (const mutation of mutations) {
    const sameTarget = next.filter(
      (item) => item.entity === mutation.entity && item.entityId === mutation.entityId
    );
    const id = sameTarget[sameTarget.length - 1]?.id || makeId();
    const entry: QueuedMutation = {
      ...mutation,
      id,
      queuedAt: Date.now(),
      attempts: 0,
    };
    for (let i = next.length - 1; i >= 0; i--) {
      if (next[i].entity === mutation.entity && next[i].entityId === mutation.entityId) {
        next.splice(i, 1);
      }
    }
    next.push(entry);
  }
  await writeQueue(next);
  return next.length;
}

export async function removeQueuedMutations(ids: string[]): Promise<number> {
  if (ids.length === 0) return (await getQueuedMutations()).length;
  const items = await getQueuedMutations();
  const dropped = new Set(ids);
  const next = items.filter((item) => !dropped.has(item.id));
  await writeQueue(next);
  return next.length;
}

/** Record a failed attempt so a permanently rejected row can be reported instead of retried forever. */
export async function markQueuedMutationFailure(
  ids: string[],
  error: string
): Promise<number> {
  if (ids.length === 0) return (await getQueuedMutations()).length;
  const items = await getQueuedMutations();
  const failed = new Set(ids);
  const next = items.map((item) =>
    failed.has(item.id) ? { ...item, attempts: item.attempts + 1, lastError: error } : item
  );
  await writeQueue(next);
  return next.length;
}

export async function countQueuedMutations(): Promise<number> {
  return (await getQueuedMutations()).length;
}

export async function clearQueuedMutations(): Promise<void> {
  await writeQueue([]);
}