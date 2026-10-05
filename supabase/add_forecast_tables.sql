-- =============================================================================
-- تنبؤ التحصيلات: جداول التوقع الأسبوعي + التوقع الشهري المستقل
-- -----------------------------------------------------------------------------
-- السكربت ده idempotent بالكامل، ينفع يتنفذ على قاعدة موجودة أو على قاعدة فاضية.
--
-- ملاحظة مهمة على week_index:
--   1..8  = سطر توقع لفترة حقيقية من تقسيم الشهر اللي الإدارة حددته (مش لازم 4)
--   0     = سطر التوقع الشهري المستقل (رقم بيكتبه المندوب لوحده، مش محسوب من الأسابيع)
--
-- رقم 0 مستحيل يبقى فترة حقيقية، فالتوقع الشهري بيتخزن في نفس الجدول بدل جدول
-- جديد: نفس الـ upsert، نفس الـ offline queue، نفس دورة الاعتماد، ومن غير migration.
-- الحد الأعلى 8 جوه الحد المسموح بيه في الكود (MAX_WEEKS_PER_MONTH) — لو زاد
-- عدد الفترات في الكود لازم يتوسّع القيد ده في نفس الوقت.
-- =============================================================================

CREATE TABLE IF NOT EXISTS collection_forecasts (
  id text PRIMARY KEY,
  month_key text NOT NULL,
  week_index int NOT NULL,
  rep_id text, rep_name text, branch_name text,
  customer_id text, customer_code text, customer_name text,
  collection_forecast numeric DEFAULT 0,
  sales_forecast numeric DEFAULT 0,
  status text DEFAULT 'draft',
  submitted_at text, approved_by text, approved_at text,
  change_request_note text, change_requested_by text, change_requested_at text,
  updated_by text, updated_at text
);

CREATE TABLE IF NOT EXISTS forecast_month_plans (
  id text PRIMARY KEY,             -- 'YYYY-MM'
  year int, month int,
  month_start text, month_end text,
  weeks jsonb,
  is_closed boolean DEFAULT false,
  created_by text, created_at text,
  updated_by text, updated_at text
);

CREATE TABLE IF NOT EXISTS customer_comments (
  id text PRIMARY KEY,
  customer_id text, customer_code text, customer_name text,
  branch_name text, rep_name text,
  kind text, body text,
  author_name text, created_at text, updated_at text
);

-- ---------------------------------------------------------------- indexes ----
-- الصفحة بتفتح شهر واحد بس وبتعمل مسح لكل العملاء في النطاق، فالتوقع بيتقرأ
-- بالترتيب ده أولاً (الشهر) وبعدين بالتوزيع. الفهرس المركب بيمنع مسح الجدول كامل.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='collection_forecasts_month_week_rep_idx') THEN
    CREATE INDEX collection_forecasts_month_week_rep_idx
      ON collection_forecasts (month_key, week_index, rep_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='collection_forecasts_month_customer_idx') THEN
    CREATE INDEX collection_forecasts_month_customer_idx
      ON collection_forecasts (month_key, customer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='forecast_month_plans_id_idx') THEN
    CREATE INDEX forecast_month_plans_id_idx ON forecast_month_plans (id);
  END IF;
END $$;

-- -------------------------------------------- guard on week_index semantics ----
-- القيد ده بيمنع كتابة سطر توقع بـ week_index سالب أو أكبر من الحد المسموح،
-- بس بيسمح بـ 0 لأنه معنى التوقع الشهري المستقل. لو الـweek_index وصل لقيمة
-- بره المدى فالمشكلة في الكود مش في البيانات.
--
-- بنعمله DROP + ADD في كل مرة (idempotent) عشان القيد القديم كان <= 5
-- واللي عايزينه <= 8. الـ DROP والـ ADD جوّه block واحد: لو في بيانات قديمة
-- بره المدى الجديد، الـ exception بيعمل rollback للـ block كله — يعني القيد
-- القديم بيرجع زي ما كان ومش بنسيب الجدول من غير حماية. لو عدّى، القيد الجديد
-- اتحط والاتنين نضيفة.

DO $$
BEGIN
  BEGIN
    ALTER TABLE collection_forecasts
      DROP CONSTRAINT IF EXISTS collection_forecasts_week_index_range;
    ALTER TABLE collection_forecasts
      ADD CONSTRAINT collection_forecasts_week_index_range CHECK (week_index >= 0 AND week_index <= 8);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'مش قادرين نوسّع قيد week_index لـ 8 (في بيانات قديمة بره المدى) — القيد القديم اتساب زي ما هو. راجع collection_forecasts.';
  END;
END $$;