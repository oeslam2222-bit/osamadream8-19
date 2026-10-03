-- Tamper-evident history for the business tables.
--
-- The app authenticates on the client and writes with the public anon key, so
-- until the writes move behind an Edge Function anyone who opens the app can
-- technically reach these tables directly. This migration does not try to block
-- that (blocking it would break the live app). Instead it makes every change
-- recoverable and attributable:
--
--   * every UPDATE / DELETE is copied into data_change_history before it happens
--   * that history is append-only: it can be added to, never edited or removed
--   * each entry records the caller's IP and request id
--
-- A bulk "rm -rf" through curl, or a silent price change, therefore leaves both
-- the old value and the source address behind.
--
-- Run once in the Supabase SQL Editor. No app change and no downtime.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. The history ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_change_history (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  row_id text,
  operation text NOT NULL,
  old_row jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source_ip text,
  request_id text
);

CREATE INDEX IF NOT EXISTS idx_data_change_history_table_time
  ON public.data_change_history (table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_change_history_row
  ON public.data_change_history (table_name, row_id);

-- ---------------------------------------------------------------------------
-- 2. Append-only enforcement.
--    NOTE: this intentionally does NOT stop INSERT, so the guard below can write.
--    Without the grants in step 4 every app write would fail, hence GRANT INSERT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deny_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'data_change_history is append-only (attempted %)', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_history_no_row_mutation ON public.data_change_history;
CREATE TRIGGER trg_history_no_row_mutation
  BEFORE UPDATE OR DELETE ON public.data_change_history
  FOR EACH ROW EXECUTE FUNCTION public.deny_history_mutation();

DROP TRIGGER IF EXISTS trg_history_no_truncate ON public.data_change_history;
CREATE TRIGGER trg_history_no_truncate
  BEFORE TRUNCATE ON public.data_change_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.deny_history_mutation();

-- ---------------------------------------------------------------------------
-- 3. The capture trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_data_change() RETURNS trigger AS $$
DECLARE
  v_headers json;
  v_ip text;
  v_request_id text;
  v_row_id text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_ip := v_headers ->> 'x-forwarded-for';
    v_request_id := v_headers ->> 'x-request-id';
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
    v_ip := NULL;
    v_request_id := NULL;
  END;

  v_row_id := COALESCE(
    to_jsonb(OLD) ->> 'id',
    to_jsonb(OLD) ->> 'code',
    to_jsonb(OLD) ->> 'invoice_number'
  );

  INSERT INTO public.data_change_history (table_name, row_id, operation, old_row, source_ip, request_id)
  VALUES (TG_TABLE_NAME, v_row_id, TG_OP, to_jsonb(OLD), v_ip, v_request_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 4. Grants. Without these the triggers cannot write and EVERY app write fails,
--    so run this section together with the triggers.
-- ---------------------------------------------------------------------------
GRANT INSERT, SELECT ON public.data_change_history TO anon;
GRANT INSERT, SELECT ON public.data_change_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.data_change_history_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.data_change_history_id_seq TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.data_change_history FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.data_change_history FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Attach to the business tables. Each statement is independent, so a table
--    that does not exist yet can be skipped without failing the whole run.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target text;
  guarded text[] := ARRAY[
    'invoices', 'visits', 'customers', 'products', 'users', 'targets', 'orders', 'app_users'
  ];
BEGIN
  FOREACH target IN ARRAY guarded LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_history ON public.%I', target);
      EXECUTE format(
        'CREATE TRIGGER trg_history BEFORE UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_data_change()', target);
      RAISE NOTICE 'history trigger attached to public.%', target;
    ELSE
      RAISE NOTICE 'public.% does not exist - skipped', target;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Review queries (read-only).
-- ---------------------------------------------------------------------------

-- Everything that changed in the last day, newest first:
--   SELECT changed_at, table_name, operation, row_id, source_ip, old_row
--     FROM public.data_change_history
--    WHERE changed_at > now() - interval '1 day'
--    ORDER BY changed_at DESC;

-- Deletions that no one in the office remembers making:
--   SELECT changed_at, table_name, row_id, source_ip
--     FROM public.data_change_history
--    WHERE operation = 'DELETE' AND changed_at > now() - interval '7 days'
--    ORDER BY changed_at DESC;

-- Recover one deleted invoice:
--   SELECT old_row FROM public.data_change_history
--    WHERE table_name = 'invoices' AND row_id = '<invoice-id>' AND operation = 'DELETE'
--    ORDER BY changed_at DESC LIMIT 1;

-- How many rows moved per day, per table (a healthy day is your own edits):
--   SELECT table_name, operation, changed_at::date AS day, count(*)
--     FROM public.data_change_history
--    WHERE changed_at > now() - interval '14 days'
--    GROUP BY 1, 2, 3 ORDER BY day DESC, 1;