-- =============================================================================
-- أرشفة الفواتير / الأوامر بعد التنفيذ (Archive invoices/orders after execution)
-- =============================================================================
-- السبب: بعد ما الطلبية (أو الفاتورة) تدخل مرحلة التنفيذ النهائي
--   (الاعتماد المالي/الصرف -> 'معتمدة' / 'معتمدة ومصرفة من المخزن',
--    التسليم -> 'تم التسليم', الإغلاق -> 'إغلاق الطلبية')
--   لازم تتحول لحالة "أرشيف" وتختفي من القوائم النشطة (getVisibleInvoices)
--   وتظهر تاني لما يُبحث عنها (بحث أرشيفي).
--
-- ملاحظات:
--   * is_archived: false = نشط (ظاهر للقوائم)، true = مؤرشف (مخفي/أرشيف).
--   * archived_at / archived_by: وقت الأرشفة واسم المستخدم اللي أرشفها.
--   * الأعمدة نفسها على جداول invoices و orders (لأنها بتشارك نفس دالة الحفظ).
-- =============================================================================

-- 1) إضافة أعمدة الأرشفة على جدول invoices:
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

-- 2) إضافة أعمدة الأرشفة على جدول orders (لأن الأوامر تُحفظ كأعمدة مشتركة):
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS archived_by TEXT;

-- 3) تحقق من الأعمدة بعد الإضافة:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('invoices', 'orders') AND column_name IN ('is_archived','archived_at','archived_by');
