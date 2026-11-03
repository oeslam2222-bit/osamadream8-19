import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  getQueuedMutations,
  removeQueuedMutations,
  countQueuedMutations,
} from '../services/offlineQueueService';
import { getOfflineQueueCount } from '../services/offlineFirstService';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncContextType {
  isOffline: boolean;
  syncStatus: SyncStatus;
  isSupabaseSyncing: boolean;
  pendingInvoicesCount: number;
  offlineQueueCount: number;
  supabaseStatus: { connected: boolean; tableFound: string };
  backgroundSyncSupported: boolean;
  lastSyncedAt: number | null;
  syncData: () => Promise<void>;
  flushPendingInvoices: () => Promise<{ success: boolean; syncedCount: number }>;
  registerBackgroundSync: () => Promise<boolean>;
  setIsOffline: (offline: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setIsSupabaseSyncing: (syncing: boolean) => void;
  setPendingInvoicesCount: (count: number) => void;
  /** AppContext injects its real offline-queue drainer here so SyncContext can call it. */
  setFlushRef: (fn: () => Promise<{ success: boolean; syncedCount: number }>) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOfflineState] = useState(false);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('idle');
  const [isSupabaseSyncing, setIsSupabaseSyncingState] = useState(false);
  const [pendingInvoicesCount, setPendingInvoicesCountState] = useState(0);
  const [offlineQueueCount, setOfflineQueueCountState] = useState(0);
  const [backgroundSyncSupported, setBackgroundSyncSupported] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [supabaseStatus, setSupabaseStatusState] = useState({ connected: false, tableFound: 'جاري الفحص والاتصال...' });

  const flushRef = useRef<(() => Promise<{ success: boolean; syncedCount: number }>) | null>(null);

  const setFlushRefFn = useCallback(
    (fn: () => Promise<{ success: boolean; syncedCount: number }>) => {
      flushRef.current = fn;
    },
    []
  );

  // Detect connectivity changes
  useEffect(() => {
    const handleOnline = async () => {
      setIsOfflineState(false);
      await flushPendingQueue();
    };
    const handleOffline = () => setIsOfflineState(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOfflineState(!navigator.onLine);

    // Check if Background Sync API is available via Service Worker
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      setBackgroundSyncSupported(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen for background-sync messages from the Service Worker (sw.js postMessage)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'BG_SYNC_REQUEST') {
        flushPendingQueue();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const flushPendingQueue = useCallback(async (): Promise<{ success: boolean; syncedCount: number }> => {
    if (flushRef.current) {
      return flushRef.current();
    }
    return { success: true, syncedCount: 0 };
  }, []);

  const registerBackgroundSync = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register('sync-offline-data');
        return true;
      }
    } catch (e) {
      console.warn('Background Sync registration failed:', e);
    }
    return false;
  }, []);

  const syncData = useCallback(async () => {
    setSyncStatusState('syncing');
    try {
      await flushPendingQueue();
      setSyncStatusState('synced');
      setLastSyncedAt(Date.now());
    } catch {
      setSyncStatusState('error');
    }
  }, [flushPendingQueue]);

  const flushPendingInvoices = useCallback(async () => {
    return flushPendingQueue();
  }, [flushPendingQueue]);

  const setIsOffline = useCallback((offline: boolean) => setIsOfflineState(offline), []);
  const setSyncStatus = useCallback((status: SyncStatus) => setSyncStatusState(status), []);
  const setIsSupabaseSyncing = useCallback((syncing: boolean) => setIsSupabaseSyncingState(syncing), []);
  const setPendingInvoicesCount = useCallback((count: number) => setPendingInvoicesCountState(count), []);

  const value = useMemo(() => ({
    isOffline, syncStatus, isSupabaseSyncing, pendingInvoicesCount, offlineQueueCount,
    backgroundSyncSupported, lastSyncedAt, supabaseStatus,
    syncData, flushPendingInvoices, registerBackgroundSync, setFlushRefFn,
    setIsOffline, setSyncStatus, setIsSupabaseSyncing, setPendingInvoicesCount
  }), [isOffline, syncStatus, isSupabaseSyncing, pendingInvoicesCount, offlineQueueCount,
    backgroundSyncSupported, lastSyncedAt, supabaseStatus, syncData, flushPendingInvoices,
    registerBackgroundSync, setFlushRefFn, setIsOffline, setSyncStatus, setIsSupabaseSyncing, setPendingInvoicesCount]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
