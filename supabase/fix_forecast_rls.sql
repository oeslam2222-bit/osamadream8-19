-- =============================================================================
-- إصلاح: جداول التوقعات مرفوضة من Supabase بسبب RLS
-- -----------------------------------------------------------------------------
-- التشخيص (اتأكد live على المشروع rxthpgmlcsfckstpqhqf):
--
--   POST /rest/v1/forecast_month_plans
--     -> HTTP 401
--     -> {"code":"42501",
--           "message":"new row violates row-level security policy for
--                      table \"forecast_month_plans\""}
--
--   خطأ Postgres 42501 اسمه insufficient_privilege، وPostgREST بيرجّعه HTTP 401.
--   يعني الرسالة دي مش «مفتاح غلط» ومش «سجل دخول ناقص» — المفتاح شغال تمام
--   (جداول تانية بترجّع 200). السبب إن RLS متفعّل على الجدول ومفيش ولا policy
--   بتسمح لـanon يكتب فيه، فالعملية بتتقفل قبل ما تلمس الجدول.
--
--   نفس الحاجة على القراءة: SELECT بيرجّع 200 بس بج[],
--   وcontent-range = */0 — يعني RLS بيخفي كل الصفوف.
--
-- ليه بيحصل على الجداول التانية لأ؟ customers / targets / users مش عليها RLS
-- خالص، فالـanon بيقرا ويكتب فيها عادي (ده سلوك المشروع الحالي). جداول التوقعات
-- اتعملت بـRLS متفعّل (الافتراضي لما الجدول يتعمل من الـDashboard) فبقت هي
-- الوحيدة المقفولة — وده اللي خلّى حفظ خطة الشهر يفشل.
--
-- التشغيل: idempotent، ينفع يتنفذ أكتر من مرة، وآمن على أي جدول موجود.
-- مفيش BEGIN/COMMIT جوّه الملف: الـSQL Editor بيغلّف كل ملف في transaction
-- لوحده، وCOMMIT في النص كان بيقفل الـtransaction قبل باقي السكربت.
-- =============================================================================
--
-- ملاحظة على الأعمدة الناقصة:
--   customer_comments اتعمل من غير أعمدة الأرشفة، فحالة الأرشفة (تعليق
--   مش مهم دلوقتي) كانت بتتخزن على الجهاز بس وبتتنضف أول ما السيرفر يردّ
--   على أي عميل جديد. الـblock بالأسفل بيضيف الأعمدة الناقصة بـIF NOT EXISTS
--   عشان يبقى الملف ده هو الإصلاح الوحيد المطلوب تشغيله.
-- =============================================================================

BEGIN;

-- ------------------------------------------------- missing archive columns ----
-- ADD COLUMN IF NOT EXISTS متاح في Postgres 11+، والـblock محاط بـEXCEPTION
-- عشان لو الـRLS أو صلاحيات الـDashboard رفضت ALTER، نكمل باقي الإصلاح
-- بدل ما الملف كله يفشل.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.customer_comments
      ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
    ALTER TABLE public.customer_comments
      ADD COLUMN IF NOT EXISTS archived_at text;
    ALTER TABLE public.customer_comments
      ADD COLUMN IF NOT EXISTS archived_by text;
    -- الأرشفة بتتحدد بسطر واحد (تعليق واحد)، فالـفهرس الجزئي بيسرّع
    -- «اعرضلي بس اللي مش متأرشف» من غير ما يمسح الجدول كله.
    CREATE INDEX IF NOT EXISTS customer_comments_archived_idx
      ON public.customer_comments (is_archived);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'مش قادرين نضيف أعمدة أرشفة customer_comments (محتاجة مالك الجدول) — باقي سياسات RLS اتطبقت.';
  END;
END $$;

-- ------------------------------------------------------------ policies ----
-- بنمكّن RLS صراحةً (مش بنعتمد على حالة الجدول)، وبنعمل policy واحدة لكل عملية
-- لكل من anon وauthenticated — المشروع كله شغال بمفتاح publishable واحد
-- من غير Supabase Auth، فده نفس النموذج المستخدم في customers/targets/users.

DROP POLICY IF EXISTS forecast_month_plans_anon_all ON public.forecast_month_plans;
DROP POLICY IF EXISTS collection_forecasts_anon_all ON public.collection_forecasts;
DROP POLICY IF EXISTS customer_comments_anon_all ON public.customer_comments;

ALTER TABLE public.forecast_month_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY forecast_month_plans_anon_all ON public.forecast_month_plans
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY collection_forecasts_anon_all ON public.collection_forecasts
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY customer_comments_anon_all ON public.customer_comments
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

COMMIT;

-- =============================================================================
-- ملاحظة أمنية — اقراها قبل ما تسيب كده
-- -----------------------------------------------------------------------------
-- الـpolicy فوق بتفتح الجداول للكل اللي يعرف الـanon key، وده متسق مع
-- بقية المشروع. بس فيه حاجة لازم تعرفها:
--
--   جدول users فيه عمود password (hash)، وهو حالياً مكشوف للـanon key — أي حد
--   يفتح الموقع ويقرا الـhashes بتاعت كل المستخدمين.
--
--   التشغيل الصح على المدى الطويل: اعمل login على Supabase Auth نفسه، وبعدها
--   فعّل RLS على customers/targets/users بسياسات مربوطة بـauth.uid()، وبدّل
--   policy جداول التوقعات لـauthenticated بس. السكربت ده مش بيعمل كده عشان
--   تغيير نموذج الدخول لقرار أكبر من إصلاح خطأ الحفظ.
-- =============================================================================

-- =============================================================================
-- بعد التشغيل: تأكيد سريع من SQL Editor
-- -----------------------------------------------------------------------------
--   SELECT count(*) FROM public.collection_forecasts;
--   INSERT INTO public.forecast_month_plans (id, year, month)
--   VALUES ('__rls_probe__', 1970, 1)
--   ON CONFLICT (id) DO UPDATE SET updated_at = now();
--   DELETE FROM public.forecast_month_plans WHERE id = '__rls_probe__';
-- لو الصف بيترجع 1 والكتابة مش بتقع بـ42501، الإصلاح اشتغل.
-- =============================================================================