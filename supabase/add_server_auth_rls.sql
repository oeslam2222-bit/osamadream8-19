-- =============================================================================
-- المصادقة الحقيقية + سياسات RLS على مستوى الصف
-- =============================================================================
-- بيعمل إيه: بيخلي «مين يشوف إيه» قرار الداتابيز نفسه، مش الكود في المتصفح.
--
-- ---------------------------------------------------------------------------
-- الحالة الحالية (ليه الملف ده لازم يتنفّذ على مراحل)
-- ---------------------------------------------------------------------------
-- 1. الدخول بيتحقق في المتصفح (passwordService.verifyPassword)، فأي حد يفتح
--    DevTools يعدّل حالة React ويدخل كمدير.
-- 2. جدول users مفيهوش RLS فعّال — مفتاح anon موجود في الـ JS bundle، يعني
--    أي حد يقدر يقرأ جدول users كله (والأرقام لو متقفلش).
-- 3. fix_forecast_rls.sql فتح collection_forecasts / forecast_month_plans /
--    customer_comments بـ USING (true) — يعني أي حد يقدر يكتب ويحذف.
-- 4. مفيش RLS خالص على customers ولا visits.
--
-- ---------------------------------------------------------------------------
-- مشكلة موجودة أصلاً لازم تتحل معاه
-- ---------------------------------------------------------------------------
-- production-hardening.sql عمل RLS على invoices وربطه بـ:
--        rep_id = auth.uid()::text
--        WHERE u.id = auth.uid()::text
-- بس auth.uid() هو UUID من Supabase Auth، و users.id عبارة عن نص
-- ('u-1759...' من register في AppContext.tsx:2980). يعني الشرط **مش هيتطابق
-- أبداً** — والنتائج إن الفواتير مقفولة على الجميع، حتى على الإدارة.
--
-- عشان كده هنضيف auth_user_id: العمود اللي بيربط صف الـ user بـ uid الحقيقي
-- بتاعه. كل السياسات الجديدة بتستخدمه بدل id.
--
-- ---------------------------------------------------------------------------
-- ⚠️ قبل ما تنفّذ
-- ---------------------------------------------------------------------------
-- خد backup كامل من Supabase (Database → Backups) وقاعدة البيانات.
-- خد نسخة من جدول users قبل تعديل الـ RLS:
--     CREATE TABLE public.users_rls_backup AS SELECT * FROM public.users;
--
-- الملف مقسوم لمرحلتين. **نفّذ المرحلة الأولى بس دلوقتي** — إضافة أعمدة
-- وفهارس فقط، من غير أي تغيير في الوصول. المرحلة الثانية مقفولة بالكامل
-- (كل أسطرها مشغّلة بـ --) لحد ما تتأكد إن كل حساب اتفعّل على السيرفر.
-- =============================================================================

BEGIN;

-- =============================================================================
-- المرحلة الأولى — إضافة فقط (آمنة 100%، مفيش تغيير في الوصول)
-- =============================================================================

-- 1. ربط كل حساب بـ uid بتاعه في Supabase Auth.
--    الأعمدة nullable بالكامل، فالجدول بيفضل شغال زي ما هو.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_email text;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Supabase Auth uid (auth.uid()). NULL = الحساب لسه على الوضع القديم.';
COMMENT ON COLUMN public.users.auth_email IS
  'الإيميل اللي اتربط بـ Supabase Auth، للربط اليدوي من لوحة الإدارة.';

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_unique_idx
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_auth_email_idx
  ON public.users (lower(auth_email))
  WHERE auth_email IS NOT NULL;

-- 2. دالة تربط الـ session الحالي بصف الـ user.
--    بتقرأ auth.uid() الأول، وترجع لصف الـ auth_email لو الـ uid لسه متربطش.
--    chosenrow تعني إن مفيش session أصلاً (الوضع القديم لسه شغال).
CREATE OR REPLACE FUNCTION public.app_user_row()
RETURNS public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.*
  FROM public.users u
  WHERE u.auth_user_id = auth.uid()
     OR (u.auth_user_id IS NULL AND lower(u.auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  LIMIT 1;
$$;

-- 3. دوال صلاحيات مقروءة من الداتابيز بدل ما كل شاشة تعملها في المتصفح.
CREATE OR REPLACE FUNCTION public.app_user_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce((public.app_user_row()).role, 'anonymous');
$$;

CREATE OR REPLACE FUNCTION public.app_is_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (public.app_user_row()).role IN ('admin', 'developer')
    AND (public.app_user_row()).is_active = true,
    false
  );
$$;

-- 4. فهرس يساعد البحث في customers بالفرع والمندوب — ده اللي هيخلي
--    الفلترة بتاعت الزيارات والبحث في الصفحات تشتغل جوه الداتابيز بدل
--    تحميل 3,400 صف وتنقيتها في المتصفح.
CREATE INDEX IF NOT EXISTS customers_branch_name_idx ON public.customers (lower(branch_name));
CREATE INDEX IF NOT EXISTS customers_rep_name_idx    ON public.customers (lower(rep_name));
CREATE INDEX IF NOT EXISTS customers_updated_at_idx  ON public.customers (updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS visits_date_idx    ON public.visits (date DESC);
CREATE INDEX IF NOT EXISTS visits_customer_idx ON public.visits (customer_id);
CREATE INDEX IF NOT EXISTS visits_rep_idx     ON public.visits (rep_id);

-- ⛔ مفيش أي تغيير على السياسات في المرحلة الأولى — وده مقصود.
--
-- كنت هقيّد الكتابة في جداول التوقعات على app_is_privileged()، وده كان
-- هيكسر الصفحة فوراً: الدالة دي بترجع false دايماً في الوضع القديم لأن
-- مفيش session من Supabase Auth، يعني حفظ التوقعات بيقف عن كل موظف.
--
-- قفل الكتابة لازم يتعمل مع المرحلة الثانية، بعد ما كل حساب يكون مربوط.
-- المرحلة الأولى بتعمل بس الأعمدة والدوال والفهارس.

COMMIT;

-- =============================================================================
-- التحقق من المرحلة الأولى (استعلامات قراءة فقط، تنفع في أي وقت)
-- =============================================================================
-- الدوال اتعملت؟
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('app_user_row','app_user_role','app_is_privileged');
--   المتوقع: 3 صفوف
--
-- الفهارس اتعملت؟
--   SELECT indexname FROM pg_indexes
--    WHERE tablename IN ('users','customers','visits') ORDER BY indexname;
--
-- سياسات التوقعات:
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--    WHERE tablename IN ('collection_forecasts','forecast_month_plans');
--   المتوقع لكل جدول: read_all (SELECT) + write_privileged (ALL)
--
-- الأعمدة الجديدة:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'users' AND column_name LIKE 'auth_%';
--
-- =============================================================================
-- الخطوة الجاية (مش نفّذها لسه)
-- =============================================================================
-- 1) اعمل حساب في Supabase Auth لكل موظف:
--      Authentication → Users → Add user
--      الإيميل = نفس ايميل جدول users بالظبط.
--    (كلمة المرور لازم تبقى جديدة من فضلك — الـ 72 حساب الحالية متخزنة
--     ببصمة sha256 مش bcrypt، ومش هتنتقل). حد يسأل كل موظف يغيّرها أول
--     دخول من غير مشكلة.
--
-- 2) اربط كل uid بالصف بتاعه:
--      UPDATE public.users
--         SET auth_user_id = '<UID>', auth_email = lower(email)
--       WHERE lower(email) = '<الإيميل>';
--
-- 3) اختبر على جهاز واحد في وضع hybrid — التأكد إن الدخول شغال.
--
-- 4) بعد ما كل الحسابات تتربط، نفّذ المرحلة الثانية.
-- =============================================================================


-- #############################################################################
-- المرحلة الثانية — فرض RLS على الجداول (مقفولة عمداً)
-- #############################################################################
-- ⛔ ما تفتحش ده قبل ما كل حساب في users يكون ليه auth_user_id.
--    لو عملت كده قبل ما تربط، المندوبين هيشوفوا جدول عملاء فاضي ومفيش
--    رسالة خطأ واضحة — وده أسوأ من Broken open بصراحة.
--
-- بعد ما تربط وتختبر، شيل الـ -- من كل سطر، واعمل copy من الملف ده وحده
-- في SQL Editor (مش الملف كله).
--
-- ملاحظة مهمة عن «الدخول كمندوب» (loginAs في AppContext):
-- لما الإدارة تدخل بحساب مندوب، الـ session على Supabase Auth بيفضل session
-- بتاع الإدارة. يعني الداتابيز هتشوف الإدارة والواجهة هتشوف المندوب.
-- الاتجاه ده آمن (الداتابيز بتدي الإدارة أكتر مش أقل)، بس لازم يتعارف عليه:
-- متستخدموش كوسيلة لتحديد النطاق في الداتابيز — النطاق الحقيقي محتاج session.
--
-- ---- 2.1 تصحيح سياسات الفواتير (دي اللي مش شغالة أصلاً) -----------------
-- DROP POLICY IF EXISTS invoices_select_owner_or_admin ON public.invoices;
-- DROP POLICY IF EXISTS invoices_insert_owner_or_admin ON public.invoices;
-- DROP POLICY IF EXISTS invoices_update_owner_or_admin ON public.invoices;
--
-- CREATE POLICY invoices_select_scoped ON public.invoices
--   FOR SELECT TO authenticated
--   USING (
--     public.app_is_privileged()
--     OR rep_id = (SELECT (public.app_user_row()).id)
--   );
--
-- CREATE POLICY invoices_insert_scoped ON public.invoices
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     public.app_is_privileged()
--     OR rep_id = (SELECT (public.app_user_row()).id)
--   );
--
-- CREATE POLICY invoices_update_scoped ON public.invoices
--   FOR UPDATE TO authenticated
--   USING (
--     public.app_is_privileged()
--     OR rep_id = (SELECT (public.app_user_row()).id)
--   )
--   WITH CHECK (
--     public.app_is_privileged()
--     OR rep_id = (SELECT (public.app_user_row()).id)
--   );
--
-- ---- 2.2 العملاء: المشرف يشوف فروعه، المندوب يشوف عملاءه ----------------
-- ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY customers_read_scoped ON public.customers
--   FOR SELECT TO authenticated
--   USING (
--     public.app_is_privileged()
--     OR public.app_user_role() IN ('branch_manager', 'supervisor')
--     OR lower(rep_name) = lower((SELECT (public.app_user_row()).name))
--   );
--
-- ---- 2.3 الزيارات: كل مندوب يشوف زياراته بس ------------------------------
-- ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY visits_read_scoped ON public.visits
--   FOR SELECT TO authenticated
--   USING (
--     public.app_is_privileged()
--     OR public.app_user_role() IN ('branch_manager', 'supervisor')
--     OR rep_name = (SELECT (public.app_user_row()).name)
--   );
--
-- CREATE POLICY visits_write_scoped ON public.visits
--   FOR ALL TO authenticated
--   USING (
--     public.app_is_privileged()
--     OR rep_name = (SELECT (public.app_user_row()).name)
--   )
--   WITH CHECK (
--     public.app_is_privileged()
--     OR rep_name = (SELECT (public.app_user_row()).name)
--   );
--
-- ---- 2.4 منع قراءة كلمات المرور ------------------------------------------
-- REVOKE ALL ON public.users FROM anon;
-- GRANT SELECT (id, name, username, email, role, branch_name, supervisor_id,
--               phone, commission_rate, is_active, approval_status,
--               created_at, auth_user_id, auth_email)
--       ON public.users TO anon;
--
-- ---- 2.5 قفل الكتابة في جداول التوقعات -----------------------------------
-- دي كانت ناقصة عن قصد في المرحلة الأولى: app_is_privileged() بترجع false
-- دايماً من غير session، فقفلنا بيها كان هيكسر حفظ التوقعات لكل موظف.
-- دلوقتي بعد ما الحسابات مربوطة: المندوب يعدّل على صفوفه بس (المطلوب
-- بالظبط — يحط توقعه ويعدّله)، والحذف للإدارة بس.
-- DROP POLICY IF EXISTS collection_forecasts_anon_all ON public.collection_forecasts;
-- DROP POLICY IF EXISTS collection_forecasts_read_anon ON public.collection_forecasts;
--
-- CREATE POLICY collection_forecasts_read_all ON public.collection_forecasts
--   FOR SELECT TO anon, authenticated
--   USING (true);
--
-- CREATE POLICY collection_forecasts_write_scoped ON public.collection_forecasts
--   FOR INSERT TO authenticated
--   WITH CHECK (rep_id = (SELECT (public.app_user_row()).id));
--
-- CREATE POLICY collection_forecasts_update_scoped ON public.collection_forecasts
--   FOR UPDATE TO authenticated
--   USING (rep_id = (SELECT (public.app_user_row()).id))
--   WITH CHECK (rep_id = (SELECT (public.app_user_row()).id));
--
-- CREATE POLICY collection_forecasts_delete_admin ON public.collection_forecasts
--   FOR DELETE TO authenticated
--   USING (public.app_is_privileged());
--
-- DROP POLICY IF EXISTS forecast_month_plans_anon_all ON public.forecast_month_plans;
-- DROP POLICY IF EXISTS forecast_month_plans_read_anon ON public.forecast_month_plans;
--
-- CREATE POLICY forecast_month_plans_read_all ON public.forecast_month_plans
--   FOR SELECT TO anon, authenticated
--   USING (true);
--
-- CREATE POLICY forecast_month_plans_write_admin ON public.forecast_month_plans
--   FOR ALL TO authenticated
--   USING (public.app_is_privileged())
--   WITH CHECK (public.app_is_privileged());
--
-- ---- 2.6 منع قراءة كلمات المرور ------------------------------------------
-- REVOKE ALL ON public.users FROM anon;
-- GRANT SELECT (id, name, username, email, role, branch_name, supervisor_id,
--               phone, commission_rate, is_active, approval_status,
--               created_at, auth_user_id, auth_email)
--       ON public.users TO anon;
--
-- ---- 2.7 المستخدمون: الإدارة بس هي اللي تكتب ------------------------------
-- CREATE POLICY users_write_admin ON public.users
--   FOR ALL TO authenticated
--   USING (public.app_is_privileged())
--   WITH CHECK (public.app_is_privileged());
-- =============================================================================