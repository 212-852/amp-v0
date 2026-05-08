-- Per-admin chat availability flag.
-- Drives whether this admin should receive concierge_requested notifications.
-- Row absence is treated as "available" (default true).

create table if not exists public.admin_availability (
  admin_uuid uuid primary key references public.users(user_uuid) on delete cascade,
  chat_available boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists admin_availability_chat_available_idx
  on public.admin_availability (chat_available);
