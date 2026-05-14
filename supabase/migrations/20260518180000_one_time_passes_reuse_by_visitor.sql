-- One row per (visitor_uuid, purpose): reuse row, regenerate code each open.

ALTER TABLE public.one_time_passes
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz NULL;

ALTER TABLE public.one_time_passes
  DROP CONSTRAINT IF EXISTS one_time_passes_status_check;

ALTER TABLE public.one_time_passes
  ADD CONSTRAINT one_time_passes_status_check CHECK (
    status IN ('pending', 'open', 'completed', 'expired', 'failed', 'closed')
  );

UPDATE public.one_time_passes
SET
  status = 'open',
  is_open = true,
  opened_at = COALESCE(opened_at, created_at),
  updated_at = now()
WHERE status = 'pending';

ALTER TABLE public.one_time_passes
  DROP CONSTRAINT IF EXISTS one_time_passes_status_check;

ALTER TABLE public.one_time_passes
  ADD CONSTRAINT one_time_passes_status_check CHECK (
    status IN ('open', 'completed', 'expired', 'failed', 'closed')
  );

DELETE FROM public.one_time_passes o
WHERE o.pass_uuid IN (
  SELECT pass_uuid
  FROM (
    SELECT
      pass_uuid,
      ROW_NUMBER() OVER (
        PARTITION BY visitor_uuid, purpose
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM public.one_time_passes
  ) ranked
  WHERE ranked.rn > 1
);

DELETE FROM public.one_time_passes WHERE visitor_uuid IS NULL;

ALTER TABLE public.one_time_passes
  ALTER COLUMN visitor_uuid SET NOT NULL;

ALTER TABLE public.one_time_passes
  DROP COLUMN IF EXISTS user_uuid,
  DROP COLUMN IF EXISTS source_channel,
  DROP COLUMN IF EXISTS return_path,
  DROP COLUMN IF EXISTS meta_json;

DROP INDEX IF EXISTS public.one_time_passes_pending_poll_idx;

CREATE UNIQUE INDEX IF NOT EXISTS one_time_passes_visitor_purpose_uidx
  ON public.one_time_passes (visitor_uuid, purpose);

CREATE INDEX IF NOT EXISTS one_time_passes_open_poll_idx
  ON public.one_time_passes (visitor_uuid, purpose, status, expires_at)
  WHERE status = 'open' AND is_open IS TRUE;

CREATE INDEX IF NOT EXISTS one_time_passes_code_lookup_idx
  ON public.one_time_passes (code)
  WHERE code IS NOT NULL;
