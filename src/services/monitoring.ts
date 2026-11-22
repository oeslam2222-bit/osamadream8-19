/**
 * مراقبة الأخطاء (Sentry) — اختيارية وآمنة افتراضيًا.
 *
 * التهيئة بتتم فقط لما VITE_SENTRY_DSN يكون مضبوطًا في بيئة البناء. الملف
 * بيحمّل SDK بشكل ديناميكي، فلو مفيش DSN (بيئة تطوير أو نشر داخلي) مش
 * بيتضاف أي كود Sentry للحزمة الأساسية أصلاً.
 *
 * الملاحظات الأمنية:
 *   - sendDefaultPii: false — مفيش IP/كوكيز/بيانات هوية بتتبعت تلقائيًا.
 *   - beforeSend بيمسح الحقول الحساسة من الـextra/contexts قبل الإرسال
 *     (أي مفتاح اسمه password/token/secret/credential).
 *   - مفيش حقن لـ DSN في الكود: القيمة بتجي من متغيرات البيئة وقت البناء.
 */

const SENSITIVE_KEY = /pass(word)?|token|secret|credential|authorization|apikey|api_key/i;

function scrub<T>(value: T, depth = 0): T {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1)) as unknown as T;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : scrub(entry, depth + 1);
  }
  return out as T;
}

let initialized = false;

export function initMonitoring(): void {
  if (initialized || typeof window === 'undefined') return;

  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim();
  if (!dsn) return;

  initialized = true;
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_APP_RELEASE || undefined,
        // Sentry defaults to sendDefaultPii:false — لا نرفع IP أو هوية المستخدم.
        tracesSampleRate: 0.1,
        beforeSend(event) {
          if (event.extra) event.extra = scrub(event.extra);
          if (event.contexts) event.contexts = scrub(event.contexts);
          if (event.request?.headers) event.request.headers = {};
          return event;
        },
      });
    })
    .catch((error) => {
      console.warn('[monitoring] Sentry initialization failed:', error);
    });
}

/** يسجّل خطأ غير معالج يدويًا (مثل فشل مزامنة أو رفض صلاحية). */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) {
    console.error('[error]', error, context ? scrub(context) : '');
    return;
  }
  void import('@sentry/react')
    .then((Sentry) => {
      Sentry.captureException(error, context ? { extra: scrub(context) } : undefined);
    })
    .catch(() => {});
}
