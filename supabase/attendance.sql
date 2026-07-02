-- Attendance / service-hours migration on public.registrations.
-- Idempotent. Run AFTER core-schema.sql.
-- Mirrors AttendanceStatus + Registration in src/lib/types/database.ts.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'attendance_status') then
    create type public.attendance_status as enum ('present', 'absent', 'no_show');
  end if;
end
$$;

alter table public.registrations
  add column if not exists attendance public.attendance_status,
  add column if not exists checked_in_at timestamp with time zone,
  add column if not exists hours numeric(5, 2);

-- Hours must be non-negative when present.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'registrations_hours_non_negative'
      and conrelid = 'public.registrations'::regclass
  ) then
    alter table public.registrations
      add constraint registrations_hours_non_negative
      check (hours is null or hours >= 0);
  end if;
end
$$;

create index if not exists registrations_attendance_idx
  on public.registrations (attendance);
