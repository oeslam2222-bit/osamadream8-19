-- =============================================================================
--  إصلاح: قيد تفرد كود الصنف (products_code_key) يمنع تعدد المتغيرات
-- =============================================================================
--  السبب:
--    جدول products عليه قيد UNIQUE على العمود code لوحده:
--      • UNIQUE INDEX products_code_unique_idx ON products (lower(trim(code)))
--      • CONSTRAINT products_code_unique UNIQUE (code)
--    ده بيمنع إن الكود الأساسي نفسه يتكرر لأكثر من متغير (مقاس/لون).
--    لكن التطبيق بيعامل كل متغير كصنف مستقل (الهوية = code + unified_code)،
--    فبيظهر خطأ 23505 "duplicate key value violates unique constraint
--    products_code_key" ويفشل حفظ الكتالوج بالكامل (6000+ صنف).
--
--  الحل:
--    نشيل قيد التفرد على code لوحده، ونضيف فهرس عادي على unified_code
--    (للبحث السريع). كده كل متغير بنفس الكود الأساسي يتحفظ مستقلاً.
--
--  ⚠️ ملاحظة: لو شغّلت production-hardening.sql تاني، هيعيد إنشاء القيد.
--
--  شغّل مرة واحدة: Supabase Dashboard → SQL Editor → الصق → Run.
-- =============================================================================

BEGIN;

-- 1) شيل قيد التفرد القديم على code
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_code_unique;
DROP INDEX IF EXISTS public.products_code_unique_idx;

-- 2) فهرس للبحث بالكود الموحد (غير فريد — كل متغير ليه unified_code)
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