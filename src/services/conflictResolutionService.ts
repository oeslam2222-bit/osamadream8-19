/**
 * Conflict resolution between the local device copy and the server copy.
 *
 * The sync model is version-stamp driven: a published version makes every
 * client purge and re-pull. That is "server wins per scope", which is wrong
 * for one real case: a row edited on this device more recently than the
 * server snapshot (an offline edit still parked in the outbox, or a queued
 * mutation that landed after the snapshot was taken). Comparing the row's
 * own updated_at keeps the newer write per row — last writer wins at row
 * granularity, not at table granularity.
 *
 * Known trade-off: this trusts device clocks. A device with a skewed clock
 * can stamp a row "newer" than it really is. That is accepted here because
 * the alternative (silently dropping the freshest local edit on every sync)
 * loses real data, and the offline outbox re-uploads the winner anyway.
 *
 * Both column spellings are accepted because the Supabase rows use
 * `updated_at` while the client types use `updatedAt`.
 */

export interface ConflictRow {
  id: string;
  updated_at?: string | null;
  updatedAt?: string | null;
}

/** Milliseconds since epoch for a row's updated_at, or 0 when absent/invalid. */
export function rowUpdatedAtMs(row: ConflictRow): number {
  const raw = row.updated_at ?? row.updatedAt;
  if (!raw) return 0;
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? 0 : ms;
}

export type ConflictTieBreak = 'server' | 'local';

/**
 * Which of two versions of the same row wins.
 *
 * Default tie-break is the server copy: when both timestamps are equal (or
 * both missing — e.g. legacy rows predating this merge), the server is the
 * shared truth every other device sees, so preferring it converges the
 * fleet instead of leaving one device as an outlier. Callers that know the
 * local write is fresher (an offline queue flush) apply the local row
 * themselves.
 */
export function resolveRowWinner<T extends ConflictRow>(
  local: T,
  server: T,
  tieBreak: ConflictTieBreak = 'server'
): T {
  const localMs = rowUpdatedAtMs(local);
  const serverMs = rowUpdatedAtMs(server);
  if (localMs > serverMs) return local;
  if (serverMs > localMs) return server;
  return tieBreak === 'local' ? local : server;
}
