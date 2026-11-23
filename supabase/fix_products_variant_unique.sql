-- =============================================================================
--  إصلاح: أي قيد/فهرس UNIQUE على جدول products يمنع تعدد المتغيرات
-- =============================================================================
--  شغّل مرة واحدة: Supabase Dashboard → SQL Editor → الصق → Run.
--  بيقلل أي قيد UNIQUE على products (code أو unified_code أو غيرهم)،
--  وبيسيب الـ PRIMARY KEY زي ما هو.
-- =============================================================================

BEGIN;

-- 1) شيل كل قيود UNIQUE على products (مش الـ PRIMARY KEY)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT IF EXISTS %I', r.conname);
    RAISE NOTICE '✅ Dropped unique constraint: % (%)', r.conname, r.def;
  END LOOP;
END $$;

-- 2) شيل أي UNIQUE INDEX مستقل على products (مع استثناء فهارس الـ constraints زي الـ PK)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexname NOT IN (
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    RAISE NOTICE '✅ Dropped unique index: %', r.indexname;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
--  ✅ تحقق: المفروض الرجوع 0 صفوف
-- =============================================================================
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.products'::regclass
  AND contype = 'u';

-- كمان شوف الفهارس الفريدة (المفروض يفضل بس products_pkey)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'products'
  AND indexdef ILIKE '%UNIQUE%';