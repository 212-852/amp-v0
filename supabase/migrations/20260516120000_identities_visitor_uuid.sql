ALTER TABLE public.identities
  ADD COLUMN IF NOT EXISTS visitor_uuid uuid NULL;

CREATE INDEX IF NOT EXISTS identities_visitor_user_lookup_idx
  ON public.identities (visitor_uuid)
  WHERE visitor_uuid IS NOT NULL AND user_uuid IS NOT NULL;
