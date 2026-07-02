-- Notifications schema + RLS.
-- Idempotent. Run AFTER core-schema.sql / core-rls.sql.
-- Rows are written server-side via the service role (see
-- src/lib/actions/notifications.ts); authenticated users may only read and
-- mark their own notifications as read.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists notifications_user_id_idx
  on public.notifications (user_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read_at);

-- ---------------------------------------------------------------------------
-- RLS: own read + own update (mark as read). Inserts go through service role.
-- ---------------------------------------------------------------------------
grant select, update on table public.notifications to authenticated;
revoke all on table public.notifications from anon;

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    create policy notifications_select_own
      on public.notifications for select to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    create policy notifications_update_own
      on public.notifications for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
