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

// قراءة إعدادات قواعد البيانات من متغيرات البيئة
// إذا لم توجد، نستخدم قاعدة واحدة لكل شيء (الافتراضي)
function getSectorConfig(sector: Sector): SectorDatabaseConfig | null {
  if (sector === 'home') {
    const url = import.meta.env.VITE_SUPABASE_HOME_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_HOME_ANON_KEY;
    if (url && anonKey) return { url, anonKey };
  }
  if (sector === 'electrical') {
    const url = import.meta.env.VITE_SUPABASE_ELECTRICAL_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ELECTRICAL_ANON_KEY;
    if (url && anonKey) return { url, anonKey };
  }
  // sector === 'both' || sector === 'all' → استخدم القاعدة الافتراضية
  const url = import.meta.env.VITE_SUPABASE_URL || 'https://rxthpgmlcsfckstpqhqf.supabase.co';
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dGhwZ21sY3NmY2tzdHBxaHFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDIwMzgsImV4cCI6MjEwMzIxODAzOH0.2v4eRUKQjLM0xDomaE9HAiy_qTJ6NoijNuwC3JV1ZUA';
  return { url, anonKey };
}

// ذاكرة تخزين مؤقت للعملاء لكل قطاع (تجنب إعادة إنشاء العميل لكل عملية)
const sectorClients = new Map<Sector, any>();

export function getSupabaseClientForSector(sector: Sector): any {
  if (sectorClients.has(sector)) {
    return sectorClients.get(sector)!;
  }

  const config = getSectorConfig(sector);
  if (!config) {
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