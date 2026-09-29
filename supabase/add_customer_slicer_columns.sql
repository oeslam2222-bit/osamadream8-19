-- ============================================================
-- Customer slicer columns
-- ============================================================
-- The analytics view drives its whole "بيانات تجارية وائتمانية" slicer
-- section (طبيعة النشاط / أوراق الضمان / طريقة الدفع / خ-ك) from these
-- sheet columns. Without them every slicer counts 0 after a page reload,
-- because the values are dropped on the way into and out of Supabase.
--
-- Safe to run more than once.
-- ============================================================

-- طبيعة النشاط
ALTER TABLE customers ADD COLUMN IF NOT EXISTS activity_type text;

-- تصنيف العميل: خ / ك
ALTER TABLE customers ADD COLUMN IF NOT EXISTS client_type text;

-- طريقة الدفع
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms text;

-- أوراق الضمان (الفئة النصية) وقيمتها
ALTER TABLE customers ADD COLUMN IF NOT EXISTS guarantee_docs text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS guarantee_amount numeric DEFAULT 0;

-- المنطقة / الخط — used by the region slicer
ALTER TABLE customers ADD COLUMN IF NOT EXISTS region text;

-- آخر تحصيل
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_collection_date text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_collection_amount numeric DEFAULT 0;

-- ------------------------------------------------------------
-- Backfill: an older sync may have stored the amounts only inside
-- the free-text guarantee column, e.g. "ماضي على ورق ضمان (5,000 ج.م)".
-- Move that number into guarantee_amount so the guarantee slicer counts it.
-- ------------------------------------------------------------
UPDATE customers
SET guarantee_amount = COALESCE(NULLIF(guarantee_amount, 0), sub.amount)
FROM (
  SELECT id,
         COALESCE(
           substring(guarantee_docs from '([0-9][0-9,]*\.?[0-9]*)')::numeric,
           NULL
         ) AS amount
  FROM customers
  WHERE guarantee_docs ~ '[0-9]'
) AS sub
WHERE customers.id = sub.id
  AND sub.amount IS NOT NULL
  AND COALESCE(customers.guarantee_amount, 0) = 0;

-- Give the guarantee column a stable label for any row that carries an amount
-- but no category text, so it is not counted as "بدون ضمان".
UPDATE customers
SET guarantee_docs = 'أوراق ضمان'
WHERE COALESCE(guarantee_amount, 0) > 0
  AND COALESCE(NULLIF(TRIM(guarantee_docs), ''), '') = '';

-- ------------------------------------------------------------
-- Helpful lookup indexes for the slicer aggregations
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_activity_type ON customers (activity_type);
CREATE INDEX IF NOT EXISTS idx_customers_client_type   ON customers (client_type);
CREATE INDEX IF NOT EXISTS idx_customers_payment_terms  ON customers (payment_terms);
CREATE INDEX IF NOT EXISTS idx_customers_guarantee      ON customers (guarantee_docs);
