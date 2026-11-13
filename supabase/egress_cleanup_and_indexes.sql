-- =============================================================================
-- Egress Optimization: Legacy Base64 Purge, updated_at Triggers & Stamp Indexes
-- =============================================================================
-- Run once in Supabase Dashboard -> SQL Editor -> Run.
-- Fully idempotent & safe on partial schemas (guards every table and column).
--
-- What this script does:
--   1. Purges legacy `data:image/...` Base64 payloads already stored inside:
--      - customers.notes ([GEO_META:...]) & customers.location_photo_url
--      - visits.notes ([GEO_VERIFY:...]) & visits.geo_proof_photo
--      - products.image_url (oversized inline Base64 blobs)
--   2. Ensures `updated_at` exists + stays automatically refreshed via trigger
--      on all synced tables (orders, invoices, visits, customers, products,
--      targets, customer_item_sales, customer_comments, collection_forecasts).
--   3. Creates composite btree indexes so 1-row content stamps & incremental
--      `updatedSince` queries run as instant index-only/top-1 scans.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) PURGE LEGACY BASE64 (`data:image/...`) BLOAT FROM DATABASE ROWS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count bigint := 0;
BEGIN
  -- 1a. customers.notes ([GEO_META:{...,"photo":"data:image/..."}] or raw base64)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'notes'
  ) THEN
    UPDATE public.customers
    SET notes = NULLIF(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(notes, ',"photo"\s*:\s*"data:image/[^"]*"', '', 'gi'),
              '"photo"\s*:\s*"data:image/[^"]*",?', '', 'gi'
            ),
            'data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+', '', 'gi'
          ),
          '\n{3,}', E'\n\n', 'g'
        )
      ),
      ''
    )
    WHERE notes ~* 'data:image/';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned Base64 photo payloads from % customers.notes rows', v_count;
  END IF;

  -- 1b. customers.location_photo_url
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'location_photo_url'
  ) THEN
    UPDATE public.customers
    SET location_photo_url = NULL
    WHERE location_photo_url ~* '^data:image/';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleared Base64 location_photo_url on % customers rows', v_count;
  END IF;

  -- 1c. visits.notes ([GEO_VERIFY:{...,"p":"data:image/..."}] or raw base64)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'notes'
  ) THEN
    UPDATE public.visits
    SET notes = NULLIF(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(notes, ',"p"\s*:\s*"data:image/[^"]*"', '', 'gi'),
              '"p"\s*:\s*"data:image/[^"]*",?', '', 'gi'
            ),
            'data:image/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+', '', 'gi'
          ),
          '\n{3,}', E'\n\n', 'g'
        )
      ),
      ''
    )
    WHERE notes ~* 'data:image/';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned Base64 proof payloads from % visits.notes rows', v_count;
  END IF;

  -- 1d. visits.geo_proof_photo
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'geo_proof_photo'
  ) THEN
    UPDATE public.visits
    SET geo_proof_photo = NULL
    WHERE geo_proof_photo ~* '^data:image/';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleared Base64 geo_proof_photo on % visits rows', v_count;
  END IF;

  -- 1e. products.image_url (purge inline Base64 blobs; Cloudinary/HTTPS URLs untouched)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url'
  ) THEN
    UPDATE public.products
    SET image_url = NULL
    WHERE image_url ~* '^data:image/';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleared inline Base64 image_url on % products rows', v_count;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) TYPE-SAFE `updated_at` AUTO-UPDATE TRIGGER FUNCTION
--    Handles both `timestamptz` and ISO-8601 `text` columns cleanly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF pg_typeof(NEW.updated_at)::text IN ('text', 'character varying') THEN
    IF TG_OP = 'UPDATE' OR NEW.updated_at IS NULL OR trim(NEW.updated_at::text) = '' THEN
      NEW.updated_at := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    END IF;
  ELSE
    IF TG_OP = 'UPDATE' OR NEW.updated_at IS NULL THEN
      NEW.updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) ENSURE `updated_at` COLUMN, BACKFILL & TRIGGER ON ALL SYNCED TABLES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'orders',
    'invoices',
    'visits',
    'customers',
    'products',
    'targets',
    'customer_item_sales',
    'customer_comments',
    'collection_forecasts'
  ];
  v_has_created_at boolean;
  v_updated_at_type text;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      CONTINUE;
    END IF;

    -- Add updated_at if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'updated_at'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN updated_at timestamptz DEFAULT now()',
        v_table
      );
    END IF;

    -- Check created_at availability & updated_at data type for safe backfill
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'created_at'
    ) INTO v_has_created_at;

    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'updated_at'
    INTO v_updated_at_type;

    IF v_updated_at_type IN ('text', 'character varying') THEN
      IF v_has_created_at THEN
        EXECUTE format(
          $q$UPDATE public.%I
             SET updated_at = COALESCE(
               NULLIF(trim(updated_at), ''),
               NULLIF(trim(created_at::text), ''),
               to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             )
             WHERE updated_at IS NULL OR trim(updated_at) = ''$q$,
          v_table
        );
      ELSE
        EXECUTE format(
          $q$UPDATE public.%I
             SET updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             WHERE updated_at IS NULL OR trim(updated_at) = ''$q$,
          v_table
        );
      END IF;
    ELSE
      IF v_has_created_at THEN
        EXECUTE format(
          $q$UPDATE public.%I
             SET updated_at = COALESCE(
               CASE
                 WHEN created_at IS NOT NULL AND trim(created_at::text) ~ '^\d{4}-\d{2}-\d{2}'
                   THEN trim(created_at::text)::timestamptz
                 ELSE NULL
               END,
               now()
             )
             WHERE updated_at IS NULL$q$,
          v_table
        );
      ELSE
        EXECUTE format(
          'UPDATE public.%I SET updated_at = now() WHERE updated_at IS NULL',
          v_table
        );
      END IF;
    END IF;

    -- Attach BEFORE INSERT OR UPDATE trigger (idempotent)
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I', v_table, v_table);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_updated_at BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp()',
      v_table, v_table
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) INDEXES FOR 1-ROW CONTENT STAMPS & INCREMENTAL `updatedSince` QUERIES
--    Guarded per table & column so partial schemas never fail.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._create_idx_if_cols_exist(
  p_idx_name text,
  p_table text,
  p_expr text,
  VARIADIC p_required_cols text[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_col text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) THEN
    RETURN;
  END IF;

  FOREACH v_col IN ARRAY p_required_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = p_table AND column_name = v_col
    ) THEN
      RETURN;
    END IF;
  END LOOP;

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)', p_idx_name, p_table, p_expr);
END;
$$;

-- orders
SELECT public._create_idx_if_cols_exist('idx_orders_updated_at_desc',        'orders', 'updated_at DESC NULLS LAST',              'updated_at');
SELECT public._create_idx_if_cols_exist('idx_orders_created_at_desc',        'orders', 'created_at DESC NULLS LAST',              'created_at');
SELECT public._create_idx_if_cols_exist('idx_orders_rep_updated_at_desc',    'orders', 'rep_id, updated_at DESC NULLS LAST',      'rep_id', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_orders_rep_created_at_desc',    'orders', 'rep_id, created_at DESC NULLS LAST',      'rep_id', 'created_at');
SELECT public._create_idx_if_cols_exist('idx_orders_branch_updated_at_desc', 'orders', 'branch_name, updated_at DESC NULLS LAST', 'branch_name', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_orders_branch_created_at_desc', 'orders', 'branch_name, created_at DESC NULLS LAST', 'branch_name', 'created_at');

-- invoices
SELECT public._create_idx_if_cols_exist('idx_invoices_updated_at_desc',        'invoices', 'updated_at DESC NULLS LAST',              'updated_at');
SELECT public._create_idx_if_cols_exist('idx_invoices_created_at_desc',        'invoices', 'created_at DESC NULLS LAST',              'created_at');
SELECT public._create_idx_if_cols_exist('idx_invoices_rep_updated_at_desc',    'invoices', 'rep_id, updated_at DESC NULLS LAST',      'rep_id', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_invoices_rep_created_at_desc',    'invoices', 'rep_id, created_at DESC NULLS LAST',      'rep_id', 'created_at');
SELECT public._create_idx_if_cols_exist('idx_invoices_branch_updated_at_desc', 'invoices', 'branch_name, updated_at DESC NULLS LAST', 'branch_name', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_invoices_branch_created_at_desc', 'invoices', 'branch_name, created_at DESC NULLS LAST', 'branch_name', 'created_at');

-- visits
SELECT public._create_idx_if_cols_exist('idx_visits_updated_at_desc',     'visits', 'updated_at DESC NULLS LAST', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_visits_created_at_desc',     'visits', 'created_at DESC NULLS LAST', 'created_at');
SELECT public._create_idx_if_cols_exist('idx_visits_rep_date_desc',       'visits', 'rep_id, date DESC',          'rep_id', 'date');
SELECT public._create_idx_if_cols_exist('idx_visits_branch_date_desc',    'visits', 'branch_name, date DESC',     'branch_name', 'date');

-- customers
SELECT public._create_idx_if_cols_exist('idx_customers_updated_at_desc',        'customers', 'updated_at DESC NULLS LAST',              'updated_at');
SELECT public._create_idx_if_cols_exist('idx_customers_rep_updated_at_desc',    'customers', 'rep_id, updated_at DESC NULLS LAST',      'rep_id', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_customers_branch_updated_at_desc', 'customers', 'branch_name, updated_at DESC NULLS LAST', 'branch_name', 'updated_at');

-- products
SELECT public._create_idx_if_cols_exist('idx_products_updated_at_desc', 'products', 'updated_at DESC NULLS LAST', 'updated_at');

-- targets
SELECT public._create_idx_if_cols_exist('idx_targets_updated_at_desc',       'targets', 'updated_at DESC NULLS LAST',            'updated_at');
SELECT public._create_idx_if_cols_exist('idx_targets_month_updated_at_desc', 'targets', 'month_key, updated_at DESC NULLS LAST', 'month_key', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_targets_rep_month',             'targets', 'rep_id, month_key',                     'rep_id', 'month_key');

-- customer_item_sales
SELECT public._create_idx_if_cols_exist('idx_cis_updated_at_desc',       'customer_item_sales', 'updated_at DESC NULLS LAST',        'updated_at');
SELECT public._create_idx_if_cols_exist('idx_cis_month_updated_at_desc', 'customer_item_sales', 'month, updated_at DESC NULLS LAST', 'month', 'updated_at');
SELECT public._create_idx_if_cols_exist('idx_cis_branch_month',          'customer_item_sales', 'branch_name, month',                'branch_name', 'month');
SELECT public._create_idx_if_cols_exist('idx_cis_rep_month',             'customer_item_sales', 'rep_id, month',                     'rep_id', 'month');

-- customer_comments
SELECT public._create_idx_if_cols_exist('idx_customer_comments_updated_at_desc',   'customer_comments', 'updated_at DESC NULLS LAST',              'updated_at');
SELECT public._create_idx_if_cols_exist('idx_customer_comments_cust_created_desc', 'customer_comments', 'customer_id, created_at DESC NULLS LAST', 'customer_id', 'created_at');

-- collection_forecasts
SELECT public._create_idx_if_cols_exist('idx_collection_forecasts_updated_at_desc',       'collection_forecasts', 'updated_at DESC NULLS LAST',            'updated_at');
SELECT public._create_idx_if_cols_exist('idx_collection_forecasts_month_updated_at_desc', 'collection_forecasts', 'month_key, updated_at DESC NULLS LAST', 'month_key', 'updated_at');

-- Drop temporary helper function so schema stays tidy
DROP FUNCTION IF EXISTS public._create_idx_if_cols_exist(text, text, text, text[]);
