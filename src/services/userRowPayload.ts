/**
 * مخطط أعمدة جداول المستخدمين في Supabase + تنظيف الـ payload قبل الكتابة.
 *
 * الغرض: منع نوعين من الأخطاء كانوا بيظهروا في الكونسول على كل تسجيل دخول:
 *  - 400 PGRST204: عمود غير موجود (app_users مفيهوش supervisor_id ولا commission_rate).
 *  - 409: قيد فريد على profiles.username أو صفوف مكررة وقت الـ upsert.
 *
 * الملف ده مفيهوش أي اتصال بـ Supabase، عشان يفضل قابل للاختبار كدالة Pure.
 */

/** الأعمدة الفعلية لكل جدول — تم التحقق منها مباشرة من PostgREST. */
export const USER_TABLE_COLUMNS: Record<
  'users' | 'app_users' | 'profiles',
  readonly string[]
> = {
  users: [
    'id', 'name', 'username', 'email', 'password', 'role', 'branch_name',
    'supervisor_id', 'phone', 'commission_rate', 'is_active', 'approval_status', 'created_at'
  ],
  app_users: [
    'id', 'name', 'username', 'email', 'password', 'role', 'branch_name',
    'phone', 'is_active', 'approval_status', 'created_at'
  ],
  profiles: [
    'id', 'full_name', 'username', 'email', 'role', 'branch_name',
    'phone', 'is_active', 'approval_status', 'created_at'
  ]
};

export type UserTableName = keyof typeof USER_TABLE_COLUMNS;

/** يشيل أي عمود مش موجود في الجدول المستهدف (سبب 400). */
export function pickUserColumns(
  table: UserTableName,
  payload: Record<string, any>
): Record<string, any> {
  const cleaned: Record<string, any> = {};
  USER_TABLE_COLUMNS[table].forEach((column) => {
    // null مسموح ومقصود: بيستخدم لتصفير مشرف لم يعد موجودًا.
    if (payload[column] !== undefined) {
      cleaned[column] = payload[column];
    }
  });
  return cleaned;
}

/**
 * المشرف لو مش موجود في جدول `users` بيبقى مرجع ميت.
 * بنحوّله لـ null بدل ما نضيّع بيانات المستخدم الأساسية.
 */
export function sanitizeSupervisorId(
  payload: Record<string, any>,
  knownIds: Set<string>
): Record<string, any> {
  if (!payload.supervisor_id) return payload;
  if (knownIds.size === 0) return payload;
  if (!knownIds.has(String(payload.supervisor_id))) {
    payload.supervisor_id = null;
  }
  return payload;
}
