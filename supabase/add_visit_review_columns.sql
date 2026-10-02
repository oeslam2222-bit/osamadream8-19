-- Visit review workflow fields. Safe to run more than once.
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS reviewed_by_name text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visits_review_status_check'
      AND conrelid = 'public.visits'::regclass
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_review_status_check
      CHECK (review_status IS NULL OR review_status IN ('pending', 'approved', 'needs_fix'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS visits_review_status_idx
  ON public.visits (review_status);