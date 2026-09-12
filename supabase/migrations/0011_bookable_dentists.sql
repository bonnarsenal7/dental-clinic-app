-- Lets any active staff member see which dentists can be booked or assigned.
--
-- Found by booking an appointment as a real receptionist rather than with
-- the service-role key: `staff` allows a non-admin to read only their own
-- row (0002_rls.sql), so listDentists() returned nothing for reception. The
-- Dentist dropdown offered only "unassigned", which means the people who do
-- most of the booking could not attach a booking to anyone — and the
-- double-booking constraint never engaged either, because it excludes rows
-- with a null dentist.
--
-- A function rather than a policy, deliberately. RLS is row-level: a policy
-- letting reception read those rows would also hand them colleagues' email
-- addresses, which is more than the job needs. This returns two columns and
-- nothing else.
--
-- SECURITY DEFINER, so it can read `staff` past the caller's own policies —
-- and it therefore has to do its own authorization. `current_staff_role()`
-- returns null for anyone who is not an active staff member, so an
-- anonymous or deactivated caller gets an empty set rather than the clinic's
-- roster.

create or replace function public.bookable_dentists()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.name
  from public.staff s
  where public.current_staff_role() is not null
    and s.active
    and s.role in ('dentist', 'admin')
  order by s.name;
$$;

comment on function public.bookable_dentists() is
  'Active dentists and admins, id and name only. SECURITY DEFINER because staff is readable only to its owner and admins; returns nothing unless the caller is active staff.';

-- PUBLIC would let the anon role call it. The body denies anonymous callers
-- anyway, but the grant should not be wider than the intent.
revoke all on function public.bookable_dentists() from public;
grant execute on function public.bookable_dentists() to authenticated;
