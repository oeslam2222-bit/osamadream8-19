-- ============================================================================
-- تنظيف تكرارات جدول مبيعات الأصناف (اختياري — يُنفَّذ مرة واحدة)
-- ----------------------------------------------------------------------------
-- السبب: قبل تحديث المعرّفات، كان كل استيراد بيولّد معرّف عشوائي لكل سطر،
-- فإعادة استيراد نفس الشيت كانت بتنشئ أسطر مكررة (نفس العميل/الصنف/الشهر/الأمر).
-- دلوقتي المعرّف مشتق من مفاتيح السطر، فالتكرار مش هيتكرر مستقبلًا.
-- السكربت ده بينضّف القديم فقط.
--
-- ⚠️ قبل التنفيذ:
--   1) خُد نسخة احتياطية:  CREATE TABLE customer_item_sales_backup AS SELECT * FROM customer_item_sales;
--   2) شغّل الجزء الأول (المعاينة) وشوف الأرقام.
--   3) بعدين شغّل الحذف، وبعده (اختياري) شوف التقرير النهائي.
-- ============================================================================

-- 1) معاينة: كام صف مكرر موجود؟
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) - COUNT(DISTINCT (customer_account, item_code, month, COALESCE(sales_order, ''), COALESCE(sale_date::text, ''), quantity, amount)) AS duplicate_rows
FROM public.customer_item_sales;

-- 2) الحذف: نسيب صف واحد لكل مجموعة (الأقدم إنشاءً، ثم الأصغر معرّفًا)
BEGIN;

DELETE FROM public.customer_item_sales t
USING (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY customer_account, item_code, month,
                   COALESCE(sales_order, ''), COALESCE(sale_date::text, ''),
                   quantity, amount
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.customer_item_sales
) d
WHERE t.ctid = d.ctid
  AND d.rn > 1;

-- راجع الناتج قبل التأكيد؛ لو الأرقام منطقية:
COMMIT;
-- لو حصل أي شيء غير متوقع:  ROLLBACK;

-- 3) تحقق بعد التنفيذ
SELECT COUNT(*) AS remaining_rows FROM public.customer_item_sales;
