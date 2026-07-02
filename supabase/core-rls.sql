-- Core RLS policies for profiles / activities / registrations.
-- Idempotent. Run AFTER core-schema.sql and BEFORE rls.sql.
-- Defines the canonical public.is_admin_profile() helper reused by rls.sql.

-- ---------------------------------------------------------------------------
-- Admin helper (canonical definition; rls.sql re-creates it harmlessly)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_profile(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = any (
        array[
          'system_admin'::user_role,
          'unit_admin'::user_role,
          'internal_staff'::user_role
        ]
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, update on table public.profiles to authenticated;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles for select to authenticated
      using (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles for update to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Admins can manage all profiles'
  ) then
    create policy "Admins can manage all profiles"
      on public.profiles for all to authenticated
      using (public.is_admin_profile(auth.uid()))
      with check (public.is_admin_profile(auth.uid()));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- activities (public read; admins write)
-- ---------------------------------------------------------------------------
grant select on table public.activities to anon, authenticated;
grant insert, update, delete on table public.activities to authenticated;

alter table public.activities enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities'
      and policyname = 'activities_select_all'
  ) then
    create policy activities_select_all
      on public.activities for select to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activities'
      and policyname = 'activities_admin_write'
  ) then
    create policy activities_admin_write
      on public.activities for all to authenticated
      using (public.is_admin_profile(auth.uid()))
      with check (public.is_admin_profile(auth.uid()));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- registrations (volunteers manage their own; admins manage all)
-- ---------------------------------------------------------------------------
grant select, insert, update on table public.registrations to authenticated;
revoke all on table public.registrations from anon;

alter table public.registrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'registrations'
      and policyname = 'registrations_select_own'
  ) then
    create policy registrations_select_own
      on public.registrations for select to authenticated
      using (auth.uid() = volunteer_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'registrations'
      and policyname = 'registrations_insert_own'
  ) then
    create policy registrations_insert_own
      on public.registrations for insert to authenticated
      with check (auth.uid() = volunteer_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'registrations'
      and policyname = 'registrations_update_own'
  ) then
    create policy registrations_update_own
      on public.registrations for update to authenticated
      using (auth.uid() = volunteer_id)
      with check (auth.uid() = volunteer_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'registrations'
      and policyname = 'registrations_admin_all'
  ) then
    create policy registrations_admin_all
      on public.registrations for all to authenticated
      using (public.is_admin_profile(auth.uid()))
      with check (public.is_admin_profile(auth.uid()));
  end if;
end
$$;
