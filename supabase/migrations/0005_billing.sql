-- Phase 4: billing & invoicing.
--
-- invoices / invoice_items / payments already exist from 0001_schema.sql.
-- This migration adds the configurable price list, the columns that let an
-- invoice line trace back to the charted procedure it came from, and
-- triggers that keep invoice totals and status derived rather than
-- client-maintained — money is not something to leave to a UI bug.

-- --- Configurable price list --------------------------------------------

create table procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The clinic's own shorthand for the procedure, if they use one.
  code text,
  default_fee numeric(12, 2) not null default 0 check (default_fee >= 0),
  -- Optional link to Phase 3's charting vocabulary. A procedure with
  -- chart_condition = 'filled' is what the invoice builder offers when it
  -- finds a tooth charted as filled during the visit. Only conditions that
  -- represent work *performed* belong here: 'decayed' and 'missing' are
  -- findings, and 'planned' is future work — none of them are billable.
  -- Widen this check if Phase 3's vocabulary gains more procedures.
  chart_condition text check (chart_condition is null or chart_condition in ('filled', 'crown')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Case-insensitive, so "Composite Filling" and "composite filling" can't
-- both end up in the picker.
create unique index procedures_name_idx on procedures (lower(name));

alter table procedures enable row level security;

-- Same shape as clinic_settings: every active staff member reads the price
-- list (they bill from it); only admin sets prices.
create policy "active staff read procedures" on procedures for select
  using (current_staff_role() is not null);
create policy "admin insert procedures" on procedures for insert
  with check (current_staff_role() = 'admin');
create policy "admin update procedures" on procedures for update
  using (current_staff_role() = 'admin');
create policy "admin delete procedures" on procedures for delete
  using (current_staff_role() = 'admin');

-- --- Invoice lines that trace back to the chart -------------------------

alter table invoices
  add column created_by uuid references staff (id);

alter table invoice_items
  add column procedure_id uuid references procedures (id),
  -- The charted procedure this line bills for. This is what makes the
  -- roadmap's "no manual re-entry" real.
  add column tooth_record_id uuid references tooth_records (id),
  -- tooth_number and description are deliberately *denormalised* onto the
  -- line rather than read through tooth_record_id at render time. Two
  -- reasons: reception has no RLS access to tooth_records at all and must
  -- still be able to print a receipt, and an invoice is a financial record
  -- that must not change wording when the chart is later re-charted.
  add column tooth_number smallint,
  add column created_at timestamptz not null default now();

-- A charted procedure can be billed once. Cheap protection against
-- double-billing when an invoice is built from the chart twice.
create unique index invoice_items_tooth_record_idx
  on invoice_items (tooth_record_id) where tooth_record_id is not null;

create index invoice_items_invoice_id_idx on invoice_items (invoice_id);
create index payments_invoice_id_idx on payments (invoice_id);

-- Payments record who took the money and against what reference (an
-- official receipt number, a card authorisation code).
alter table payments
  add column received_by uuid references staff (id),
  add column reference text;

-- --- Derived totals ------------------------------------------------------
--
-- invoices.total_amount and invoices.status are recomputed from the lines
-- and payments rather than written by the client, so they cannot drift.
-- A negative payment is a refund (0002_rls.sql anticipated this), which is
-- why paid/partial are decided on the running sum rather than a count.

create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_total numeric(12, 2);
  v_paid numeric(12, 2);
begin
  select coalesce(sum(amount), 0) into v_total
    from invoice_items where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into v_paid
    from payments where invoice_id = p_invoice_id;

  update invoices set
    total_amount = v_total,
    status = case
      -- A voided invoice stays voided; it is not resurrected by a payment.
      when status = 'void' then 'void'
      when v_total <= 0 then 'unpaid'
      when v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partial'
      else 'unpaid'
    end
  where id = p_invoice_id;
end;
$$;

-- NEW is unassigned on DELETE and OLD on INSERT, and touching the wrong
-- one raises rather than yielding null — so branch on TG_OP instead of
-- coalescing. Refreshing both sides on UPDATE also covers a line being
-- moved between invoices, which would otherwise leave the old one stale.
create or replace function public.invoice_totals_trigger()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.refresh_invoice_totals(old.invoice_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_invoice_totals(new.invoice_id);
  end if;
  return null;
end;
$$;

create trigger invoice_items_refresh_totals
  after insert or update or delete on invoice_items
  for each row execute function public.invoice_totals_trigger();

-- payments has no update policy (0002_rls.sql: a correction is a new row),
-- but the trigger covers update anyway so the totals stay right if that
-- ever changes.
create trigger payments_refresh_totals
  after insert or update or delete on payments
  for each row execute function public.invoice_totals_trigger();
