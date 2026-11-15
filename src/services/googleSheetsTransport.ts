import { extractGoogleSpreadsheetId } from './productCodeUtils';

/**
 * Resilient transport for public Google Sheets.
 *
 * ليه الملف ده موجود:
 * جوجل بيرجّع أخطاء مؤقتة كتير على نفس الرابط — `400` على رابط الـxlsx
 * الموقّع (`doc-XX-sheets.googleusercontent.com/export/...`) لما التوكن
 * ينتهي بين الـredirect والطلب، و`ERR_CONNECTION_RESET` /
 * `ERR_QUIC_PROTOCOL_ERROR` على `docs.google.com`، وأحيانًا `429` من
 * الـrate-limit. الطلب الواحد (`fetch` مرة واحدة) كان بيفشل المزامنة كلها.
 *
 * الحل: لكل شيت بنبني قائمة روابط بديلة (gviz CSV / export CSV / pub CSV)،
 * وبنعيد المحاولة على الأخطاء المؤقتة بتراجع تدريجي، وبنعيد طلب الرابط
 * الأصلي لو جوجل حوّلنا لرابط موقّع منتهي الصلاحية.
 */

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 20_000;

/** أخطاء شبكة مؤقتة تستاهل إعادة المحاولة */
function isRetryableError(err: any): boolean {
  if (!err) return false;
  const name = String(err?.name || '');
  const message = String(err?.message || '');
  if (name === 'AbortError') return true;
  return /failed to fetch|networkerror|load failed|err_|econnreset|etimedout|timeout|fetch/i.test(
    message
  );
}

/** رموز HTTP مؤقتة: 408/425/429 وأي 5xx */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface GoogleSheetFetchOptions {
  /** عدد المحاولات لكل رابط (افتراضي 3) */
  attempts?: number;
  /** مهلة الطلب الواحد بالميلي ثانية (افتراضي 20 ثانية) */
  timeoutMs?: number;
}

/**
 * `fetch` مع مهلة وإعادة محاولة على الأخطاء المؤقتة فقط.
 * بيرجع أول Response ناجح؛ أخطاء 4xx (زي 403/404) بتترجع زي ما هي عشان
 * المستخدم يشوف رسالة واضحة بدل ما نلفّ على روابط بديلة بلا فايدة.
 */
export async function fetchGoogleSheetResponse(
  url: string,
  options: GoogleSheetFetchOptions = {}
): Promise<Response> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
      });

      // جوجل بيعمل redirect لتوقيع مؤقت على googleusercontent. لو التوقيع
      // انتهى بين الـredirect والطلب بيرجع 400 على رابط مختلف عن الأصلي —
      // بنعيد طلب الرابط الأصلي عشان يصدر توقيع جديد.
      if (response.status === 400 && response.redirected) {
        lastError = new Error('Google redirect expired');
      } else if (isRetryableStatus(response.status)) {
        lastError = new Error(`HTTP ${response.status}`);
      } else {
        return response;
      }
    } catch (err: any) {
      lastError = err;
      if (!isRetryableError(err) && err?.name !== 'AbortError') {
        // خطأ غير شبكي (CORS مثلًا) — إعادة المحاولة مش هتفيد.
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts) {
      const backoff = Math.min(500 * 2 ** (attempt - 1), 4_000);
      await sleep(backoff);
    }
  }

  throw lastError ?? new Error('فشل الاتصال بجوجل شيت');
}

/**
 * قائمة روابط CSV بديلة لأي شيت عام.
 * الترتيب مقصود: gviz (الأسرع) ثم export ثم pub.
 */
export function buildGoogleSheetCsvCandidates(urlOrId: string): string[] {
  const clean = (urlOrId || '').trim();
  if (!clean) return [];

  // روابط "النشر على الويب" (pub/pubhtml) فيها معرّف|/d/e/... مختلف عن
  // معرّف الشيت العادي — لو أعدنا بناء الرابط منه هيبوظ. نستخدمه زي ما هو.
  if (/\/pub(?:html)?/i.test(clean)) {
    const pubCsv = /output=csv/i.test(clean)
      ? clean
      : clean.replace(/\/pubhtml?.*$/i, '/pub?output=csv');
    return [pubCsv];
  }

  const { sheetId, gid } = extractGoogleSpreadsheetId(clean);

  // رابط مش Google Sheets (رابط CSV مباشر مثلًا) — نستخدمه زي ما هو.
  if (!sheetId) {
    return /^https?:\/\//i.test(clean) ? [clean] : [];
  }

  const base = `https://docs.google.com/spreadsheets/d/${sheetId}`;
  const candidates = [
    `${base}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `${base}/export?format=csv&gid=${gid}`,
    `${base}/pub?output=csv&gid=${gid}`,
  ];

  return candidates;
}

/**
 * يجلب محتوى الشيت كـ ArrayBuffer خام من أول رابط ناجح.
 * بيرمي خطأ عربي واضح لو كل الروابط فشلت.
 */
export async function fetchGoogleSheetCsvBuffer(
  urlOrId: string,
  options: GoogleSheetFetchOptions = {}
): Promise<{ buffer: ArrayBuffer; url: string }> {
  const candidates = buildGoogleSheetCsvCandidates(urlOrId);
  if (candidates.length === 0) {
    throw new Error('رابط Google Sheets غير صالح. يرجى التأكد من نسخ رابط الشيت كاملاً.');
  }

  let lastError: any = null;

  for (const url of candidates) {
    try {
      const response = await fetchGoogleSheetResponse(url, options);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        lastError = new Error('الشيت فارغ');
        continue;
      }

      // جوجل أحيانًا بيرجّع صفحة خطأ HTML بكود 200 — مش CSV.
      const head = new TextDecoder('utf-8').decode(new Uint8Array(buffer).subarray(0, 512));
      if (/^\s*(<!doctype\s+html|<html)/i.test(head)) {
        lastError = new Error('رد جوجل مش CSV');
        continue;
      }

      return { buffer, url };
    } catch (err: any) {
      lastError = err;
    }
  }

  const reason = lastError?.message ? ` (${lastError.message})` : '';
  throw new Error(
    `تعذر جلب الشيت${reason}. تأكد من أن الشيت منشور للعامة (Anyone with the link can view) وأن الاتصال مستقر.`
  );
}

/**
 * يجلب محتوى الشيت كنص CSV (مع فك ترميز UTF-8 / Windows-1256) من أول رابط ناجح.
 */
export async function fetchGoogleSheetCsv(
  urlOrId: string,
  options: GoogleSheetFetchOptions = {}
): Promise<{ text: string; url: string }> {
  const { buffer, url } = await fetchGoogleSheetCsvBuffer(urlOrId, options);
  // مكتبة فك الترميز بتجرّ xlsx معها، فنحمّلها عند الحاجة بس.
  const { decodeBufferSmart } = await import('./encodingService');
  return { text: decodeBufferSmart(buffer).replace(/^\uFEFF/, ''), url };
}

/**
 * يحمّل الشيت كامل (xlsx) عشان يتقرأ كل التبويبات مش gid=0 بس.
 * بيرجع null لو الملف مش عام أو فشل التحميل بعد كل المحاولات.
 */
export async function fetchGoogleSheetWorkbookBuffer(
  sheetId: string,
  options: GoogleSheetFetchOptions = {}
): Promise<ArrayBuffer | null> {
  if (!sheetId) return null;
  try {
    const response = await fetchGoogleSheetResponse(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`,
      { attempts: 3, timeoutMs: 30_000, ...options }
    );
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength < 128) return null;
    return buffer;
  } catch {
    return null;
  }
}