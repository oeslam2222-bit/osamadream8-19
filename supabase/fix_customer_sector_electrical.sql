-- =============================================================================
-- تصحيح قطاع العملاء مرة واحدة (Fix customer sector — one-time UPDATE)
-- =============================================================================
-- السبب: add_customer_sector_column.sql نفّذ
--        UPDATE customers SET sector = 'home' WHERE sector IS NULL;
--        فـ 5,438 عميل (منهم ~1,974 كهربائي) اتسجّلو «منزلي».
--
-- المعايير المعتمدة (موافقة الإدارة): اسم العميل + اسم المحل + اسم المندوب
--   أي نص فيه «كهرب» (كهربا / كهرباء / كهربائي) → قطاع كهربائي.
--
-- ملاحظات أمان:
--   * الكشف التلقائي بيغلب 'home' الغلط بس — قيم 'both' / 'all' / 'electrical'
--     مابتتعدّلش.
--   * كمية التغيير المتوقعة: ~1,974 عميل.
--   * RLS على جدول customers بيسمح بالتعديل (customers_anon_all USING (true))،
--     فممكن تشغّلها من محرر SQL في Supabase مباشرة.
-- =============================================================================

-- 1) معاينة قبل التعديل (لازم ترجع ~1,974 صف):
SELECT id, code, name, store_name, rep_name, sector
FROM customers
WHERE sector = 'home'
  AND (
    name       ILIKE '%كهرب%'
    OR store_name ILIKE '%كهرب%'
    OR rep_name   ILIKE '%كهرب%'
  );

-- 2) التصحيح الفعلي:
UPDATE customers
SET sector = 'electrical'
WHERE sector = 'home'
  AND (
    name       ILIKE '%كهرب%'
    OR store_name ILIKE '%كهرب%'
    OR rep_name   ILIKE '%كهرب%'
  );

-- 3) التحقق بعد التعديل:
--    المطلوب: قطاع كهربائي يطلع ~1,974+ عميل (كان 2 بس)،
--    والمنزلي يقلّ بنفس العدد.
SELECT sector, COUNT(*) AS customers
FROM customers
GROUP BY sector
ORDER BY customers DESC;

-- =============================================================================
-- للفحص السريع (اختياري): العملاء اللي لسه متوهمين بين المسارين
-- (اسمهم فيه «كهرب» بس sector فاضي):
-- =============================================================================
-- SELECT id, code, name, sector FROM customers
-- WHERE sector IS NULL
--   AND (name ILIKE '%كهرب%' OR store_name ILIKE '%كهرب%' OR rep_name ILIKE '%كهرب%');
