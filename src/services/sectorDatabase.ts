import { createClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from './supabaseService';

// ============================================================================
// إدارة قواعد البيانات المنفصلة لكل قطاع
// كل قطاع (منزلي / كهربائي) له قاعدة بيانات مستقلة لعزل كامل للبيانات
// ============================================================================

export type Sector = 'home' | 'electrical' | 'both' | 'all';

export interface SectorDatabaseConfig {
  url: string;
  anonKey: string;
}

function isValidSupabaseConfig(url?: string, anonKey?: string): boolean {
  const trimmedUrl = (url || '').trim();
  const trimmedKey = (anonKey || '').trim();
  return Boolean(
    trimmedUrl &&
    trimmedKey &&
    /^https?:\/\//i.test(trimmedUrl) &&
    !trimmedUrl.includes('YOUR-PROJECT') &&
    !trimmedUrl.includes('offline-local.supabase.co')
  );
}

// قراءة إعدادات قواعد البيانات من متغيرات البيئة
// إذا لم توجد، نستخدم قاعدة واحدة لكل شيء (الافتراضي)
function getSectorConfig(sector: Sector): SectorDatabaseConfig | null {
  if (sector === 'home') {
    const url = import.meta.env.VITE_SUPABASE_HOME_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_HOME_ANON_KEY;
    if (isValidSupabaseConfig(url, anonKey)) return { url: url!.trim(), anonKey: anonKey!.trim() };
  }
  if (sector === 'electrical') {
    const url = import.meta.env.VITE_SUPABASE_ELECTRICAL_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ELECTRICAL_ANON_KEY;
    if (isValidSupabaseConfig(url, anonKey)) return { url: url!.trim(), anonKey: anonKey!.trim() };
  }
  // sector === 'both' || sector === 'all' → استخدم القاعدة الافتراضية
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  if (!isValidSupabaseConfig(url, anonKey)) return null;
  return { url: url.trim(), anonKey: anonKey.trim() };
}

// ذاكرة تخزين مؤقت للعملاء لكل قطاع (تجنب إعادة إنشاء العميل لكل عملية)
const sectorClients = new Map<Sector, any>();

export function getSupabaseClientForSector(sector: Sector): any {
  if (sectorClients.has(sector)) {
    return sectorClients.get(sector)!;
  }

  const config = getSectorConfig(sector);
  if (!config || !isValidSupabaseConfig(config.url, config.anonKey)) {
    sectorClients.set(sector, defaultSupabase);
    return defaultSupabase;
  }

  const client = createClient(config.url, config.anonKey, {
    global: {
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        Pragma: 'no-cache',
      },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  sectorClients.set(sector, client);
  return client;
}

/**
 * 가져올 العميل المناسـب بناءً على قطاع المستخدم الحالي
 * لو المستخدم sector = 'both' أو 'all' يرجع العميل الافتراضي (يشوف الكل)
 */
export function getSupabaseClientForUser(userSector?: Sector): any {
  if (!userSector || userSector === 'all' || userSector === 'both') {
    return defaultSupabase;
  }
  return getSupabaseClientForSector(userSector);
}

/**
 * تحديد القطاع من رابط جوجل شيت أو من إعدادات الرفع
 * لو الرابط يحتوي على 'home' يكون منزلي، 'electrical' يكون كهربائي
 */
export function detectSectorFromSheetUrl(url: string): Sector | null {
  const lower = url.toLowerCase();
  if (lower.includes('electrical') || lower.includes('كهرباء') || lower.includes('electric')) {
    return 'electrical';
  }
  if (lower.includes('home') || lower.includes('منزلي') || lower.includes('residential')) {
    return 'home';
  }
  return null;
}