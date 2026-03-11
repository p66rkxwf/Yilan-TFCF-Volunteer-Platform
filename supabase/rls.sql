-- Favorites RLS policies.
-- Run after schema.sql.

grant usage on schema public to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
revoke all on table public.favorites from anon;

alter table public.favorites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'favorites_select_own'
  ) then
    create policy favorites_select_own
      on public.favorites
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Admins can manage all profiles'
  ) then
    create policy "Admins can manage all profiles"
      on public.profiles
      for all
      to authenticated
      using (public.is_admin_profile(auth.uid()))
      with check (public.is_admin_profile(auth.uid()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'favorites_insert_own'
  ) then
    create policy favorites_insert_own
      on public.favorites
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'favorites'
      and policyname = 'favorites_delete_own'
  ) then
    create policy favorites_delete_own
      on public.favorites
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;
