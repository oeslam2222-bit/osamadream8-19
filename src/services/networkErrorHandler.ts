/**
 * أنواع الأخطاء الشائعة من Supabase والشبكة
 */
export type NetworkErrorType = 
  | 'network_error'      // انقطاع الإنترنت كلياً
  | 'server_error'       // خطأ 5xx من السيرفر
  | 'not_found'          // خطأ 404 - مورد غير موجود
  | 'conflict'           // خطأ 409 - تعارض في البيانات
  | 'unauthorized'       // خطأ 401/403 - عدم صلاحية
  | 'timeout'            // انتهاء مهلة الطلب
  | 'unknown';           // خطأ غير محدد

/**
 * تصنيف الخطأ بناءً على رمز HTTP أو نوع الخطأ
 */
export function classifyError(error: any): NetworkErrorType {
  if (!error) return 'unknown';
  
  // خطأ انقطاع الشبكة
  if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('Failed to fetch') || 
      error?.message?.includes('network') || error?.name === 'TypeError') {
    return 'network_error';
  }
  
  // خطأ انتهاء المهلة
  if (error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout')) {
    return 'timeout';
  }
  
  // أخطاء HTTP
  const status = error?.status || error?.statusCode;
  if (status) {
    if (status >= 500) return 'server_error';
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
      return 'لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مرة أخرى.';
    case 'server_error':
      return 'خطأ في الخادم. يرجى المحاولة مرة أخرى لاحقًا.';
    case 'not_found':
      return 'المورد المطلوب غير موجود.';
    case 'conflict':
      return 'بيانات متعارضة. يrefresh الصفحة وحاول مرة أخرى.';
    case 'unauthorized':
      return 'غير مصرح لك بالوصول. يرجى تسجيل الدخول مرة أخرى.';
    case 'timeout':
      return 'انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.';
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
  
  // تسجيل الخطأ للتتبع
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
 * دالة مساعدة لإعادة المحاولة التلقائية للطلبات الفاشلة
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context?: string
): Promise<T> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const type = classifyError(error);
      
      // لا نعيد المحاولة في بعض أنواع الأخطاء
      if (type === 'unauthorized' || type === 'not_found' || type === 'conflict') {
        throw error;
      }
      
      // إذا كانت هذه المحاولة الأخيرة، نرفع الخطأ
      if (attempt === maxRetries) {
        break;
      }
      
      // انتظار قبل إعادة المحاولة مع زيادة تدريجية في المدة
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError;
}
