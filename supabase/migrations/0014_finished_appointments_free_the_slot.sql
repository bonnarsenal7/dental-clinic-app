-- A finished appointment stops holding the dentist's chair.
--
-- Reported from the clinic: seating a patient and choosing a dentist failed
-- with "That dentist is already with another patient at this time" when the
-- dentist was plainly free. The message was false, and so was the check
-- behind it.
--
-- The constraint excluded only cancelled and no-show appointments, so every
-- *completed* one went on reserving its slot for ever. Any dentist who had
-- already finished a 09:00 appointment could never be assigned to another
-- 09:00 again — and because a clinic's slots repeat, the day fills up with
-- phantom conflicts as it goes on. In the reported case four dentists each
-- had a completed 09:00, so every choice in the dropdown was refused.
--
-- What the constraint is actually for is stopping a dentist being committed
-- to two patients at once. Commitment ends when treatment does:
--
--   booked / confirmed / arrived   still owed to the patient  -> blocks
--   in_chair                       happening right now        -> blocks
--   pending_payment                treatment over, at the desk -> frees
--   completed                      done                        -> frees
--   cancelled / no_show            never happened              -> frees
--
-- `pending_payment` frees the chair for the same reason `completed` does:
-- the dentist has finished and the patient is at the counter. Holding the
-- slot until the bill is settled would make the front desk's speed a
-- constraint on the dentist's diary.
--
-- Narrowing a constraint can only make existing rows easier to satisfy, so
-- this validates against the current data without a rewrite.

alter table appointments drop constraint appointments_no_double_booking;

alter table appointments
  add constraint appointments_no_double_booking
  exclude using gist (
    dentist_id with =,
    tstzrange(scheduled_at, ends_at) with &&
  ) where (
    status not in ('cancelled', 'no_show', 'completed', 'pending_payment')
    and dentist_id is not null
  );

comment on constraint appointments_no_double_booking on appointments is
  'A dentist cannot be committed to two patients at once. Only appointments still owed or in progress reserve the slot — finished, unpaid, cancelled and no-show ones free it, because the dentist is no longer in them.';
