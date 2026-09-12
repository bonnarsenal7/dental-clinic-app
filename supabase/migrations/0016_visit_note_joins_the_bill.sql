-- The visit note becomes part of the bill: written chairside, locked when
-- treatment finishes, and readable by whoever takes the payment.
--
-- **This reverses a boundary the schema was built around, deliberately and
-- at the clinic's instruction.** `visit_notes` is a separate table for one
-- reason: reception needs `visits` (who, when) and must not have the
-- dentist's write-up, and row-level security cannot hide one column of a row
-- a role can otherwise select. Splitting the text out was how "not even
-- read" was made true rather than merely hidden.
--
-- Two things follow, and neither is optional:
--
--  1. **CONSENT_TEXT must change.** The privacy notice patients sign says
--     reception "can see your contact and billing details but not the
--     dentist's clinical notes or your tooth chart". That sentence is now
--     false. It is in a document signed under RA 10173 and already waiting
--     on legal review (docs/TECHNICAL_REVIEW.md F-2) — this widens what that
--     review has to cover rather than narrowing it.
--  2. **Tooth charts stay private.** Only the note moves. Reception still
--     has no policy at all on `tooth_records`, so the other half of that
--     sentence remains true.
--
-- The note is now billing-shaped rather than purely clinical, so it follows
-- the billing lock: editable by the dentist while the visit is open, frozen
-- for everyone but an admin once treatment is finished.

-- --- when is a visit still open? -----------------------------------------
--
-- "In the chair" expressed as a fact about the data rather than a status to
-- look up, because a visit can exist without an appointment (the chart can
-- start one) and the note has to stay writable in that case too.
--
-- Open means: nothing has locked it. A draft invoice has not locked it — a
-- draft *is* the open state. A void invoice does not lock it either; voiding
-- is an admin correction and the admin can write regardless.
create or replace function public.visit_is_open(p_visit uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.invoices
      where visit_id = p_visit and status not in ('draft', 'void')
    )
    and not exists (
      select 1 from public.appointments
      where visit_id = p_visit and status in ('pending_payment', 'completed')
    );
$$;

comment on function public.visit_is_open(uuid) is
  'True while a visit can still be billed and noted — no invoice has left draft and no appointment for it has been finished. SECURITY DEFINER so the check does not depend on the caller being able to read invoices or appointments.';

revoke all on function public.visit_is_open(uuid) from public;
grant execute on function public.visit_is_open(uuid) to authenticated;

-- --- reception may read the note -----------------------------------------
--
-- Read only, and nothing else changes for them: no insert, no update, no
-- delete. They see what was done in order to take payment for it.
create policy "reception reads visit notes" on visit_notes for select
  using (current_staff_role() = 'receptionist');

-- --- the dentist writes it while the visit is open -----------------------

drop policy "clinical rw insert visit_notes" on visit_notes;
drop policy "clinical rw update visit_notes" on visit_notes;

create policy "dentist writes note while open" on visit_notes for insert
  with check (
    current_staff_role() = 'admin'
    or (current_staff_role() = 'dentist' and public.visit_is_open(visit_id))
  );

create policy "dentist edits note while open" on visit_notes for update
  using (
    current_staff_role() = 'admin'
    or (current_staff_role() = 'dentist' and public.visit_is_open(visit_id))
  )
  with check (current_staff_role() in ('dentist', 'admin'));

-- SELECT for dentist/admin and DELETE for admin are unchanged from 0002.
