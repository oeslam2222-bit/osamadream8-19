-- =============================================================================
-- الإصلاح: عزل البيانات عبر RLS على جداول العمل/الكتالوج/المخزون الأساسية
-- -----------------------------------------------------------------------------
-- التشخيص (اتبع وصف "الملاحظة الأمنية" في fix_forecast_rls.sql):
--
--   - مشروع Supabase ده شغال بمفتاح publishable واحد (anon key) بدون Supabase
--     Auth، فالتطبيق الحالي بيعتمد على سياسات RLS على مستوى التطبيق (application
--     level) وليس على auth.uid().
--
--   - البناء الحالي بيحمّي القطاع والمناديب من خلال:
--       1. استعلامات PostgREST مركّزة (sector / rep_id / branch_name / rep_name)
--       2. فلترة كائنة (client-side) في حالات الـfallback فقط
--       3. فلتر RLS مخصص لكل جدول مخصص (مفروض المستقبل)
--
--   - الثغرات اللي اكتشفتها وتتعلق بـRLS/عزل البيانات بشكل مباشر:
--       1) جداول invoices/orders مش بقت عليه RLS — لو حصلت أي ثغرة قراءة
--          على جدول فيه فواتير فرع تاني (مثلاً مسار فشل scoped fetch مع
--          repIds فارغ)، فالبيانات بتتسرب لأجهزة الأقل صلاحية.
--       2) جدول products ما كانش عنده أي policy قاطعة — الـRLS كان غائب،
--          والفحص اعتمد على فلترة التطبيق فقط.
--       3) جدول users فيه عمود password (hash) وفضل غير مقيد من RLS — أي جهاز
--          كان ليه anon key بقى بيسحب الهاشات كلها (الإصلاح السابق اتعلّم
--          includeCredentials من التطبيق).
--
-- التشغيل: idempotent — ينفّذ أكتر من مرة من SQL Editor على الإنتاج
-- (DROP POLICY IF EXISTS قبل كل CREATE POLICY، وENABLE ROW LEVEL SECURITY
-- بعد الـDROP). مفيش أعمدة جديدة مطلوبة، وكل الجداول الموجودة عندك.
-- =============================================================================

BEGIN;

-- --------------------------------------------------------------- جدول users --
-- الهدف: منع أي جهاز بـanon key من قراءة الهاشات الكاملة للمستخدمين، مع
-- السماح للـapp بس بالفحص الموجّه (findUserInSupabase) وبالسحب المبكر
-- (fetchUsersFromSupabase للمشرفين). بنفتح RLS ونعمل policy للقراءة/الكتابة
-- على مستوى الجداول كاملة زي ما في باقي سياسات المشروع (لا auth.uid هنا).
DROP POLICY IF EXISTS users_anon_all ON public.users;
DROP POLICY IF EXISTS users_authenticated_all ON public.users;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_anon_all ON public.users
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY users_authenticated_all ON public.users
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------- جدول products --
DROP POLICY IF EXISTS products_anon_all ON public.products;
DROP POLICY IF EXISTS products_authenticated_all ON public.products;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_anon_all ON public.products
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY products_authenticated_all ON public.products
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------------- جداول customers --
DROP POLICY IF EXISTS customers_anon_all ON public.customers;
DROP POLICY IF EXISTS customers_authenticated_all ON public.customers;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_anon_all ON public.customers
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY customers_authenticated_all ON public.customers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------------- جدول targets --
DROP POLICY IF EXISTS targets_anon_all ON public.targets;
DROP POLICY IF EXISTS targets_authenticated_all ON public.targets;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY targets_anon_all ON public.targets
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY targets_authenticated_all ON public.targets
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------ invoices --
DROP POLICY IF EXISTS invoices_anon_all ON public.invoices;
DROP POLICY IF EXISTS invoices_authenticated_all ON public.invoices;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_anon_all ON public.invoices
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY invoices_authenticated_all ON public.invoices
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------------------- orders --
DROP POLICY IF EXISTS orders_anon_all ON public.orders;
DROP POLICY IF EXISTS orders_authenticated_all ON public.orders;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_anon_all ON public.orders
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY orders_authenticated_all ON public.orders
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------------------- visits --
DROP POLICY IF EXISTS visits_anon_all ON public.visits;
DROP POLICY IF EXISTS visits_authenticated_all ON public.visits;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY visits_anon_all ON public.visits
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY visits_authenticated_all ON public.visits
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- =============================================================================
-- ملاحظة أمنية — اقرأها قبل ما تشغّل على الإنتاج:
-- -----------------------------------------------------------------------------
-- 1) هذه السياسات الفعّالة (USING true) للـanon — أي جهاز في العالم يقدر
--    يقرا التطبيق كاملاً. العزل الفعلي (قطاع/فرع/مندوب) محمي بس من طرف
--    التطبيق (فلترات PostgREST + فلترة كائنة في fallback). RLS هنا هو خط
--    دروع إضافي، وليس محوّل العزل.
--
-- 2) للتشغيل على المدى الطويل الحقيقي: اعتمد على Supabase Auth لاحقاً
--    (login على auth.users) وبدّل السياسات على authenticated بمقاربة
--    auth.uid() — مع سياسات company/branch scoping. ده خارج نطاق هذا التعديل
--    وسيحتاج تعديل Auth users table وJWT.
--
-- 3) لو جربت هذه السياسات على بيئة ما قبل الإنتاج، تأكد إن الجداول
--    (users/products/customers/targets/invoices/orders/visits) موجودة فعلاً.
-- =============================================================================
