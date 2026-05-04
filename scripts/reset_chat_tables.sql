-- Local/dev: clear chat tables only. Do not run against production without care.
-- Run in Supabase SQL editor or: psql < scripts/reset_chat_tables.sql
-- Preserves: users, visitors, identities, sessions

truncate table public.messages restart identity cascade;
truncate table public.participants restart identity cascade;
truncate table public.rooms restart identity cascade;
