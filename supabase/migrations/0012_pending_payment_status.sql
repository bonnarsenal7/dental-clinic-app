-- Adds the state between "the dentist has finished" and "the patient has
-- paid and gone".
--
-- Until now `completed` meant both, which left the front desk no way to see
-- who is still standing at the counter owing money. The lifecycle becomes:
--
--   in_chair  --(dentist finishes treatment)-->  pending_payment
--   pending_payment  --(reception accepts payment)-->  completed
--
-- **This migration does nothing but add the value.** Postgres will not let a
-- new enum value be *used* in the same transaction that adds it, and every
-- migration runs in one — so the policies, the trigger and the transition
-- rules that reference 'pending_payment' live in 0013. Merging the two
-- fails with "unsafe use of new value of enum type".

alter type appointment_status add value if not exists 'pending_payment' after 'in_chair';
