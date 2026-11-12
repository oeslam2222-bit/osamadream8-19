-- =============================================================================
-- تقليل EGRESS: الكتالوج الغني في جدول products بدل صفوف الـ chunks داخل orders
-- -----------------------------------------------------------------------------
-- المشكلة (متقاسة على السيرفر 2026-11-12):
--   كل تعديل في الكتالوج كان بيعيد كتابة ~10 صفوف catalog_sync_chunk
--   (~350KB للصف) داخل جدول orders = ~3.5MB رفع لكل دفعة تعديلات،
--   وكل جهاز بيقرأ الكتالوج من نفس الـ chunks = ~3.5MB تنزيل بدل 416KB.
--
-- الحل: أعمدة غنية على جدول products (الكود أصلاً بيتوقعهم في
-- PRODUCTS_SELECT_COLUMNS بس كان فاشل صامت لأن الأعمدة مش موجودة)،
-- فبعد الميجريشن ده:
--   - الحفظ: upsert صفوف عادية (كيلوبايتات) بدل إعادة كتابة الـ snapshot.
--   - القراءة: الجدول الرسمي (416KB) بدل الـ chunks (3.5MB).
--   - المزامنة التدريجية fetchProductsIncremental تشتغل بالـ updated_at.
--
-- التشغيل: Supabase Dashboard → SQL Editor → لصق الملف → Run (idempotent).
-- =============================================================================

-- 1) الأعمدة الغنية (نفس أسماء PRODUCTS_SELECT_COLUMNS في supabaseService.ts)
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_priority        text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_stock_actual   numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_stock_reserved numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_warehouse_actual   numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS main_warehouse_reserved numeric DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_group        text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS family_name       text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS classification    text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cloudinary_public_id text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unified_code      text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_stocks     jsonb DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sector            text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_name       text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- 2) باك فِل للصفوف الموجودة: updated_at من created_at عشان المؤشر التدريجي
--    يبقى له نقطة بداية صحيحة.
UPDATE products SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

-- 3) فهرس على updated_at — القراءة التدريجية (gte updated_at) بتنفذ بسرعة.
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products (updated_at);

-- 4) تريجر: أي تعديل على الصنف يحدّث updated_at تلقائيًا — حتى لو الحفظ جه
--    بـ payload قديم (7 أعمدة) المؤشر التدريجي يشوف التغيير.
CREATE OR REPLACE FUNCTION public.products_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_touch_updated_at ON products;
CREATE TRIGGER trg_products_touch_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION public.products_touch_updated_at();
