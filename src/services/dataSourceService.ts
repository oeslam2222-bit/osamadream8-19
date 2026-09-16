export type PublishedSourceKind = 'google_sheets';

export type PublishedDataSource = {
  kind: PublishedSourceKind;
  label: string;
  url: string;
  enabled: boolean;
  updatedAt: string;
};

export type PublishedDataSources = {
  customers: PublishedDataSource;
  products: PublishedDataSource;
  targets: PublishedDataSource;
};

const STORAGE_KEY = 'dream_dist_published_data_sources_v1';

const defaultSources: PublishedDataSources = {
  customers: {
    kind: 'google_sheets',
    label: 'شيت العملاء والمديونيات والتارجت (Google Sheets)',
    url: '',
    enabled: false,
    updatedAt: '',
  },
  products: {
    kind: 'google_sheets',
    label: 'شيت الأصناف والمخزون والأسعار (Google Sheets)',
    url: '',
    enabled: false,
    updatedAt: '',
  },
  targets: {
    kind: 'google_sheets',
    label: 'شيت أهداف ومبيعات وتحصيلات المناديب (Google Sheets)',
    url: '',
    enabled: false,
    updatedAt: '',
  },
};

export function getPublishedDataSources(): PublishedDataSources {
  if (typeof window === 'undefined') return defaultSources;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSources;
    const parsed = JSON.parse(saved) as Record<string, Partial<PublishedDataSource>>;
    return {
      customers: {
        ...defaultSources.customers,
        ...(parsed.customers || {}),
        kind: 'google_sheets',
      },
      products: {
        ...defaultSources.products,
        ...(parsed.products || {}),
        kind: 'google_sheets',
      },
      targets: {
        ...defaultSources.targets,
        ...(parsed.targets || {}),
        kind: 'google_sheets',
      },
    };
  } catch {
    return defaultSources;
  }
}

export function savePublishedDataSources(sources: PublishedDataSources): void {
  if (typeof window === 'undefined') return;
  // Ensure all sources are strictly google_sheets
  const sanitized: PublishedDataSources = {
    customers: { ...sources.customers, kind: 'google_sheets' },
    products: { ...sources.products, kind: 'google_sheets' },
    targets: { ...sources.targets, kind: 'google_sheets' },
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

/**
 * Get the saved Google Sheet URL for a specific source
 */
export function getSavedSourceUrl(key: keyof PublishedDataSources): string {
  try {
    const sources = getPublishedDataSources();
    return sources[key]?.url || '';
  } catch {
    return '';
  }
}

/**
 * Save and persist a Google Sheet URL permanently for one of the three core sheets
 */
export function saveSingleSourceUrl(key: keyof PublishedDataSources, url: string, enable = true): void {
  if (typeof window === 'undefined') return;
  const current = getPublishedDataSources();
  const trimmed = url.trim();
  const next: PublishedDataSources = {
    ...current,
    [key]: {
      ...current[key],
      url: trimmed,
      enabled: enable && !!trimmed,
      updatedAt: new Date().toISOString(),
      kind: 'google_sheets',
    },
  };
  savePublishedDataSources(next);
  if (trimmed) {
    addToSavedSheetHistory(key, trimmed);
  }
}

const HISTORY_STORAGE_PREFIX = 'dream_dist_sheet_history_';

export function getSavedSheetHistory(key: keyof PublishedDataSources): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${HISTORY_STORAGE_PREFIX}${key}`);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function addToSavedSheetHistory(key: keyof PublishedDataSources, url: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = url.trim();
  if (!trimmed || !trimmed.startsWith('http')) return;
  try {
    const current = getSavedSheetHistory(key);
    const updated = [trimmed, ...current.filter((u) => u !== trimmed)].slice(0, 10);
    window.localStorage.setItem(`${HISTORY_STORAGE_PREFIX}${key}`, JSON.stringify(updated));
  } catch {}
}


export function getPublishedCsvUrl(url: string): string {
  const clean = url.trim();
  if (!clean) return '';
  if (clean.includes('docs.google.com/spreadsheets')) {
    // If it's already a pub?output=csv, return as is
    if (clean.includes('output=csv') || clean.includes('/pub?')) {
      return clean.replace('/pubhtml', '/pub?output=csv');
    }
    const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gid = clean.match(/[?#&]gid=([0-9]+)/)?.[1] || '0';
    return match ? `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${gid}` : clean;
  }
  return clean;
}

export function getGoogleSheetEmbedUrl(url: string): string {
  const clean = url.trim();
  if (!clean) return '';
  if (clean.includes('docs.google.com/spreadsheets')) {
    // If it's already pubhtml, ensure widget=true
    if (clean.includes('/pubhtml')) {
      return clean.includes('?') ? `${clean}&widget=true&headers=false` : `${clean}?widget=true&headers=false`;
    }
    // If standard edit or preview link, convert to preview or htmlembed
    const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gid = clean.match(/[?#&]gid=([0-9]+)/)?.[1] || '0';
    if (match) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/htmlembed?gid=${gid}&widget=false&chrome=false`;
    }
  }
  return clean;
}

export function isValidPublishedSource(source: PublishedDataSource): boolean {
  return source.enabled && /^https?:\/\//i.test(source.url.trim());
}

export { defaultSources };
