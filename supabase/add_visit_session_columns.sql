-- =============================================================================
--  أعمدة جلسة الزيارة ومؤشراتها — سبب خطأ 400 في جدول visits
-- =============================================================================
--
--  التطبيق (fetchVisitsFromSupabase) بيقرأ قائمة أعمدة صريحة من جدول visits.
--  PostgREST بيرفض الاستعلام كله (400) لو **عمود واحد** منها مش موجود، فالزيارات
--  كانت بتترجع بقائمة أعمدة مخفّضة (fallback) وبعض البيانات تفضل ناقصة.
--
--  الملف ده بيضيف الأعمدة الناقصة بنفس الأنواع اللي الكود بيتوقعها.
--  آمن للتشغيل أكثر من مرة (IF NOT EXISTS).
--
--  التنفيذ: Supabase Dashboard → SQL Editor → الصق الملف كامل → Run
-- =============================================================================

ALTER TABLE public.visits
  -- موقع الزيارة المخزّن كـjsonb (الكود بيقرأه ويرجع لـlatitude/longitude لو مش موجود)
  ADD COLUMN IF NOT EXISTS location jsonb,
  -- وقت الحضور/الانصراف محفوظ كنص "HH:MM" زي ما بتسجّله شاشة الزيارة
  ADD COLUMN IF NOT EXISTS check_in_time text,
  ADD COLUMN IF NOT EXISTS check_out_time text,
  ADD COLUMN IF NOT EXISTS duration_minutes numeric,
  -- قراءة حالة الرف في زيارة المندوب
  ADD COLUMN IF NOT EXISTS store_stock_status text,
  ADD COLUMN IF NOT EXISTS competitor_notes text,
  ADD COLUMN IF NOT EXISTS customer_rating numeric,
  ADD COLUMN IF NOT EXISTS next_visit_date text,
  -- الأمر/الفاتورة اللي اتولدت من الزيارة
  ADD COLUMN IF NOT EXISTS order_created_id text,
  ADD COLUMN IF NOT EXISTS order_amount numeric;

-- فهرس خفيف لمتابعة الزيارات المجدولة القادمة (next_visit_date).
CREATE INDEX IF NOT EXISTS visits_next_visit_date_idx
  ON public.visits (next_visit_date);

-- =============================================================================
--  تحقّق سريع بعد التشغيل (اختياري):
--    SELECT column_name, data_type
--      FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'visits'
--     ORDER BY ordinal_position;
--  المفروض تلاقي: location, check_in_time, check_out_time, duration_minutes,
--  store_stock_status, competitor_notes, customer_rating, next_visit_date,
--  order_created_id, order_amount.
-- =============================================================================
