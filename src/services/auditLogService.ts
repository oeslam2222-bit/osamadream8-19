import { idbGet, idbSet } from './storageService';
import type { AuditLog } from '../types';

const STORAGE_KEY = 'tantawy_audit_logs_v2';
const MAX_LOGS = 1200;

export async function getAuditLogs(): Promise<AuditLog[]> {
  const logs = await idbGet<AuditLog[]>(STORAGE_KEY);
  return Array.isArray(logs) ? logs : [];
}

export async function appendAuditLog(log: AuditLog): Promise<void> {
  const logs = await getAuditLogs();
  const next = [log, ...logs].slice(0, MAX_LOGS);
  await idbSet(STORAGE_KEY, next);
}

export async function clearAuditLogsStorage(): Promise<void> {
  await idbSet(STORAGE_KEY, []);
}

export function formatAuditTime(date = new Date()): { timestamp: string; formattedTime: string } {
  const timestamp = date.toISOString();
  const formattedTime = date.toLocaleString('ar-EG', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
  return { timestamp, formattedTime };
}

export function createAuditLog(input: Omit<AuditLog, 'id' | 'timestamp' | 'formattedTime'>): AuditLog {
  const { timestamp, formattedTime } = formatAuditTime();
  return {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    formattedTime,
    ...input,
  };
}
