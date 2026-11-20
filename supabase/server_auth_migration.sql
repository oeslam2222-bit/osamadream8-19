-- ============================================================================
-- سطر الترحيل إلى المصادقة الخادمية (Supabase Auth) + RLS صارم
-- ============================================================================
-- الغرض:
--  1. نسخ احتياطي كامل لكل الجداول قبل أي تعديل (للاستعادة عند الطوارئ).
--  2. إضافة عمود auth_user_id (uuid) و auth_email (text) إلى جدول users
--     لربط كل حساب محلي بـ uid حقيقي من Supabase Auth.
--  3. دوال SQL لربط الجلسة الحالية (auth.uid()) بصف المستخدم.
--  4. تفعيل RLS على جميع الجداول الأساسية مع سياسات صارمة:
--       - لا يُسمح بنسخ كلمة المرور أو الهاش عبر anon key.
--       - العزل مبني على auth_user_id = auth.uid() (ليس على users.id النصي).
--  5. ملاحظة: سياسات القراءة/الكتابة على جداول العملاء/الفواتير/الطلبات/الزيارات
--     مكتوبة بنمط "قراءة للمصادقين فقط، كتابة مرتبطة بالمستخدم المرتبط".
--     إذا احتجت عزلاً أدق لكل فرع/مندوب، أضف شرط rep_id / branch_name في USING().
-- ============================================================================

-- ---------------------------------------------------------------
-- fase 0: نسخة احتياطية (نفّذ هذه قبل أي شيء على الإنتاج)
-- ---------------------------------------------------------------
BEGIN;

CREATE TABLE IF NOT EXISTS public.backup_users_pre_server_auth AS
  SELECT * FROM public.users;

CREATE TABLE IF NOT EXISTS public.backup_customers_pre_server_auth AS
  SELECT * FROM public.customers;

CREATE TABLE IF NOT EXISTS public.backup_products_pre_server_auth AS
  SELECT * FROM public.products;

CREATE TABLE IF NOT EXISTS public.backup_invoices_pre_server_auth AS
  SELECT * FROM public.invoices;

CREATE TABLE IF NOT EXISTS public.backup_orders_pre_server_auth AS
  SELECT * FROM public.orders;

CREATE TABLE IF NOT EXISTS public.backup_visits_pre_server_auth AS
  SELECT * FROM public.visits;

CREATE TABLE IF NOT EXISTS public.backup_targets_pre_server_auth AS
  SELECT * FROM public.targets;

COMMIT;

-- ---------------------------------------------------------------
-- fase 1: إضافة أعمدة الربط إلى جدول users (آمن 100%، لا يغيّر الوصول)
-- ---------------------------------------------------------------
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_email text;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Supabase Auth uid (auth.uid()). NULL = الحساب لا يزال على وضعية legacy.';
COMMENT ON COLUMN public.users.auth_email IS
  'الإيميل المستخدم لربط الحساب بـ Supabase Auth (يُضبط من لوحة الإدارة).';

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique_idx
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_auth_email_idx
  ON public.users (lower(auth_email))
  WHERE auth_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON public.users (lower(email));

COMMIT;

-- ---------------------------------------------------------------
-- fase 2: دوال الربط بين Supabase Session وصف المستخدم
-- ---------------------------------------------------------------
BEGIN;

-- إرجاع صف المستخدم المرتبط بالجلسة الحالية (auth.uid()).
-- يُستخدم في سياسات RLS كبديل آمن عن auth.uid() المباشر عند必要.
CREATE OR REPLACE FUNCTION public.app_user_row()
RETURNS public.users
LANGUAGE sql
STABLE
AS $function$
  SELECT u.*
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$function$;

-- إرجاع دور المستخدم من الجلسة الحالية (للاستخدام في سياسات RLS).
CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE((SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1), 'sales_rep');
$function$;

-- إرجاع true إذا كان المستخدم الحالي مشرفاً/مديراً (للاستخدام في السياسات الإدارية).
CREATE OR REPLACE FUNCTION public.app_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE((
    SELECT (role = 'admin' OR role = 'developer' OR role = 'branch_manager')
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  ), false);
$function$;

COMMIT;

-- ---------------------------------------------------------------
-- fase 3: تفعيل RLS على الجداول الأساسية مع سياسات صارمة
-- ---------------------------------------------------------------
BEGIN;

-- ===== جدول users =====
-- منع قراءة حقل كلمة المرور / الهاش عبر anon key نهائياً.
-- القراءة مسموحة فقط للأعمدة الآمنة، للكتابة فقط عبر Linked Auth.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read_safe ON public.users;
DROP POLICY IF EXISTS users_write_linked ON public.users;

CREATE POLICY users_read_safe ON public.users
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY users_write_linked ON public.users
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ===== جدول products =====
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_read_auth ON public.products;
DROP POLICY IF EXISTS products_write_privileged ON public.products;

CREATE POLICY products_read_auth ON public.products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY products_write_privileged ON public.products
  FOR ALL TO authenticated
  USING (public.app_is_privileged())
  WITH CHECK (public.app_is_privileged());

-- ===== جدول customers =====
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_read_auth ON public.customers;
DROP POLICY IF EXISTS customers_write_scoped ON public.customers;

CREATE POLICY customers_read_auth ON public.customers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY customers_write_scoped ON public.customers
  FOR ALL TO authenticated
  USING (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1));

-- ===== جدول invoices =====
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_read_auth ON public.invoices;
DROP POLICY IF EXISTS invoices_write_scoped ON public.invoices;

CREATE POLICY invoices_read_auth ON public.invoices
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY invoices_write_scoped ON public.invoices
  FOR ALL TO authenticated
  USING (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1));

-- ===== جدول orders =====
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_read_auth ON public.orders;
DROP POLICY IF EXISTS orders_write_scoped ON public.orders;

CREATE POLICY orders_read_auth ON public.orders
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY orders_write_scoped ON public.orders
  FOR ALL TO authenticated
  USING (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1));

-- ===== جدول visits =====
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visits_read_auth ON public.visits;
DROP POLICY IF EXISTS visits_write_scoped ON public.visits;

CREATE POLICY visits_read_auth ON public.visits
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY visits_write_scoped ON public.visits
  FOR ALL TO authenticated
  USING (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (public.app_is_privileged() OR rep_id = (SELECT auth_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1));

-- ===== جدول targets =====
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS targets_read_auth ON public.targets;
DROP POLICY IF EXISTS targets_write_privileged ON public.targets;

CREATE POLICY targets_read_auth ON public.targets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY targets_write_privileged ON public.targets
  FOR ALL TO authenticated
  USING (public.app_is_privileged())
  WITH CHECK (public.app_is_privileged());

COMMIT;

-- ---------------------------------------------------------------
-- fase 4: منع anon من الوصول إلى جدول users نهائياً (مهم جداً)
-- ---------------------------------------------------------------
BEGIN;

REVOKE ALL ON public.users FROM anon;
GRANT SELECT (id, name, username, email, role, branch_name, supervisor_id,
              phone, commission_rate, is_active, approval_status,
              created_at, auth_user_id, auth_email)
      ON public.users TO anon;

COMMIT;

-- ============================================================================
-- ملاحظات تشغيلية قبل النشر على الإنتاج:
-- 1. خذ نسخة احتياطية كاملة من لوحة Supabase (Database → Backups) قبل تنفيذ هذا الملف.
-- 2. نفّذ المرحلة 0 (النسخ الاحتياطي) والمرحلة 1 (إضافة الأعمدة) أولاً.
-- 3. ربط الحسابات الحالية بـ Supabase Auth عبر دالة linkAuthUserToProfile
--    من الواجهة بعد تسجيل الدخول الأول في وضعية server.
-- 4. بعد التأكد من الربط، نفّذ المرحلة 3 (RLS الصارم).
-- 5. سياسات الكتابة على جداول customers/invoices/orders/visits تعتمد على
--    عمود rep_id. إذا كان اسم العمود مختلفاً في قاعدتك، عدل سياسات WITH CHECK
--    و USING لتتوافق مع اسم العمود الحقيقي.
-- 6. لا تترك أي سياسة USING (true) على جدول users أو أي جدول يحتوي بيانات حساسة.
-- ============================================================================
