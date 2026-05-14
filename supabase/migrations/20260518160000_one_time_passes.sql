-- One-time passes bridge PWA and external browser (LINE OAuth). Not identities.

CREATE TABLE IF NOT EXISTS public.one_time_passes (
  pass_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  visitor_uuid uuid NULL,
  user_uuid uuid NULL,
  completed_user_uuid uuid NULL,
  source_channel text NULL,
  return_path text NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT one_time_passes_code_unique UNIQUE (code),
  CONSTRAINT one_time_passes_purpose_check CHECK (purpose = 'pwa_line_link'),
  CONSTRAINT one_time_passes_status_check CHECK (
    status IN ('pending', 'completed', 'expired', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS one_time_passes_pending_poll_idx
  ON public.one_time_passes (purpose, status, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS one_time_passes_visitor_idx
  ON public.one_time_passes (visitor_uuid)
  WHERE visitor_uuid IS NOT NULL;

ALTER TABLE public.one_time_passes ENABLE ROW LEVEL SECURITY;
