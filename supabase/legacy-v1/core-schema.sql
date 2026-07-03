-- Core schema migration: enums + profiles / activities / registrations.
-- Idempotent. Run this FIRST, before schema.sql (favorites).
-- Mirrors the type definitions in src/lib/types/database.ts.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'system_admin', 'unit_admin', 'internal_staff', 'volunteer', 'guest'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'blacklisted');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'registration_status') then
    create type public.registration_status as enum (
      'pending', 'approved', 'rejected', 'cancelled'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'staff_position') then
    create type public.staff_position as enum ('social_worker', 'general_staff');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'yilan_region') then
    create type public.yilan_region as enum (
      '宜蘭市', '羅東鎮', '蘇澳鎮', '頭城鎮', '礁溪鄉', '壯圍鄉',
      '員山鄉', '冬山鄉', '五結鄉', '三星鄉', '大同鄉', '南澳鄉'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account text not null,
  full_name text not null,
  email text not null,
  birthday date,
  region public.yilan_region,
  assigned_worker_id uuid references public.profiles (id) on delete set null,
  role public.user_role not null default 'volunteer',
  status public.account_status not null default 'active',
  position public.staff_position,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create unique index if not exists profiles_account_key
  on public.profiles (account);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_assigned_worker_idx
  on public.profiles (assigned_worker_id);

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  publisher_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  content text not null,
  activity_date date not null,
  activity_time text not null,
  location text not null,
  capacity integer not null check (capacity >= 0),
  manager_name text not null,
  cancel_deadline date,
  is_cancelled boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists activities_activity_date_idx
  on public.activities (activity_date);
create index if not exists activities_is_cancelled_idx
  on public.activities (is_cancelled);

-- ---------------------------------------------------------------------------
-- registrations
-- ---------------------------------------------------------------------------
create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  volunteer_id uuid not null references auth.users (id) on delete cascade,
  status public.registration_status not null default 'pending',
  created_at timestamp with time zone not null default now()
);

create index if not exists registrations_activity_id_idx
  on public.registrations (activity_id);
create index if not exists registrations_volunteer_id_idx
  on public.registrations (volunteer_id);
create index if not exists registrations_status_idx
  on public.registrations (status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance for profiles
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- Reads metadata supplied by auth.signUp() in src/app/actions/auth.ts:
--   account, full_name, birthday, region, assigned_worker_id
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, account, full_name, email, birthday, region, assigned_worker_id)
  values (
    new.id,
    coalesce(nullif(meta ->> 'account', ''), new.email),
    coalesce(nullif(meta ->> 'full_name', ''), ''),
    new.email,
    nullif(meta ->> 'birthday', '')::date,
    nullif(meta ->> 'region', '')::public.yilan_region,
    nullif(meta ->> 'assigned_worker_id', '')::uuid
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
