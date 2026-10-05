-- =============================================================================
-- إصلاح: جداول التوقعات مرفوضة من Supabase بسبب RLS
-- -----------------------------------------------------------------------------
-- التشخيص (اتأكد live على المشروع rxthpgmlcsfckstpqhqf):
--
--   POST /rest/v1/forecast_month_plans
--     -> HTTP 401
--     -> {"code":"42501",
--     نعمل policy واحدة لكل عملية.
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
--   يفتح الموقع ويقرا الـhashes بتاعت 72 مستخدم.
--
--   التشغيل الصح على المدى الطويل: اعمل login على Supabase Auth نفسه، وبعدها
--   فعّل RLS على customers/targets/users بسياسات مربوطة بـauth.uid()، وبدّل
--   policy جداول التوقعات لـauthenticated بس. السكربت ده مش بيعمل كده عشان
--   تغيير نموذج الدخول لقرار أكبر من إصلاح خطأ الحفظ.
-- =============================================================================    "message":"new row violates row-level security policy for
--                    table \"forecast_month_plans\""}
--
--   خطأ Postgres 42501 اسمه insufficient_privilege، وPostgREST بيرجّعه HTTP 401.
--   يعني الرسالة دي مش «مفتاح غلط» ومش «سجل دخول ناقص» — المفتاح شغال تمام
--   (tables تانية بترجّع 200). السبب إن RLS متفعّل على الجدول ومفيش ولا policy
--   بتسمح لـanon يكتب فيه، فالعملية بتتقفل قبل ما تلمس الجدول.
--
--   نفس الحاجة على القراءة: SELECT بيرجّع 200 بس بج[],
--   وcontent-range = */0 — يعني RLS بيخفي كل الصفوف.
--
-- ليه بيحصل على الجداول التانية لأ؟ customers / targets / users مش عليها RLS
-- خالص، فالanon بيقرا ويكتب فيها عادي (ده سلوك المشروع الحالي). جداول التوقعات
-- اتعملت بـRLS متفعّل (الافتراضي لما الجدول يتعمل من Dashboard) فبقت هي
-- الوحيدة المقفولة — وده اللي خلّى حفظ خطة الشهر يفشل.
--
-- التشغيل: idempotent، ينفع يتنفذ أكتر من مرة، وآمن على أي جدول موجود.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- policies ----
-- بنمكّن RLS صراحةً (مش بنعتمد على حالة الجدول)، وب