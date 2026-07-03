-- Favorites schema migration.
-- Safe to run on an existing Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  activity_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint favorites_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade,
  constraint favorites_activity_id_fkey
    foreign key (activity_id) references public.activities (id) on delete cascade
);

with ranked_favorites as (
  select
    id,
    row_number() over (
      partition by user_id, activity_id
      order by created_at asc, id asc
    ) as row_num
  from public.favorites
)
delete from public.favorites
where id in (
  select id
  from ranked_favorites
  where row_num > 1
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'favorites_user_activity_key'
      and conrelid = 'public.favorites'::regclass
  ) then
    alter table public.favorites
      add constraint favorites_user_activity_key unique (user_id, activity_id);
  end if;
end
$$;

create index if not exists favorites_user_id_idx
  on public.favorites (user_id);

create index if not exists favorites_activity_id_idx
  on public.favorites (activity_id);
