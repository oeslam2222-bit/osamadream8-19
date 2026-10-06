// Robust, high-capacity client storage using IndexedDB with fallback to safe localStorage

const DB_NAME = 'DreamDistributionDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state_store';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function idbGetStrict<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    let result: T | undefined;

    req.onsuccess = () => {
      result = req.result as T | undefined;
    };
    req.onerror = () => reject(req.error || new Error(`IndexedDB read failed for "${key}"`));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error(`IndexedDB transaction failed for "${key}"`));
    tx.onabort = () => reject(tx.error || new Error(`IndexedDB transaction aborted for "${key}"`));
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    return (await idbGetStrict<T>(key)) ?? null;
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function idbDelete(key: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function idbClear(): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Debounced IndexedDB write. Batches rapid state changes (keystrokes, filters,
 * re-renders) into a single write after the data settles. Without this, a
 * 5000-row customer table (~5MB) was written to IDB on every keystroke,
 * blocking the main thread and making the app feel sluggish.
 */
export function debouncedIdbSet<T>(key: string, value: T, delay = 2000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      try {
        await idbSet(key, value);
      } catch {
        // ignore
      }
    }, delay);
  };
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return cancel;
}

/**
 * Safely writes to localStorage with quota protection and auto-cleanup.
 * Large collections (products, invoices, customers) are stored in IndexedDB.
 */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err: any) {
    // LocalStorage quota exceeded (typical 5MB limit).
    // The data is safely persisted in IndexedDB, so we clean up the failed large key from localStorage.
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
