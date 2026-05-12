create table if not exists public.admin_profiles (
  user_uuid uuid primary key references public.users(user_uuid) on delete cascade,
  real_name text,
  birth_date date,
  internal_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_uuid uuid null references public.users(user_uuid) on delete set null
);

create index if not exists admin_profiles_internal_name_idx
  on public.admin_profiles (internal_name);
