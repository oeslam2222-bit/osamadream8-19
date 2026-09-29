-- Run once in Supabase SQL Editor to add Sales & Collections analytics columns
-- to the customers table so that financial totals persist across device syncs.
-- Without these columns, saveCustomersToSupabase omits the fields and
-- fetchCustomersFromSupabase returns 0 — causing the إجمالي المبيعات / إجمالي التحصيل cards
-- to show empty/zero for all users except the admin who imported the Excel sheet.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'sales_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN sales_2026 numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_monthly_sales'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_monthly_sales numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_overall_sales'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_overall_sales numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'collections_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN collections_2026 numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_monthly_collections'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_monthly_collections numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_overall_collections'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_overall_collections numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'monthly_sales_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN monthly_sales_2026 jsonb DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'monthly_collections_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN monthly_collections_2026 jsonb DEFAULT '{}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'sales_2025'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN sales_2025 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'collections_2025'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN collections_2025 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'overdue_2025'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN overdue_2025 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'overdue_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN overdue_2026 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'due_until_period'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN due_until_period numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'opening_balance_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN opening_balance_2026 numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'has_dealt_in_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN has_dealt_in_2026 boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_overdue_and_due'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_overdue_and_due numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'overdue_balance'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN overdue_balance numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'due_balance'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN due_balance numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_overdue'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN total_overdue numeric;
  END IF;

  -- قابل / غير قابل classification from the sheet. Without this the column was
  -- read locally for the admin only, and every other role saw an empty value
  -- and counted everyone as قابل.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'deal_eligibility'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN deal_eligibility text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'dealt_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN dealt_2026 text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'dealt_in_2026'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN dealt_in_2026 boolean;
  END IF;
END $$;
