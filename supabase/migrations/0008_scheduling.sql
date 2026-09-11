-- Phase 8 groundwork: appointments, the day queue, and recalls.
--
-- Until now `visits` recorded what had already happened. A clinic runs on
-- the opposite: what is *going* to happen. This adds the appointment book,
-- and with it the two things that hang off one — the queue of who is in the
-- clinic right now, and the recall list of who is overdue to come back.
--
-- The queue is deliberately NOT a table. It is today's appointments with a
-- status of arrived or in_chair; storing it separately would create a
-- second source of truth for where a patient is.

create extension if not exists btree_gist;

create type appointment_status as enum (
  'booked',     -- in the book, patient not yet confirmed
  'confirmed',  -- patient acknowledged (the reminder backlog item hangs here)
  'arrived',    -- checked in at the front desk — in the queue
  'in_chair',   -- being treated; a visit row exists from this point
  'completed',  -- treatment finished
  'cancelled',  -- called off in advance
  'no_show'     -- did not arrive
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  dentist_id uuid references staff (id),
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  -- Maintained by a trigger from scheduled_at + duration_minutes. It exists
  -- as a stored column because the double-booking constraint below needs an
  -- immutable expression, and `timestamptz + interval` is only STABLE (it
  -- depends on the session time zone), so a generated column is rejected.
  ends_at timestamptz not null,
  reason text,
  procedure_id uuid references procedures (id),
  status appointment_status not null default 'booked',
  arrived_at timestamptz,
  seated_at timestamptz,
  completed_at timestamptz,
  -- Set when the appointment is seated: the visit the clinical work belongs
  -- to, so charting and billing flow from the booking with no re-entry.
  visit_id uuid references visits (id) on delete set null,
  -- ADMINISTRATIVE only — "patient asked for a late slot", "bring HMO card".
  -- Reception can read and write this. Anything clinical belongs in
  -- visit_notes, which reception cannot see at all (0002_rls.sql).
  reception_notes text,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index appointments_scheduled_at_idx on appointments (scheduled_at);
create index appointments_patient_id_idx on appointments (patient_id, scheduled_at desc);
create index appointments_status_idx on appointments (status, scheduled_at);

create or replace function public.appointments_set_ends_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ends_at := new.scheduled_at + make_interval(mins => new.duration_minutes);
  new.updated_at := now();
  return new;
end;
$$;

create trigger appointments_ends_at
  before insert or update of scheduled_at, duration_minutes on appointments
  for each row execute function public.appointments_set_ends_at();

-- A dentist cannot be in two places at once, and a double-booked chair is
-- the classic front-desk failure. Enforced in the database rather than the
-- UI, because the UI is not the only thing that will ever write here.
-- Cancelled and no-show appointments are excluded: they free the slot.
alter table appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    dentist_id with =,
    tstzrange(scheduled_at, ends_at) with &&
  ) where (status not in ('cancelled', 'no_show') and dentist_id is not null);

-- --- Recalls -------------------------------------------------------------
--
-- Its own table rather than a column on patients, because a patient can owe
-- more than one return at a time: a six-month cleaning and, separately, the
-- second half of a root canal.

create table recalls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  due_on date not null,
  reason text not null,
  -- How far ahead the next one is set when this is completed. Null means a
  -- one-off (finish this root canal), not a repeating hygiene recall.
  interval_months integer check (interval_months is null or interval_months between 1 and 60),
  status text not null default 'due' check (status in ('due', 'scheduled', 'completed', 'dismissed')),
  appointment_id uuid references appointments (id) on delete set null,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index recalls_due_idx on recalls (status, due_on);
create index recalls_patient_id_idx on recalls (patient_id, due_on desc);

-- --- RLS -----------------------------------------------------------------
--
-- Both are front-desk data: reception runs the book and the queue, so all
-- three roles read and write, and only admin deletes. This is the same tier
-- as patients and invoices. Note that reception_notes being reception-
-- readable is the whole reason it is separate from visit_notes.

alter table appointments enable row level security;
alter table recalls enable row level security;

create policy "front desk rw select appointments" on appointments for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert appointments" on appointments for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update appointments" on appointments for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete appointments" on appointments for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select recalls" on recalls for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert recalls" on recalls for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update recalls" on recalls for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete recalls" on recalls for delete
  using (current_staff_role() = 'admin');

-- Both tables join the audit log on the same terms as everything else
-- holding patient data (0006_audit.sql).
create trigger audit_appointments
  after insert or update or delete on appointments
  for each row execute function public.audit_row_change();

create trigger audit_recalls
  after insert or update or delete on recalls
  for each row execute function public.audit_row_change();
