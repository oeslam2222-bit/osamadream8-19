-- =============================================================================
-- EGRESS reduction: server-side sales summary RPC get_sales_summary(p_days)
-- Pure ASCII source: safe for every SQL client and clipboard encoding.
-- =============================================================================
-- Returns one jsonb row with every precomputed aggregate:
--   { kpis, daily, by_branch, by_rep, top_products, top_customers, recent }
--
-- How to run: Supabase Dashboard -> SQL Editor -> paste this file -> Run.
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.safe_iso_date(v text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date;
BEGIN
  BEGIN
    d := left(v, 10)::date;
  EXCEPTION WHEN others THEN
    d := NULL;
  END;
  RETURN d;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_summary(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_result jsonb;
BEGIN
  v_from := (now() - (greatest(p_days, 1) - 1) * interval '1 day')::date;

  WITH base AS (
    SELECT id, invoice_number, customer_name, branch_name, rep_name,
           status, items, estimated_grand_total, created_at,
           public.safe_iso_date(created_at::text) AS day
    FROM orders
    WHERE id NOT LIKE 'dream\_%' ESCAPE '\'
      AND id <> '00000000-0000-0000-0000-000000000002'
      AND status NOT ILIKE 'catalog\_sync\_%' ESCAPE '\'
      -- Arabic status literals rebuilt via chr() so the file stays pure ASCII:
      AND status NOT IN (
        chr(1605) || chr(1604) || chr(063A) || chr(0627) || chr(0629),                    -- canceled
        chr(1605) || chr(0631) || chr(0641) || chr(0648) || chr(0636) || chr(0629)
          || ' / '
          || chr(1605) || chr(1604) || chr(063A) || chr(0627) || chr(0629)                -- rejected / canceled
      )
      AND public.safe_iso_date(created_at::text) >= v_from
  ),
  kpis AS (
    SELECT
      coalesce(sum(estimated_grand_total), 0)                        AS sales,
      count(*)                                                       AS orders,
      count(DISTINCT customer_name)                                  AS customers,
      (
        SELECT coalesce(sum((it ->> 'cartonCount')::numeric), 0)
        FROM base b
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(b.items) = 'array' THEN b.items ELSE '[]'::jsonb END
        ) AS it
      )                                                              AS cartons
    FROM base
  ),
  daily AS (
    SELECT day::text AS day, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE day IS NOT NULL
    GROUP BY day
    ORDER BY day
  ),
  by_branch AS (
    SELECT branch_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    GROUP BY branch_name
    ORDER BY sales DESC
    LIMIT 10
  ),
  by_rep AS (
    SELECT rep_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    GROUP BY rep_name
    ORDER BY sales DESC
    LIMIT 10
  ),
  products AS (
    SELECT
      it ->> 'productName'          AS product_name,
      sum((it ->> 'netTotal')::numeric) AS sales,
      sum((it ->> 'cartonCount')::numeric) AS cartons
    FROM base b
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(b.items) = 'array' THEN b.items ELSE '[]'::jsonb END
    ) AS it
    WHERE it ->> 'productName' IS NOT NULL
    GROUP BY product_name
    ORDER BY sales DESC
    LIMIT 10
  ),
  by_month AS (
    SELECT to_char(day, 'YYYY-MM') AS month, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE day IS NOT NULL
    GROUP BY month
    ORDER BY sales DESC
    LIMIT 12
  ),
  by_branch_month AS (
    SELECT to_char(day, 'YYYY-MM') AS month, branch_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE day IS NOT NULL AND branch_name IS NOT NULL
    GROUP BY month, branch_name
    ORDER BY sales DESC
    LIMIT 60
  ),
  by_rep_month AS (
    SELECT to_char(day, 'YYYY-MM') AS month, rep_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE day IS NOT NULL AND rep_name IS NOT NULL
    GROUP BY month, rep_name
    ORDER BY sales DESC
    LIMIT 60
  ),
  by_customer_month AS (
    SELECT to_char(day, 'YYYY-MM') AS month, customer_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE day IS NOT NULL AND customer_name IS NOT NULL
    GROUP BY month, customer_name
    ORDER BY sales DESC
    LIMIT 60
  ),
  customers AS (
    SELECT customer_name AS name, sum(estimated_grand_total) AS sales, count(*) AS orders
    FROM base
    WHERE customer_name IS NOT NULL
    GROUP BY customer_name
    ORDER BY sales DESC
    LIMIT 10
  ),
  recent AS (
    SELECT id, invoice_number, customer_name, branch_name, rep_name, status,
           estimated_grand_total, day::text AS date
    FROM base
    ORDER BY created_at DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'days', p_days,
    'from', v_from,
    'kpis',          (SELECT to_jsonb(k) FROM kpis k),
    'daily',         coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM daily d), '[]'::jsonb),
    'by_branch',     coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM by_branch b), '[]'::jsonb),
    'by_rep',        coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM by_rep r), '[]'::jsonb),
    'top_products',  coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM products p), '[]'::jsonb),
    'top_customers', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM customers c), '[]'::jsonb),
    'recent',        coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM recent x), '[]'::jsonb),
    'by_month',      coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM by_month m), '[]'::jsonb),
    'by_branch_month', coalesce((SELECT jsonb_agg(to_jsonb(bm)) FROM by_branch_month bm), '[]'::jsonb),
    'by_rep_month',  coalesce((SELECT jsonb_agg(to_jsonb(rm)) FROM by_rep_month rm), '[]'::jsonb),
    'by_customer_month', coalesce((SELECT jsonb_agg(to_jsonb(cmm)) FROM by_customer_month cmm), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Permissions: revoke from anon/public, grant to authenticated only
REVOKE ALL ON FUNCTION public.get_sales_summary(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_summary(int) TO authenticated;

-- Also lock down safe_iso_date
REVOKE ALL ON FUNCTION public.safe_iso_date(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_iso_date(text) TO authenticated;

