import { AuditLog } from '../types';
import { idbDelete, idbGet, idbSet } from './storageService';

const AUDIT_LOGS_STORAGE_KEY = 'dream_dist_audit_logs_v8';
const LEGACY_AUDIT_LOGS_KEY = 'dream_dist_audit_logs_v7';
const MAX_AUDIT_LOGS = 1200;

function formatArabicAuditTime(date: Date): string {
  try {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const h24 = date.getHours();
    const min = String(date.getMinutes()).padStart(2, '0');
    const period = h24 >= 12 ? 'م' : 'ص';
    const h12 = String(h24 % 12 || 12).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${h12}:${min} ${period}`;
  } catch {
    return date.toISOString();
  }
}

export function createAuditLog(
  logData: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>
): AuditLog {
  const now = new Date();
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    ...logData,
    id: `audit_${now.getTime()}_${rand}`,
    timestamp: now.toISOString(),
    formattedTime: formatArabicAuditTime(now),
  };
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  try {
    const fromIdb = await idbGet<AuditLog[]>(AUDIT_LOGS_STORAGE_KEY);
    if (Array.isArray(fromIdb)) {
      return fromIdb.slice(0, MAX_AUDIT_LOGS);
    }
  } catch {
    // Fallback to localStorage below
  }

  if (typeof window !== 'undefined') {
    for (const key of [AUDIT_LOGS_STORAGE_KEY, LEGACY_AUDIT_LOGS_KEY]) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.slice(0, MAX_AUDIT_LOGS);
          }
        }
      } catch {
        // Ignore corrupted JSON
      }
    }
  }

  return [];
}

export async function appendAuditLog(entry: AuditLog): Promise<AuditLog[]> {
  const existing = await getAuditLogs();
  const next = [entry, ...existing.filter((item) => item.id !== entry.id)].slice(0, MAX_AUDIT_LOGS);

  await idbSet(AUDIT_LOGS_STORAGE_KEY, next).catch(() => false);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(AUDIT_LOGS_STORAGE_KEY, JSON.stringify(next.slice(0, 200)));
    } catch {
      // Ignore quota exceeded
    }
  }

  return next;
}

export async function clearAuditLogsStorage(): Promise<void> {
  await idbDelete(AUDIT_LOGS_STORAGE_KEY).catch(() => false);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(AUDIT_LOGS_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_AUDIT_LOGS_KEY);
    } catch {
      // Ignore storage access errors
    }
  }
}
