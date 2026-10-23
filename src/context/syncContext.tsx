import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface SyncContextType {
  isOffline: boolean;
  syncStatus: SyncStatus;
  isSupabaseSyncing: boolean;
  pendingInvoicesCount: number;
  offlineQueueCount: number;
  supabaseStatus: { connected: boolean; tableFound: string };
  syncData: () => Promise<void>;
  flushPendingInvoices: () => Promise<{ success: boolean; syncedCount: number }>;
  setIsOffline: (offline: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setIsSupabaseSyncing: (syncing: boolean) => void;
  setPendingInvoicesCount: (count: number) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOfflineState] = useState(false);
  const [syncStatus, setSyncStatusState] = useState<SyncStatus>('idle');
  const [isSupabaseSyncing, setIsSupabaseSyncingState] = useState(false);
  const [pendingInvoicesCount, setPendingInvoicesCountState] = useState(0);
  const [offlineQueueCount, setOfflineQueueCountState] = useState(0);
  const [supabaseStatus, setSupabaseStatusState] = useState({ connected: false, tableFound: 'جاري الفحص والاتصال...' });

  useEffect(() => {
    const handleOnline = () => setIsOfflineState(false);
    const handleOffline = () => setIsOfflineState(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOfflineState(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncData = useCallback(async () => {
    setSyncStatusState('syncing');
    try {
      setSyncStatusState('synced');
    } catch {
      setSyncStatusState('error');
    }
  }, []);

  const flushPendingInvoices = useCallback(async () => {
    return { success: true, syncedCount: 0 };
  }, []);

  const setIsOffline = useCallback((offline: boolean) => setIsOfflineState(offline), []);
  const setSyncStatus = useCallback((status: SyncStatus) => setSyncStatusState(status), []);
  const setIsSupabaseSyncing = useCallback((syncing: boolean) => setIsSupabaseSyncingState(syncing), []);
  const setPendingInvoicesCount = useCallback((count: number) => setPendingInvoicesCountState(count), []);

  const value = useMemo(() => ({
    isOffline, syncStatus, isSupabaseSyncing, pendingInvoicesCount, offlineQueueCount, supabaseStatus,
    syncData, flushPendingInvoices,
    setIsOffline, setSyncStatus, setIsSupabaseSyncing, setPendingInvoicesCount
  }), [isOffline, syncStatus, isSupabaseSyncing, pendingInvoicesCount, offlineQueueCount, supabaseStatus, syncData, flushPendingInvoices, setIsOffline, setSyncStatus, setIsSupabaseSyncing, setPendingInvoicesCount]);

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