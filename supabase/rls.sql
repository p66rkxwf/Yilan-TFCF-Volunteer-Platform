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
