/**
 * أنواع الأخطاء الشائعة من Supabase والشبكة
 */
export type NetworkErrorType =
  | 'network_error'      // انقطاع الإنترنت كلياً أو ضعف شديد
  | 'server_error'       // خطأ 5xx من السيرفر
  | 'not_found'          // خطأ 404 - مورد غير موجود
  | 'conflict'           // خطأ 409 - تعارض في البيانات
  | 'unauthorized'       // خطأ 401/403 - عدم صلاحية
  | 'timeout'            // انتهاء مهلة الطلب
  | 'unknown';           // خطأ غير محدد

/** فحص سريع لحالة انقطاع الإنترنت */
export function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** كشف الشبكات البطيئة (2G / 3G / وضع توفير البيانات) لزيادة المهلة وتخفيف الجلب */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  const effectiveType = String(conn.effectiveType || '').toLowerCase();
  return effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g';
}

/**
 * تصنيف الخطأ بناءً على رمز HTTP أو نوع الخطأ
 */
export function classifyError(error: any): NetworkErrorType {
  if (!error) return 'unknown';

  const msg = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const name = String(error?.name || '');

  // خطأ انتهاء المهلة
  if (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    code === 'ETIMEDOUT' ||
    code === 'NETWORK_TIMEOUT' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('مهلة')
  ) {
    return 'timeout';
  }

  // خطأ انقطاع أو ضعف الشبكة
  if (
    code === 'NETWORK_ERROR' ||
    code === 'OFFLINE' ||
    code === 'OFFLINE_NO_CONFIG' ||
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network') ||
    msg.includes('err_network') ||
    name === 'TypeError'
  ) {
    return 'network_error';
  }

  // أخطاء HTTP
  const status = Number(error?.status || error?.statusCode || 0);
  if (status) {
    if (status === 408) return 'timeout';
    if (status >= 500 || status === 429) return 'server_error';
    if (status === 409) return 'conflict';
    if (status === 404) return 'not_found';
    if (status === 401 || status === 403) return 'unauthorized';
  }

  return 'unknown';
}

/**
 * نص خطأ مفهوم بالعربية للعرض للمستخدم
 */
export function getErrorMessage(error: any, type: NetworkErrorType): string {
  switch (type) {
    case 'network_error':
      return isOfflineNow()
        ? 'أنت غير متصل بالإنترنت حالياً — يتم العمل على البيانات المحفوظة محلياً.'
        : 'الاتصال بالشبكة ضعيف أو غير مستقر. تم استخدام البيانات المحفوظة محلياً.';
    case 'server_error':
      return 'الخادم مشغول أو الشبكة بطيئة حالياً. حاول مرة أخرى بعد لحظات.';
    case 'not_found':
      return 'المورد المطلوب غير موجود.';
    case 'conflict':
      return 'بيانات متعارضة. حدّث الصفحة وحاول مرة أخرى.';
    case 'unauthorized':
      return 'انتهت صلاحية الجلسة أو لا توجد صلاحية كافية. يرجى تسجيل الدخول مرة أخرى.';
    case 'timeout':
      return 'الشبكة بطيئة وانتهت مهلة الانتظار — تم العرض من الذاكرة المحلية لتجنب التهنيج.';
    default:
      return error?.message || 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.';
  }
}

/**
 * معالجة خطأ Supabase وإرجاع نوع ورسالة خطأ مفهومة
 */
export function handleSupabaseError(error: any, context?: string): { type: NetworkErrorType; message: string } {
  const type = classifyError(error);
  const message = getErrorMessage(error, type);

  console.warn(`[Network Error] ${context || 'Unknown'}:`, {
    type,
    message,
    status: error?.status,
    code: error?.code,
    originalMessage: error?.message,
  });

  return { type, message };
}

/**
 * دالة مساعدة لإعادة المحاولة التلقائية للطلبات الفاشلة مع Backoff للشبكات الضعيفة
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 900,
  _context?: string
): Promise<T> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (isOfflineNow()) {
      throw new Error('لا يوجد اتصال بالإنترنت حالياً');
    }
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const type = classifyError(error);

      if (type === 'unauthorized' || type === 'not_found' || type === 'conflict') {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      const jitter = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt + jitter));
    }
  }

  throw lastError;
}

