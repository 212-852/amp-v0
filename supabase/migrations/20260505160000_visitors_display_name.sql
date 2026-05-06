-- Denormalized display label for LINE/Messaging-linked visitors (optional; session UI uses users.display_name).
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS display_name text;
