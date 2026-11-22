-- ============================================================================
-- تفعيل تغيير / إعادة تعيين كلمة المرور مباشرة من داخل التطبيق (بدون إيميل)
-- ============================================================================
-- الغرض:
--   يسمح لحسابات الإدارة (admin / developer) النشطة بتعيين أو تغيير كلمة مرور
--   أي موظف مباشرة من شاشة "الفريق والصلاحيات" داخل التطبيق دون إرسال رسائل
--   بريد إلكتروني (مفيد جداً للحسابات ذات الإيميل الداخلي مثل @dream.com).
--
-- الأمان:
--   1. لا يقبل الدالة إلا جلسة مسجّلة دخول حقيقية (auth.uid() IS NOT NULL).
--   2. يتحقق على السيرفر أن صاحب الجلسة دوره admin أو developer ونشط ومفعّل.
--   3. يحدّث كلمة المرور مشفرة بـ bcrypt في auth.users فقط، ولا يخزن نصاً صريحاً.
--   4. صلاحية التنفيذ ممنوحة لـ authenticated فقط وممنوعة عن anon / PUBLIC.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_user_id text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth, pg_temp
AS $$
DECLARE
  v_caller_uid uuid;
  v_caller_role text;
  v_caller_active boolean;
  v_caller_status text;
  v_clean_password text;
  v_target_row public.users%ROWTYPE;
  v_target_auth_id uuid;
  v_target_email text;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول أولاً لتنفيذ هذا الإجراء.';
  END IF;

  SELECT u.role, COALESCE(u.is_active, true), COALESCE(u.approval_status, 'active')
    INTO v_caller_role, v_caller_active, v_caller_status
    FROM public.users u
   WHERE u.auth_user_id = v_caller_uid
   LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'developer') OR NOT v_caller_active OR v_caller_status <> 'active' THEN
    RAISE EXCEPTION 'غير مصرح: هذه الصلاحية مقتصرة على الإدارة والمطور فقط.';
  END IF;

  v_clean_password := trim(COALESCE(p_new_password, ''));
  IF length(v_clean_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن لا تقل عن 6 أحرف.';
  END IF;

  SELECT *
    INTO v_target_row
    FROM public.users u
   WHERE u.id = p_target_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الموظف غير موجود في قاعدة البيانات.';
  END IF;

  v_target_auth_id := v_target_row.auth_user_id;
  v_target_email := lower(trim(COALESCE(NULLIF(v_target_row.auth_email, ''), v_target_row.email, '')));

  IF v_target_auth_id IS NULL AND v_target_email <> '' THEN
    SELECT au.id
      INTO v_target_auth_id
      FROM auth.users au
     WHERE lower(trim(au.email)) = v_target_email
     LIMIT 1;

    IF v_target_auth_id IS NOT NULL THEN
      UPDATE public.users
         SET auth_user_id = v_target_auth_id,
             auth_email = v_target_email
       WHERE id = v_target_row.id;
    END IF;
  END IF;

  IF v_target_auth_id IS NULL THEN
    RAISE EXCEPTION 'هذا الحساب غير مربوط بحساب دخول (Auth) بعد.';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(v_clean_password, gen_salt('bf')),
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = v_target_auth_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعذر العثور على حساب المصادقة المرتبط بهذا الموظف.';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_target_row.id,
    'email', v_target_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_user_password(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reset_user_password(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;
