-- Aggregate view for activity registration counts.
-- Idempotent. Run AFTER core-schema.sql / core-rls.sql.
--
-- Replaces the N+1 pattern (one HEAD count query per activity) with a
-- single query against this view that returns counts for ALL activities
-- at once.
--
-- Deliberately an owner-rights view (bypasses registrations' row-level
-- security): RLS restricts registrations so volunteers only see their own
-- rows, but a "how many people are registered for this activity" count
-- needs to aggregate across ALL volunteers. The view only exposes an
-- activity_id + a count — no personal data — so this does not leak
-- anything the RLS on registrations is meant to protect.

create or replace view public.activity_registration_counts as
select
  activity_id,
  count(*)::int as registered_count
from public.registrations
where status in ('pending', 'approved')
group by activity_id;

grant select on public.activity_registration_counts to anon, authenticated;
