-- Add public.profiles.last_login_at and keep it synced from auth.users.last_sign_in_at.

alter table public.profiles
  add column if not exists last_login_at timestamp with time zone;

create or replace function public.sync_profile_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_login_at = new.last_sign_in_at
  where id = new.id
    and new.last_sign_in_at is not null
    and (last_login_at is distinct from new.last_sign_in_at);

  return new;
end;
$$;

drop trigger if exists zz_on_auth_user_created_sync_last_login on auth.users;
create trigger zz_on_auth_user_created_sync_last_login
after insert on auth.users
for each row
execute function public.sync_profile_last_login();

drop trigger if exists on_auth_user_last_sign_in_updated on auth.users;
create trigger on_auth_user_last_sign_in_updated
after update of last_sign_in_at on auth.users
for each row
when (new.last_sign_in_at is distinct from old.last_sign_in_at)
execute function public.sync_profile_last_login();

update public.profiles as p
set last_login_at = u.last_sign_in_at
from auth.users as u
where p.id = u.id
  and u.last_sign_in_at is not null
  and (p.last_login_at is distinct from u.last_sign_in_at);
