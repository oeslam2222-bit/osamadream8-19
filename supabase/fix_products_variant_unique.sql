-- =============================================================================
--  إصلاح: قيد تفرد كود الصنف (products_code_key) يمنع تعدد المتغيرات
-- =============================================================================
--  السبب:
--    جدول products عليه قيد UNIQUE على العمود code لوحده. القيد ده موجود
--    باسمين محتملين:
--      • products_code_key   (اسم تلقائي من Postgres عند إنشاء الجدول)
--      • products_code_unique (من production-hardening.sql)
--    ده بيمنع إن الكود الأساسي نفسه يتكرر لأكثر من متغير (مقاس/لون)،
--    فبيظهر خطأ 23505 "duplicate key value violates unique constraint
--    products_code_key" ويفشل حفظ الكتالوج بالكامل.
--
--  الحل:
--    نشيل أي قيد/فهرس UNIQUE على code لوحده، ونضيف فهرس عادي على
--    unified_code (للبحث السريع). كده كل متغير بنفس الكود الأساسي يتحفظ.
--
--  شغّل مرة واحدة: Supabase Dashboard → SQL Editor → الصق → Run.
-- =============================================================================

-- (اختياري) اتأكد الأول من القيد الموجود عندك:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.products'::regclass AND contype = 'u';

BEGIN;

-- 1) شيل القيدين المعروفين (التلقائي + بتاع production-hardening)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_unique;

-- 2) شيل الفهارس الفريدة المعروفة على code
DROP INDEX IF EXISTS public.products_code_unique_idx;
DROP INDEX IF EXISTS public.products_code_key;

-- 3) كنس احتياطي: أي قيد/فهرس UNIQUE تاني على code لوحده
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE 'unique (code)'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE 'Dropped unique constraint % on products(code)', r.conname;
  END LOOP;

  FOR r IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND indexdef ILIKE '%unique%'
      AND (indexdef ILIKE '%(code)%' OR indexdef ILIKE '%lower(trim(code))%')
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    RAISE NOTICE 'Dropped unique index % on products(code)', r.indexname;
  END LOOP;
END $$;

-- 4) فهرس عادي للبحث بالكود الموحد (غير فريد — كل متغير ليه unified_code)
CREATE INDEX IF NOT EXISTS products_unified_code_idx
  ON public.products (lower(trim(unified_code)));

COMMIT;

-- ✅ بعد كده جرّب استيراد الشيت تاني.

-- -----------------------------------------------------------------------------
-- (اختياري) لو حابب تمنع تكرار نفس (code + unified_code) بالظبط:
--   1) شغّل الاستعلام ده الأول للتأكد إنه مفيش تكرار:
--        SELECT code, unified_code, count(*)
--        FROM public.products
--        GROUP BY lower(trim(code)), lower(trim(coalesce(unified_code, '')))
--        HAVING count(*) > 1;
--   2) لو النتيجة فاضية، شغّل:
--        CREATE UNIQUE INDEX IF NOT EXISTS products_code_variant_unique_idx
--          ON public.products
--          (lower(trim(code)), lower(trim(coalesce(unified_code, ''))));
-- -----------------------------------------------------------------------------