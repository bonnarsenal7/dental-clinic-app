-- Bookings are reception's. A dentist reads the diary and cannot write to it.
--
-- Who does what to an appointment:
--
--   receptionist  books, reschedules, cancels, seats, accepts payment
--   dentist       reads everything; the only write is finishing treatment
--   admin         everything, and the audit triggers record it
--
-- **The dentist keeps one update, deliberately.** 0013 made finishing
-- treatment theirs — it locks the invoice and hands the patient to the front
-- desk — and that write lands on `appointments.status`. Taking UPDATE away
-- entirely would break it. "Cannot edit a booking" is about who, when and
-- with whom; advancing the day's status is not editing a booking. So the
-- policy still permits the row, and the trigger below permits exactly one
-- move and no other field.
--
-- Seating moves to reception for the same reason: the seating dialog asks
-- who is treating the patient and writes `dentist_id`, which is booking
-- management however it is spelled.
--
-- Recalls are untouched. "This patient should come back in six months" is a
-- clinical judgement and stays open to the dentist; turning one into a
-- booking is reception's, and that goes through `appointments` like any
-- other booking.

drop policy "front desk rw insert appointments" on appointments;

create policy "reception books appointments" on appointments for insert
  with check (current_staff_role() in ('receptionist', 'admin'));

-- SELECT is unchanged: a dentist must see the whole diary, including
-- appointments that are not theirs, or they cannot tell who is waiting.
-- UPDATE stays open at the policy level and is narrowed by the trigger,
-- because a policy cannot see the old and new row at once and this rule
-- needs both. DELETE was already admin-only.

create or replace function public.appointments_guard_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text := public.current_staff_role();
begin
  -- Admin overrides everything, at any stage, to fix mistakes. Every such
  -- change is written to audit_log by the trigger from 0006.
  if actor = 'admin' then
    return new;
  end if;

  if actor = 'dentist' then
    -- The one write a dentist makes. Anything else — a different move, or
    -- the same move carrying a changed booking field — is refused.
    if not (old.status = 'in_chair' and new.status = 'pending_payment') then
      raise exception 'Bookings are managed by reception. A dentist can finish treatment, nothing else.'
        using errcode = 'check_violation';
    end if;

    if (
      new.patient_id, new.dentist_id, new.scheduled_at, new.duration_minutes,
      new.reason, new.procedure_id, new.reception_notes, new.visit_id
    ) is distinct from (
      old.patient_id, old.dentist_id, old.scheduled_at, old.duration_minutes,
      old.reason, old.procedure_id, old.reception_notes, old.visit_id
    ) then
      raise exception 'A dentist can finish treatment but cannot change the booking itself.'
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- Reception, from here down. Editing a booking without moving it along
  -- the day — a new time, a different dentist, a note — is theirs.
  if new.status = old.status then
    return new;
  end if;

  -- Finishing treatment is a clinical judgement and it locks the figures.
  if old.status = 'in_chair' and new.status = 'pending_payment' then
    raise exception 'Only the dentist can finish treatment.'
      using errcode = 'check_violation';
  end if;

  -- Taking the money and checking the patient out is the front desk's.
  if old.status = 'pending_payment' and new.status = 'completed' then
    return new;
  end if;

  -- An invoice is waiting to be paid. Anything other than paying it is a
  -- correction, and corrections are an admin's.
  if old.status = 'pending_payment' then
    raise exception 'This appointment is waiting on payment. An admin can correct it.'
      using errcode = 'check_violation';
  end if;

  -- Finished and paid. A further procedure is a new booking with its own
  -- invoice, not a reopening of this one.
  if old.status = 'completed' then
    raise exception 'This appointment is finished. Book the extra procedure separately.'
      using errcode = 'check_violation';
  end if;

  -- Everything earlier in the day — confirming, arriving, seating,
  -- cancelling — is reception's to do.
  return new;
end;
$$;

-- Widened from `before update of status`: a dentist changing only the time
-- of a booking never touched the status column, so the old trigger did not
-- fire at all and the change went through.
drop trigger if exists appointments_guard_transition on appointments;
create trigger appointments_guard_transition
  before update on appointments
  for each row execute function public.appointments_guard_transition();
