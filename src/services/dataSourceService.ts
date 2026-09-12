export type PublishedSourceKind = 'google_sheets' | 'excel_online' | 'power_bi';

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
    label: 'قاعدة العملاء / كافة العملاء',
    url: '',
    enabled: false,
    updatedAt: '',
  },
  products: {
    kind: 'google_sheets',
    label: 'رصيد المنتجات والمخزون',
    url: '',
    enabled: false,
    updatedAt: '',
  },
  targets: {
    kind: 'power_bi',
    label: 'لوحة أهداف المبيعات والتحصيل الشاملة',
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
    const parsed = JSON.parse(saved) as Partial<PublishedDataSources>;
    return {
      customers: { ...defaultSources.customers, ...(parsed.customers || {}) },
      products: { ...defaultSources.products, ...(parsed.products || {}) },
      targets: { ...defaultSources.targets, ...(parsed.targets || {}) },
    };
  } catch {
    return defaultSources;
  }
}

export function savePublishedDataSources(sources: PublishedDataSources): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

export function getPublishedCsvUrl(url: string): string {
  const clean = url.trim();
  if (!clean) return '';
  if (clean.includes('docs.google.com/spreadsheets')) {
    const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gid = clean.match(/[?#&]gid=([0-9]+)/)?.[1] || '0';
    return match ? `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${gid}` : clean;
  }
  return clean;
}

export function isValidPublishedSource(source: PublishedDataSource): boolean {
  return source.enabled && /^https?:\/\//i.test(source.url.trim());
}

export { defaultSources };
