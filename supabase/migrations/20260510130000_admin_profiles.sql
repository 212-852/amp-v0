create table if not exists public.admin_profiles (
  user_uuid uuid primary key references public.users(user_uuid) on delete cascade,
  real_name text,
  birth_date date,
  work_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_profiles_work_name_idx
  on public.admin_profiles (work_name);
