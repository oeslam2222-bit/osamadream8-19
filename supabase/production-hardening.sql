-- Run once in Supabase SQL Editor after taking a backup.
-- Product images are stored in public.products.image_url; there is no separate
-- image table in this application.

-- Keep the newest product row for each code, then make code unique.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY lower(trim(code)) ORDER BY updated_at DESC NULLS LAST, id DESC) AS row_no
  FROM public.products
  WHERE code IS NOT NULL AND trim(code) <> ''
)
DELETE FROM public.products p
USING ranked r
WHERE p.id = r.id AND r.row_no > 1;

CREATE UNIQUE INDEX IF NOT EXISTS products_code_unique_idx
  ON public.products (lower(trim(code)));

-- User login identities must be unique regardless of case or surrounding spaces.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique_idx
  ON public.users (lower(regexp_replace(trim(username), '\\s+', '', 'g')));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique_idx
  ON public.users (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_code_unique'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_code_unique UNIQUE (code);
  END IF;
END $$;

-- Invoice privacy. This requires users to authenticate with Supabase Auth.
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_owner_or_admin ON public.invoices;
CREATE POLICY invoices_select_owner_or_admin
  ON public.invoices FOR SELECT TO authenticated
  USING (
    rep_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'developer')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS invoices_insert_owner_or_admin ON public.invoices;
CREATE POLICY invoices_insert_owner_or_admin
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    rep_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()::text
        AND u.role IN ('admin', 'developer')
        AND u.is_active = true
    )
  );

DROP POLICY IF EXISTS invoices_update_owner_or_admin ON public.invoices;
CREATE POLICY invoices_update_owner_or_admin
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    rep_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()::text AND u.role IN ('admin', 'developer') AND u.is_active = true)
  )
  WITH CHECK (
    rep_id = auth.uid()::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()::text AND u.role IN ('admin', 'developer') AND u.is_active = true)
  );

-- Remove old demo records only if they are explicitly marked as demo.
-- Review the result before deleting any real business data.
-- DELETE FROM public.products WHERE code LIKE 'DEMO-%';
-- DELETE FROM public.invoices WHERE invoice_number LIKE 'DEMO-%';