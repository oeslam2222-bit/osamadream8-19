-- Returns (مرتجع) recorded by the sales rep during a visit.
-- The supervisor sees the visit as an alert until it is handed to the
-- warehouse keeper, so the flag and the handover state must persist.
-- Run once in the Supabase SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'is_return'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN is_return boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_value'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_value numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_reason'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_difficulty'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_difficulty text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_status'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_status text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_handled_by'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_handled_by text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_handled_at'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_handled_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'visits' AND column_name = 'return_note'
  ) THEN
    ALTER TABLE public.visits ADD COLUMN return_note text;
  END IF;

  -- Realtime: the supervisor must see the alert without pressing anything.
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.visits';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;
