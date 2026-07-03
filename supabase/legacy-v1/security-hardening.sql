-- Security hardening: server-side guards against self-escalation and
-- registration tampering (security audit findings 1, 2, 7).
-- Idempotent. Run AFTER registration-counts.sql (last in current README order).

-- ---------------------------------------------------------------------------
-- 1) profiles: block self-service changes to role / status / assigned_worker_id
--    (Finding 1). Admins (is_admin_profile) and service-role callers are
--    exempt, so the existing "Admins can manage all profiles" RLS policy
--    keeps working unchanged, including the admin-users.ts server actions
--    (Finding 4) which write via the service-role client.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) = 'service_role'
     or public.is_admin_profile(auth.uid()) then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'permission denied: cannot change role';
  end if;

  if new.status is distinct from old.status then
    raise exception 'permission denied: cannot change status';
  end if;

  if new.assigned_worker_id is distinct from old.assigned_worker_id then
    raise exception 'permission denied: cannot change assigned_worker_id';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
before update on public.profiles
for each row
execute function public.profiles_guard_protected_columns();

-- ---------------------------------------------------------------------------
-- 2) registrations: block self-service approval / attendance / hours
--    fabrication (Finding 2), while explicitly allowing the legitimate
--    self-cancel transition used by cancelRegistration(). Admins and
--    service-role callers exempt.
-- ---------------------------------------------------------------------------
create or replace function public.registrations_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) = 'service_role'
     or public.is_admin_profile(auth.uid()) then
    return new;
  end if;

  -- Allow exactly one non-admin self-service transition: cancelling own
  -- pending/approved registration. Everything else touching status/
  -- attendance/hours/checked_in_at is rejected for non-admins.
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.status in ('pending', 'approved') then
      null; -- allowed transition; fall through to the other column checks
    else
      raise exception 'permission denied: cannot change status';
    end if;
  end if;

  if new.attendance is distinct from old.attendance then
    raise exception 'permission denied: cannot change attendance';
  end if;

  if new.hours is distinct from old.hours then
    raise exception 'permission denied: cannot change hours';
  end if;

  if new.checked_in_at is distinct from old.checked_in_at then
    raise exception 'permission denied: cannot change checked_in_at';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_guard_protected_columns on public.registrations;
create trigger registrations_guard_protected_columns
before update on public.registrations
for each row
execute function public.registrations_guard_protected_columns();

-- ---------------------------------------------------------------------------
-- 3) registrations: defense-in-depth capacity / cancellation guard on INSERT
--    (Finding 7). Mirrors the application-level check in
--    registerForActivity() (src/lib/actions/registrations.ts) so a bypass of
--    the Server Action (e.g. a stray direct client insert) cannot exceed
--    capacity or register into a cancelled activity. Admins/service-role
--    exempt so future admin-side manual registration flows are not blocked.
-- ---------------------------------------------------------------------------
create or replace function public.registrations_guard_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_is_cancelled boolean;
  v_current_count integer;
begin
  if (select auth.role()) = 'service_role'
     or public.is_admin_profile(auth.uid()) then
    return new;
  end if;

  select capacity, is_cancelled
    into v_capacity, v_is_cancelled
    from public.activities
    where id = new.activity_id;

  if not found then
    raise exception 'activity not found';
  end if;

  if v_is_cancelled then
    raise exception 'permission denied: activity is cancelled';
  end if;

  select count(*)
    into v_current_count
    from public.registrations
    where activity_id = new.activity_id
      and status in ('pending', 'approved');

  if v_current_count >= v_capacity then
    raise exception 'permission denied: activity is full';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_guard_capacity on public.registrations;
create trigger registrations_guard_capacity
before insert on public.registrations
for each row
execute function public.registrations_guard_capacity();
