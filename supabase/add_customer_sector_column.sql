-- ============================================================
-- إصلاح جدول العملاء: إضافة عمود sector + profile_image_url
-- ============================================================
-- المشكلة: "Could not find the 'sector' column of 'customers' in the schema cache"
-- السبب: جدول customers في Supabase ناقص عمود sector (والـ profile_image_url لصور البروفايل).
-- هذا السكربت آمن (IF NOT EXISTS) ويمكن تشغيله مراراً.
-- ============================================================

-- 1. عمود القطاع (sector) — لعزل البيانات بين قطاعات منزلي/كهرباء
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sector text;

-- 2. عمود صورة البروفايل (Cloudinary URL) — لصور عملاء/المكان
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_image_url text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS profile_image_public_id text;

-- 3. Backfill: ضع 'home' (منزلي) كقيمة افتراضية للسجلات القديمة (إن وجدت)
UPDATE public.customers
SET sector = 'home'
WHERE sector IS NULL;

-- 4. index لتسريع فلترة sector
CREATE INDEX IF NOT EXISTS idx_customers_sector ON public.customers (sector);

-- 5. (اختياري) تحقق من إضافة الأعمدة
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
  AND column_name IN ('sector', 'profile_image_url', 'profile_image_public_id')
ORDER BY column_name;
