import type { Customer, CustomerVisit } from '../types';

export type GpsCoords = { latitude: number; longitude: number; accuracy?: number };

const roundCoord = (n: number) => Math.round(n * 1e6) / 1e6; // ~0.11m, stable for compare/storage

export function captureGps(timeoutMs = 12000): Promise<GpsCoords | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: roundCoord(pos.coords.latitude),
          longitude: roundCoord(pos.coords.longitude),
          accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined,
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
      );
    } catch {
      resolve(null);
    }
  });
}

/** Haversine distance in meters */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function visitGps(v: CustomerVisit | undefined | null): GpsCoords | null {
  const lat = v?.location?.latitude ?? (v as any)?.latitude;
  const lon = v?.location?.longitude ?? (v as any)?.longitude;
  if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
    return { latitude: lat, longitude: lon, accuracy: v?.location?.accuracy };
  }
  return null;
}

export type Last3Compare = {
  current: GpsCoords | null;
  previous: Array<{ date?: string; coords: GpsCoords; distanceFromCurrentM?: number }>;
  alert?: string;
};

export function compareWithLast3Visits(visits: CustomerVisit[] | undefined, customerId: string, current: GpsCoords | null, currentVisitId?: string): Last3Compare {
  const list = (visits || []).filter((v) => v && v.customerId === customerId && v.id !== currentVisitId);
  // newest first by date/time/createdAt
  const sorted = [...list].sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));
  const prev: Last3Compare['previous'] = [];
  for (const v of sorted) {
    const c = visitGps(v);
    if (c) prev.push({ date: v.date, coords: c });
    if (prev.length >= 3) break;
  }
  if (current) {
    prev.forEach((p) => { p.distanceFromCurrentM = Math.round(distanceMeters(current, p.coords)); });
  }
  let alert: string | undefined;
  if (current && prev.length) {
    const far = prev.filter((p) => (p.distanceFromCurrentM ?? 0) > 300);
    if (far.length >= 2) alert = `تنبيه: موقع الزيارة الحالية يبعد أكثر من 300م عن ${far.length} من آخر ${prev.length} زيارات موثقة لهذا العميل.`;
    else if ((prev[0].distanceFromCurrentM ?? 0) > 1000) alert = `تنبيه: الموقع الحالي يبعد ${prev[0].distanceFromCurrentM}م عن آخر زيارة موثقة.`;
  } else if (!current) {
    alert = 'لم يتم التقاط إحداثيات GPS لهذه الزيارة (إذن مرفوض/تعذر التحديد).';
  }
  return { current, previous: prev, alert };
}

export function buildVisitLocation(coords: GpsCoords | null, fallback?: { latitude?: number; longitude?: number; address?: string; region?: string }) {
  const lat = coords?.latitude ?? (typeof fallback?.latitude === 'number' ? fallback.latitude : undefined);
  const lon = coords?.longitude ?? (typeof fallback?.longitude === 'number' ? fallback.longitude : undefined);
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  return {
    latitude: roundCoord(lat),
    longitude: roundCoord(lon),
    accuracy: coords?.accuracy,
    timestamp: new Date().toISOString(),
    address: fallback?.address || fallback?.region || '',
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${roundCoord(lat)},${roundCoord(lon)}`,
  };
}
