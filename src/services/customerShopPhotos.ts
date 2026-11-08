/**
 * Safe local storage for customer shop photos (up to 3).
 * No Supabase schema changes. Photos are uploaded to Cloudinary (compressed ~100KB)
 * and only URLs are stored locally per customer id.
 */
export type ShopPhoto = { url: string; publicId?: string; uploadedAt?: string };

const KEY = 'tantawy_customer_shop_photos_v1';

function readAll(): Record<string, ShopPhoto[]> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, ShopPhoto[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function getLocalShopPhotos(customerId: string): ShopPhoto[] {
  if (!customerId) return [];
  const all = readAll();
  const arr = all[customerId];
  return Array.isArray(arr) ? arr.slice(0, 3) : [];
}

export function setLocalShopPhotos(customerId: string, photos: ShopPhoto[]) {
  if (!customerId) return;
  const all = readAll();
  all[customerId] = (photos || []).slice(0, 3);
  writeAll(all);
}

export function mergeShopPhotos(customer: { id: string; shopPhotos?: ShopPhoto[] } | null | undefined): ShopPhoto[] {
  if (!customer) return [];
  const fromObj = Array.isArray(customer.shopPhotos) ? customer.shopPhotos : [];
  const local = getLocalShopPhotos(customer.id);
  const seen = new Set<string>();
  const out: ShopPhoto[] = [];
  for (const p of [...fromObj, ...local]) {
    if (p?.url && !seen.has(p.url)) { seen.add(p.url); out.push(p); }
    if (out.length >= 3) break;
  }
  return out;
}
