-- Chairside billing: the dentist bills what they did, while they are doing
-- it, and nobody downstream can change the figures.
--
-- The workflow this enforces:
--
--   1. Patient is seated. The dentist adds line items as treatment happens.
--      Those live on a `draft` invoice — draft because the totals trigger
--      must still work, but the invoice is not yet a bill.
--   2. The dentist finishes treatment. The invoice leaves draft and the
--      appointment becomes `pending_payment`. From that moment the dentist
--      cannot change the figures either.
--   3. Reception takes payment. The appointment becomes `completed`.
--      Reception never touches the amounts — only the payment.
--   4. A further procedure in the same visit is a **new booking** with its
--      own invoice. Nothing reopens a finished one.
--
-- Admin overrides every step of this, and every override is already caught
-- by the audit triggers from 0006 — which is why no new logging is added
-- here. Adding app-side logging would be the weaker version of something
-- the database already does unconditionally.

-- --- draft invoices ------------------------------------------------------

alter table invoices drop constraint invoices_status_check;
alter table invoices
  add constraint invoices_status_check
  check (status in ('draft', 'unpaid', 'partial', 'paid', 'void'));

comment on column invoices.status is
  'draft while the dentist is still adding to it chairside; unpaid/partial/paid derived from payments once finished; void if cancelled. draft and void are both sticky — the totals trigger will not move them.';

-- --- the totals trigger has to outrank the caller ------------------------
--
-- Two changes, both load-bearing.
--
-- SECURITY DEFINER: reception records a payment, which fires this to update
-- `invoices`. Reception has no update on `invoices` any more (see below), so
-- as an invoker function this would silently fail to move the invoice to
-- 'paid' — the money in, the status stuck. The trigger is the authority on
-- totals; it should not be subject to who happened to fire it. It still only
-- ever writes total_amount and status for one id.
--
-- 'draft' joins 'void' as sticky. Without this the trigger would compute
-- 'unpaid' the moment the dentist adds a first line, and the invoice would
-- leave draft on its own — unlocking nothing and locking the dentist out of
-- their own working total.
create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
begin
  select coalesce(sum(amount), 0) into v_total
    from public.invoice_items where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where invoice_id = p_invoice_id;

  update public.invoices set
    total_amount = v_total,
    status = case
      when status = 'void' then 'void'
      when status = 'draft' then 'draft'
      when v_total <= 0 then 'unpaid'
      when v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partial'
      else 'unpaid'
    end
  where id = p_invoice_id;
end;
$$;

revoke all on function public.refresh_invoice_totals(uuid) from public;
grant execute on function public.refresh_invoice_totals(uuid) to authenticated;

-- --- who may change the figures ------------------------------------------
--
-- The rule in one line: the figures belong to whoever is still allowed to
-- change them, and after "finish treatment" that is nobody but an admin.

drop policy "front desk rw insert invoices" on invoices;
drop policy "front desk rw update invoices" on invoices;

-- A dentist raises the draft as they treat. Reception raises nothing: an
-- invoice now originates from the chair, not the front desk.
create policy "dentist raises invoices" on invoices for insert
  with check (
    current_staff_role() = 'admin'
    or (current_staff_role() = 'dentist' and status = 'draft')
  );

-- Only while it is still a draft, and only by the dentist who is billing.
-- Once it leaves draft the figures are fixed for everyone but an admin.
create policy "dentist edits draft invoices" on invoices for update
  using (
    current_staff_role() = 'admin'
    or (current_staff_role() = 'dentist' and status = 'draft')
  )
  with check (current_staff_role() in ('dentist', 'admin'));

drop policy "front desk rw insert invoice_items" on invoice_items;
drop policy "front desk rw update invoice_items" on invoice_items;

create policy "dentist adds draft line items" on invoice_items for insert
  with check (
    current_staff_role() = 'admin'
    or (
      current_staff_role() = 'dentist'
      and exists (
        select 1 from invoices i where i.id = invoice_id and i.status = 'draft'
      )
    )
  );

create policy "dentist edits draft line items" on invoice_items for update
  using (
    current_staff_role() = 'admin'
    or (
      current_staff_role() = 'dentist'
      and exists (
        select 1 from invoices i where i.id = invoice_id and i.status = 'draft'
      )
    )
  )
  with check (current_staff_role() in ('dentist', 'admin'));

-- A mis-typed line is removed while the invoice is still a draft; after
-- that a correction is an admin's job, and visible in the audit log.
drop policy "admin delete invoice_items" on invoice_items;
create policy "delete draft line items" on invoice_items for delete
  using (
    current_staff_role() = 'admin'
    or (
      current_staff_role() = 'dentist'
      and exists (
        select 1 from invoices i where i.id = invoice_id and i.status = 'draft'
      )
    )
  );

-- Reception keeps its insert on `payments` (0002) untouched: taking money is
-- the whole of their part in this, and payments remain append-only for
-- everyone, so a correction is another row rather than an edit.

-- --- who may move a patient along the day --------------------------------
--
-- A BEFORE UPDATE trigger rather than more RLS. RLS answers "may you touch
-- this row at all"; whether a particular OLD -> NEW move is yours to make
-- needs both rows, which a policy cannot see at once without contortion.
-- Keeping it here also means one readable place to answer "who can do what,
-- when" instead of three overlapping policies.
create or replace function public.appointments_guard_transition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text := public.current_staff_role();
begin
  if new.status = old.status then
    return new;
  end if;

  -- Admin overrides everything, at any stage, to fix mistakes. Every such
  -- change is written to audit_log by the trigger from 0006.
  if actor = 'admin' then
    return new;
  end if;

  -- Finishing treatment is a clinical judgement and it locks the figures.
  if old.status = 'in_chair' and new.status = 'pending_payment' then
    if actor <> 'dentist' then
      raise exception 'Only the dentist can finish treatment.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- Taking the money and checking the patient out is the front desk's.
  if old.status = 'pending_payment' and new.status = 'completed' then
    if actor <> 'receptionist' then
      raise exception 'Only reception can accept payment and check the patient out.'
        using errcode = 'check_violation';
    end if;
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
  -- cancelling — stays as it was.
  return new;
end;
$$;

drop trigger if exists appointments_guard_transition on appointments;
create trigger appointments_guard_transition
  before update of status on appointments
  for each row execute function public.appointments_guard_transition();
