-- Optional dedicated columns for customer primary location lock & visit geo-verification.
-- Safe to run multiple times (idempotent). The app also persists compact metadata
-- cleanly inside existing `notes` fields until this migration is applied.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_address text,
  ADD COLUMN IF NOT EXISTS location_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_captured_by text,
  ADD COLUMN IF NOT EXISTS location_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_approved_by text,
  ADD COLUMN IF NOT EXISTS location_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_photo_url text;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_accuracy numeric,
  ADD COLUMN IF NOT EXISTS geo_status text,
  ADD COLUMN IF NOT EXISTS geo_distance_meters numeric,
  ADD COLUMN IF NOT EXISTS geo_flags jsonb,
  ADD COLUMN IF NOT EXISTS geo_proof_photo text;

CREATE INDEX IF NOT EXISTS visits_geo_status_idx ON public.visits (geo_status);
