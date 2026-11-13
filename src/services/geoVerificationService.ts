import { Customer, CustomerVisit, UserRole } from '../types';

export const GEOFENCE_RADIUS_METERS = 200;
export const MAX_ACCEPTABLE_ACCURACY_METERS = 150;
export const MAX_PLAUSIBLE_SPEED_KMH = 130;

export type GeoVerificationStatus =
  | 'verified'
  | 'outside_range'
  | 'suspected_spoof'
  | 'low_accuracy'
  | 'no_gps'
  | 'unpinned_customer';

export interface LiveGpsReading {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export interface GeoVerificationResult {
  status: GeoVerificationStatus;
  distanceMeters?: number;
  accuracyMeters?: number;
  speedKmh?: number;
  flags: string[];
  label: string;
  requiresLivePhoto: boolean;
  requiresSupervisorReview: boolean;
  verifiedAt: string;
}

/** Haversine distance in meters between two GPS points */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} متر`;
  return `${(meters / 1000).toFixed(2)} كم`;
}

/** Supervisors, branch managers, admins, and developers can lock/unlock or override customer GPS */
export function canManageLocationLock(role?: UserRole | string): boolean {
  return ['supervisor', 'branch_manager', 'admin', 'developer'].includes(String(role || ''));
}

/** Strict live GPS request (maximumAge: 0 avoids stale cached positions) */
export function requestLiveGps(timeoutMs = 12000): Promise<
  { ok: true; coords: LiveGpsReading } | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ ok: false, error: 'المتصفح أو الجهاز لا يدعم نظام تحديد المواقع GPS' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : undefined,
            timestamp: new Date().toISOString(),
          },
        });
      },
      (err) => {
        let msg = 'تعذر الوصول إلى GPS — يرجى تفعيل الموقع في الهاتف والمتصفح.';
        if (err.code === 1) msg = 'تم رفض إذن الموقع GPS. يرجى السماح بالوصول للموقع.';
        else if (err.code === 2) msg = 'إشارة الـ GPS غير متوفرة حالياً، جرب التحقق في مكان مفتوح.';
        else if (err.code === 3) msg = 'انتهت مهلة قراءة الـ GPS، يرجى المحاولة مرة أخرى.';
        resolve({ ok: false, error: msg });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

function parseVisitTimestampMs(v: CustomerVisit): number | null {
  const candidates = [v.location?.timestamp, v.checkInTime, v.createdAt];
  for (const raw of candidates) {
    if (!raw) continue;
    const t = Date.parse(String(raw));
    if (Number.isFinite(t)) return t;
  }
  if (v.date) {
    const timePart = (v.time || '09:00').replace(/[^\d:]/g, '').slice(0, 8) || '09:00:00';
    const t = Date.parse(`${v.date}T${timePart}`);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * Multi-layer anti-spoofing & geofence verification for any field visit (visit, collection, return, order)
 */
export function verifyVisitLocation(params: {
  repGps: LiveGpsReading | null;
  customer?: Partial<Customer> | null;
  repVisits?: CustomerVisit[];
  repId?: string;
}): GeoVerificationResult {
  const { repGps, customer, repVisits = [], repId } = params;
  const nowIso = new Date().toISOString();
  const flags: string[] = [];

  if (!repGps || !Number.isFinite(repGps.latitude) || !Number.isFinite(repGps.longitude)) {
    return {
      status: 'no_gps',
      flags: ['no_live_gps'],
      label: 'لم يتم التقاط GPS حي',
      requiresLivePhoto: false,
      requiresSupervisorReview: true,
      verifiedAt: nowIso,
    };
  }

  const acc = repGps.accuracy;
  // 1. Accuracy anomalies (Fake GPS apps often report 0 or exact 1m, while weak indoor cells report > 250m)
  if (acc !== undefined && acc === 0) {
    flags.push('zero_accuracy_anomaly');
  }
  if (acc !== undefined && acc > MAX_ACCEPTABLE_ACCURACY_METERS) {
    flags.push(`low_accuracy_${Math.round(acc)}m`);
  }

  // 2. Compare against rep's recent GPS visits (last 4 hours) for impossible speed & identical coordinate clones
  const nowMs = Date.now();
  const recentRepVisits = repVisits
    .filter((v) => {
      if (repId && v.repId && v.repId !== repId) return false;
      if (!v.location?.latitude || !v.location?.longitude) return false;
      const ts = parseVisitTimestampMs(v);
      return ts !== null && nowMs - ts >= 0 && nowMs - ts <= 4 * 60 * 60 * 1000;
    })
    .sort((a, b) => (parseVisitTimestampMs(b) || 0) - (parseVisitTimestampMs(a) || 0));

  let maxSpeedKmh: number | undefined;
  const latestVisit = recentRepVisits[0];
  if (latestVisit?.location) {
    const prevLat = latestVisit.location.latitude;
    const prevLng = latestVisit.location.longitude;
    const prevTs = parseVisitTimestampMs(latestVisit);

    // Exact 6-decimal coordinate match for a DIFFERENT customer -> strong static mock-provider signal
    if (
      customer?.id &&
      latestVisit.customerId !== customer.id &&
      Math.abs(prevLat - repGps.latitude) < 1e-6 &&
      Math.abs(prevLng - repGps.longitude) < 1e-6
    ) {
      flags.push('exact_pin_clone');
    }

    if (prevTs !== null) {
      const distMeters = calculateDistanceMeters(prevLat, prevLng, repGps.latitude, repGps.longitude);
      const elapsedHours = Math.max((nowMs - prevTs) / 3600000, 1 / 3600); // min 1 sec guard
      if (distMeters > 1000) {
        const speedKmh = Math.round((distMeters / 1000) / elapsedHours);
        maxSpeedKmh = speedKmh;
        if (speedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
          flags.push(`impossible_speed_${speedKmh}kmh`);
        }
      }
    }
  }

  // 3. Distance to customer's primary coordinates
  let distanceMeters: number | undefined;
  if (customer?.latitude && customer?.longitude) {
    distanceMeters = calculateDistanceMeters(
      repGps.latitude,
      repGps.longitude,
      customer.latitude,
      customer.longitude
    );
    if (distanceMeters > GEOFENCE_RADIUS_METERS) {
      flags.push(`outside_geofence_${distanceMeters}m`);
    }
  } else {
    flags.push('customer_unpinned');
  }

  const hasSpoofFlag = flags.some(
    (f) => f.startsWith('impossible_speed') || f === 'exact_pin_clone' || f === 'zero_accuracy_anomaly'
  );
  const hasOutsideFlag = distanceMeters !== undefined && distanceMeters > GEOFENCE_RADIUS_METERS;
  const hasLowAccFlag = acc !== undefined && acc > MAX_ACCEPTABLE_ACCURACY_METERS;

  if (hasSpoofFlag) {
    return {
      status: 'suspected_spoof',
      distanceMeters,
      accuracyMeters: acc,
      speedKmh: maxSpeedKmh,
      flags,
      label: 'اشتباه تلاعب بالموقع (مراجعة)',
      requiresLivePhoto: true,
      requiresSupervisorReview: true,
      verifiedAt: nowIso,
    };
  }

  if (hasOutsideFlag) {
    return {
      status: 'outside_range',
      distanceMeters,
      accuracyMeters: acc,
      speedKmh: maxSpeedKmh,
      flags,
      label: `خارج النطاق (${formatDistance(distanceMeters!)})`,
      requiresLivePhoto: true,
      requiresSupervisorReview: true,
      verifiedAt: nowIso,
    };
  }

  if (!customer?.latitude || !customer?.longitude) {
    return {
      status: 'unpinned_customer',
      accuracyMeters: acc,
      speedKmh: maxSpeedKmh,
      flags,
      label: 'العميل بدون موقع مثبت',
      requiresLivePhoto: false,
      requiresSupervisorReview: false,
      verifiedAt: nowIso,
    };
  }

  if (hasLowAccFlag) {
    return {
      status: 'low_accuracy',
      distanceMeters,
      accuracyMeters: acc,
      speedKmh: maxSpeedKmh,
      flags,
      label: `دقة GPS ضعيفة (±${acc}م)`,
      requiresLivePhoto: false,
      requiresSupervisorReview: true,
      verifiedAt: nowIso,
    };
  }

  return {
    status: 'verified',
    distanceMeters,
    accuracyMeters: acc,
    speedKmh: maxSpeedKmh,
    flags: [],
    label: `موقع موثق (${formatDistance(distanceMeters ?? 0)})`,
    requiresLivePhoto: false,
    requiresSupervisorReview: false,
    verifiedAt: nowIso,
  };
}

/**
 * Draws a tamper-resistant visual stamp (Customer, Rep, Date/Time, GPS & Distance) onto a live camera photo
 * and compresses to ~60-90KB JPEG ready for Cloudinary upload.
 */
export function watermarkAndCompressLivePhoto(
  file: File,
  meta: {
    customerName: string;
    repName: string;
    latitude?: number;
    longitude?: number;
    distanceMeters?: number;
    reason?: string;
  }
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const maxW = 900;
        const maxH = 900;
        let width = img.width;
        let height = img.height;
        if (width > maxW) {
          height = Math.round((height * maxW) / width);
          width = maxW;
        }
        if (height > maxH) {
          width = Math.round((width * maxH) / height);
          height = maxH;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(width, 320);
        canvas.height = Math.max(height, 240);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objUrl);
          reject(new Error('تعذر تهيئة الكاميرا لختم الصورة'));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const barHeight = Math.max(66, Math.round(canvas.height * 0.14));
        ctx.fillStyle = 'rgba(7, 23, 38, 0.82)';
        ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

        const nowLabel = new Date().toLocaleString('en-GB', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        const gpsText =
          meta.latitude !== undefined && meta.longitude !== undefined
            ? `GPS: ${meta.latitude.toFixed(5)}, ${meta.longitude.toFixed(5)}${
                meta.distanceMeters !== undefined ? ` | Dist: ${meta.distanceMeters}m` : ''
              }`
            : 'GPS: Unavailable';

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 13px Cairo, Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(
          `${meta.customerName || 'Customer'} • ${meta.repName || 'Rep'}`,
          canvas.width - 12,
          canvas.height - barHeight + 22
        );

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(gpsText, 12, canvas.height - barHeight + 44);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#fde68a';
        ctx.fillText(
          `${nowLabel}${meta.reason ? ` • ${meta.reason}` : ''}`,
          canvas.width - 12,
          canvas.height - barHeight + 44
        );

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objUrl);
            if (!blob) {
              reject(new Error('فشل ضغط الصورة المختومة'));
              return;
            }
            const stampedName = `proof_${Date.now()}.jpg`;
            resolve(new File([blob], stampedName, { type: 'image/jpeg', lastModified: Date.now() }));
          },
          'image/jpeg',
          0.72
        );
      } catch (err) {
        URL.revokeObjectURL(objUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objUrl);
      reject(new Error('فشل تحميل الصورة الملتقطة'));
    };
    img.src = objUrl;
  });
}

/* ============================================================================
 * Compact Zero-Egress Tag Serialization in `notes`
 * Guarantees customer GPS/lock and visit geo-verification persist in Supabase
 * immediately even before running optional dedicated SQL column migrations,
 * while keeping visible `notes` clean.
 * ============================================================================ */

const CUSTOMER_GEO_TAG_REGEX = /\n?\[GEO_META:([^\]]+)\]/g;
const VISIT_GEO_TAG_REGEX = /\n?\[GEO_VERIFY:([^\]]+)\]/g;
const VISIT_GPS_LEGACY_REGEX = /\n?\[موقع GPS:\s*([-0-9.]+)\s*,\s*([-0-9.]+)\]/;

export interface CustomerGeoMeta {
  lat?: number;
  lng?: number;
  addr?: string;
  at?: string;
  by?: string;
  locked?: boolean;
  appBy?: string;
  appAt?: string;
  photo?: string;
  acc?: number;
}

export function sanitizeNonBase64Url(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = String(url).trim();
  if (!trimmed) return undefined;
  if (/^data:image\//i.test(trimmed)) return undefined;
  return trimmed;
}

export function encodeCustomerNotesWithGeo(customer: Partial<Customer>): string {
  const cleanNotes = String(customer.notes || '').replace(CUSTOMER_GEO_TAG_REGEX, '').trim();
  if (customer.latitude === undefined || customer.longitude === undefined) {
    return cleanNotes;
  }
  const safePhotoUrl = sanitizeNonBase64Url(customer.locationPhotoUrl);
  const meta: CustomerGeoMeta = {
    lat: Number(customer.latitude.toFixed(6)),
    lng: Number(customer.longitude.toFixed(6)),
    ...(customer.locationCapturedAt ? { at: customer.locationCapturedAt } : {}),
    ...(customer.locationCapturedBy ? { by: customer.locationCapturedBy } : {}),
    ...(customer.locationLocked ? { locked: true } : {}),
    ...(customer.locationApprovedBy ? { appBy: customer.locationApprovedBy } : {}),
    ...(customer.locationApprovedAt ? { appAt: customer.locationApprovedAt } : {}),
    ...(safePhotoUrl ? { photo: safePhotoUrl } : {}),
    ...(customer.locationAccuracy !== undefined ? { acc: Math.round(customer.locationAccuracy) } : {}),
  };
  const tag = `[GEO_META:${JSON.stringify(meta)}]`;
  return cleanNotes ? `${cleanNotes}\n${tag}` : tag;
}

export function extractCustomerGeoFromNotes(rawNotes?: string | null): {
  cleanNotes: string;
  meta: CustomerGeoMeta | null;
} {
  const text = String(rawNotes || '');
  let meta: CustomerGeoMeta | null = null;
  const match = text.match(/\[GEO_META:([^\]]+)\]/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object') {
        meta = {
          ...parsed,
          photo: sanitizeNonBase64Url(parsed.photo),
        };
      }
    } catch {}
  }
  const cleanNotes = text.replace(CUSTOMER_GEO_TAG_REGEX, '').trim();
  return { cleanNotes, meta };
}

export function encodeVisitGeoVerificationTag(v: Partial<CustomerVisit>): string {
  if (!v.geoVerification) return '';
  const safeProofPhoto = sanitizeNonBase64Url(v.geoVerification.proofPhotoUrl);
  const payload = {
    s: v.geoVerification.status,
    ...(v.geoVerification.distanceMeters !== undefined ? { d: v.geoVerification.distanceMeters } : {}),
    ...(v.geoVerification.accuracyMeters !== undefined ? { a: v.geoVerification.accuracyMeters } : {}),
    ...(v.geoVerification.speedKmh !== undefined ? { v: v.geoVerification.speedKmh } : {}),
    ...(v.geoVerification.flags && v.geoVerification.flags.length > 0 ? { f: v.geoVerification.flags } : {}),
    ...(safeProofPhoto ? { p: safeProofPhoto } : {}),
    ...(v.geoVerification.verifiedAt ? { t: v.geoVerification.verifiedAt } : {}),
  };
  return `[GEO_VERIFY:${JSON.stringify(payload)}]`;
}

export function extractVisitGeoFromNotes(rawNotes?: string | null): {
  cleanNotes: string;
  parsedCoords?: { latitude: number; longitude: number };
  geoVerification?: CustomerVisit['geoVerification'];
} {
  let text = String(rawNotes || '');
  let parsedCoords: { latitude: number; longitude: number } | undefined;
  let geoVerification: CustomerVisit['geoVerification'] | undefined;

  const verifyMatch = text.match(/\[GEO_VERIFY:([^\]]+)\]/);
  if (verifyMatch && verifyMatch[1]) {
    try {
      const p = JSON.parse(verifyMatch[1]);
      if (p && p.s) {
        geoVerification = {
          status: p.s,
          distanceMeters: p.d,
          accuracyMeters: p.a,
          speedKmh: p.v,
          flags: Array.isArray(p.f) ? p.f : undefined,
          proofPhotoUrl: sanitizeNonBase64Url(p.p),
          verifiedAt: p.t,
        };
      }
    } catch {}
  }

  const gpsMatch = text.match(VISIT_GPS_LEGACY_REGEX);
  if (gpsMatch) {
    const lat = Number(gpsMatch[1]);
    const lng = Number(gpsMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      parsedCoords = { latitude: lat, longitude: lng };
    }
  }

  const cleanNotes = text.replace(VISIT_GEO_TAG_REGEX, '').trim();
  return { cleanNotes, parsedCoords, geoVerification };
}

export function geoStatusBadgeMeta(status?: GeoVerificationStatus): {
  label: string;
  tone: 'ok' | 'warn' | 'risk' | 'gray';
} {
  switch (status) {
    case 'verified':
      return { label: 'موقع موثق', tone: 'ok' };
    case 'outside_range':
      return { label: 'خارج النطاق', tone: 'warn' };
    case 'suspected_spoof':
      return { label: 'اشتباه GPS', tone: 'risk' };
    case 'low_accuracy':
      return { label: 'دقة ضعيفة', tone: 'warn' };
    case 'no_gps':
      return { label: 'بدون GPS', tone: 'gray' };
    case 'unpinned_customer':
      return { label: 'عميل غير مثبت', tone: 'gray' };
    default:
      return { label: 'غير مفحوص', tone: 'gray' };
  }
}
