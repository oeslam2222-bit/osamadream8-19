-- ==============================================================================
-- TANTAWY GROUP - جدول مبيعات العملاء بالصنف (customer_item_sales)
-- شغّل الملف ده مرة واحدة في Supabase -> SQL Editor
-- آمن للتشغيل أكثر من مرة (idempotent) وعلى جدول موجود بالفعل.
-- ==============================================================================

-- 1. إنشاء الجدول
CREATE TABLE IF NOT EXISTS public.customer_item_sales (
    id TEXT PRIMARY KEY,                               -- معرّف ثابت (cis-xxxx) لمنع التكرار عند إعادة المزامنة
    customer_account VARCHAR(100) NOT NULL,
    invoicing_name VARCHAR(255) NOT NULL,
    sales_order VARCHAR(100),
    sale_date DATE,
    rep_name VARCHAR(150) NOT NULL,
    rep_id VARCHAR(100),
    month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
    warehouse VARCHAR(150) DEFAULT 'الفرع الرئيسي',
    item_code VARCHAR(100) NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    unified_code VARCHAR(100),
    unit VARCHAR(50) DEFAULT 'كرتونة',
    factor NUMERIC(10, 2) DEFAULT 1.00,
    unit_price NUMERIC(15, 2) DEFAULT 0.00,
    discount NUMERIC(15, 2) DEFAULT 0.00,
    quantity NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    item_group VARCHAR(150) DEFAULT 'عام',
    definitions TEXT,
    family_dimension VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. ترقية جدول موجود بالفعل (ناقص أعمدة / معرّف UUID)
ALTER TABLE public.customer_item_sales ADD COLUMN IF NOT EXISTS unified_code VARCHAR(100);
ALTER TABLE public.customer_item_sales ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.customer_item_sales ADD COLUMN IF NOT EXISTS rep_id VARCHAR(100);
ALTER TABLE public.customer_item_sales ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.customer_item_sales ALTER COLUMN id TYPE TEXT;
ALTER TABLE public.customer_item_sales ALTER COLUMN quantity SET DEFAULT 0.00;

-- 2. الفهارس
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_cust_account ON public.customer_item_sales(customer_account);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_invoicing_name ON public.customer_item_sales(invoicing_name);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_rep_name ON public.customer_item_sales(rep_name);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_month ON public.customer_item_sales(month);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_item_code ON public.customer_item_sales(item_code);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_warehouse ON public.customer_item_sales(warehouse);
CREATE INDEX IF NOT EXISTS idx_customer_item_sales_item_group ON public.customer_item_sales(item_group);

-- 3. تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION public.set_customer_item_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customer_item_sales_updated_at ON public.customer_item_sales;
CREATE TRIGGER trg_customer_item_sales_updated_at
BEFORE UPDATE ON public.customer_item_sales
FOR EACH ROW EXECUTE FUNCTION public.set_customer_item_sales_updated_at();

-- 4. الأمان (RLS) والصلاحيات
ALTER TABLE public.customer_item_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to customer_item_sales" ON public.customer_item_sales;
CREATE POLICY "Allow authenticated users full access to customer_item_sales"
ON public.customer_item_sales
FOR ALL
TO authenticated, anon
USING (true)
WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_item_sales TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- 5. الفيو التحليلي
CREATE OR REPLACE VIEW public.view_customer_monthly_item_sales AS
SELECT
    customer_account,
    invoicing_name,
    rep_name,
    warehouse,
    month,
    item_code,
    item_name,
    item_group,
    SUM(quantity) AS total_quantity,
    SUM(amount) AS total_amount,
    COUNT(DISTINCT sales_order) AS total_orders
FROM public.customer_item_sales
GROUP BY customer_account, invoicing_name, rep_name, warehouse, month, item_code, item_name, item_group;

GRANT SELECT ON public.view_customer_monthly_item_sales TO anon, authenticated;
