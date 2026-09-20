-- Dentist roster: who is in the clinic, and for which part of which day.
--
-- The clinic asked for a calendar an admin taps a date on, assigning the
-- dentists who will be in that day and the hours they cover; reception reads
-- the current week from their dashboard, and a dentist reads their own.
--
-- **It is a record of cover, not a rule about bookings.** Nothing in
-- scheduling consults it: an appointment can still be booked with any
-- dentist at any time, exactly as before (the clinic's choice). A walk-in,
-- a last-minute swap and a dentist covering a colleague all have to remain
-- possible, and a roster that refused them would be worked around within a
-- week. If that ever changes it belongs in a migration of its own, as a
-- warning on the booking form before anything is refused outright.
--
-- Who may do what:
--   admin          add, edit and remove — the whole module is theirs
--   receptionist   read
--   dentist        read
--
-- Reads are open to all active staff because the roster is the answer to
-- "who is in today", which is everybody's question. A dentist's dashboard
-- narrows to their own sessions on screen, the same presentation scope that
-- narrows their patient list — not a boundary in the database.

create extension if not exists btree_gist;

create table dentist_shifts (
  id uuid primary key default gen_random_uuid(),
  dentist_id uuid not null references staff (id),
  shift_date date not null,
  starts_at time not null,
  ends_at time not null,
  -- "Half day", "emergency cover only" — what the hours alone don't say.
  note text,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),

  -- The session as a range, so the exclusion constraint below has something
  -- to compare. Generated rather than maintained by a trigger (which is what
  -- appointments.ends_at needs): `date + time` yields a plain timestamp and
  -- is IMMUTABLE, where `timestamptz + interval` is only STABLE because it
  -- depends on the session time zone. No zone is involved here at all — a
  -- shift is a wall-clock time on a calendar date, which is how a rota is
  -- read off a wall.
  during tsrange generated always as (
    tsrange(shift_date + starts_at, shift_date + ends_at, '[)')
  ) stored,

  constraint dentist_shifts_time_order check (ends_at > starts_at)
);

-- One dentist cannot be rostered twice over the same minutes. Two dentists
-- overlapping is the ordinary case — that is what a clinic with two chairs
-- looks like — so the constraint is per dentist, not per clinic.
alter table dentist_shifts
  add constraint dentist_shifts_no_overlap
  exclude using gist (dentist_id with =, during with &&);

create index dentist_shifts_date_idx on dentist_shifts (shift_date);
create index dentist_shifts_dentist_idx on dentist_shifts (dentist_id, shift_date);

comment on table dentist_shifts is
  'Which dentist covers which hours on which day. Read by everyone, written by an admin. Does not constrain booking.';

-- --- the guard ---------------------------------------------------------------
--
-- The database decides who recorded a shift and when, the same shape as
-- 0020's daily_entries_guard, and it refuses a shift for somebody who does
-- not treat patients. SECURITY DEFINER so the staff check does not depend on
-- the caller's own policies on `staff`.
create or replace function public.dentist_shifts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    if new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'A shift stays with the person who recorded it.'
        using errcode = 'check_violation';
    end if;
  end if;

  if not exists (
    select 1 from public.staff
    where id = new.dentist_id and active and role in ('dentist', 'admin')
  ) then
    raise exception 'Only an active dentist can be put on the roster.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger dentist_shifts_guard
  before insert or update on dentist_shifts
  for each row execute function public.dentist_shifts_guard();

-- --- who may do what ---------------------------------------------------------

alter table dentist_shifts enable row level security;

create policy "staff read the roster" on dentist_shifts for select
  using (current_staff_role() is not null);

create policy "admin builds the roster" on dentist_shifts for insert
  with check (current_staff_role() = 'admin');
create policy "admin edits the roster" on dentist_shifts for update
  using (current_staff_role() = 'admin')
  with check (current_staff_role() = 'admin');
create policy "admin clears the roster" on dentist_shifts for delete
  using (current_staff_role() = 'admin');

-- --- reading it, with names --------------------------------------------------
--
-- Reception and dentists can read dentist_shifts but not `staff` (0002 — own
-- row only), so a direct select gives them ids and no names. Same problem and
-- same answer as bookable_dentists() (0011): a SECURITY DEFINER function that
-- returns the name and nothing else, rather than a policy that would hand
-- over colleagues' email addresses along with it.
--
-- It joins `staff` rather than calling bookable_dentists(), so a dentist who
-- has since been deactivated still resolves by name on last month's roster.
create or replace function public.roster_for_range(p_from date, p_to date)
returns table (
  id uuid,
  dentist_id uuid,
  dentist_name text,
  shift_date date,
  starts_at time,
  ends_at time,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select sh.id, sh.dentist_id, s.name, sh.shift_date, sh.starts_at, sh.ends_at, sh.note
  from public.dentist_shifts sh
  join public.staff s on s.id = sh.dentist_id
  where public.current_staff_role() is not null
    and sh.shift_date between p_from and p_to
  order by sh.shift_date, sh.starts_at, s.name;
$$;

comment on function public.roster_for_range(date, date) is
  'The roster between two dates, with dentist names. SECURITY DEFINER because staff is readable only to its owner and admins; returns nothing unless the caller is active staff.';

revoke all on function public.roster_for_range(date, date) from public;
grant execute on function public.roster_for_range(date, date) to authenticated;

-- --- audit -------------------------------------------------------------------
-- Staffing is who was in the building, which is exactly the question an
-- audit answers later. 0006's trigger records every add, edit and removal,
-- including ones made from the SQL editor.
create trigger audit_dentist_shifts
  after insert or update or delete on dentist_shifts
  for each row execute function public.audit_row_change();
