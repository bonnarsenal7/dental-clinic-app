-- Fixes a bug that made the billing data unrestorable, found by actually
-- rehearsing a restore (docs/COMPLIANCE.md §3).
--
-- 0005_billing.sql created refresh_invoice_totals() and
-- invoice_totals_trigger() without pinning search_path. That works in
-- normal app traffic, where the session's search_path includes public, and
-- fails completely under a restore: pg_dump emits
--
--     SELECT pg_catalog.set_config('search_path', '', false);
--
-- at the top of every dump, so inside the function the unqualified
-- `from invoice_items` resolves against an EMPTY search_path and raises
-- `relation "invoice_items" does not exist`. That aborts the trigger, which
-- aborts the INSERT — so restoring a backup silently produced zero
-- invoice_items and zero payments while reporting success.
--
-- Both functions now pin search_path and schema-qualify their tables, the
-- same way current_staff_role() and audit_row_change() already did.

create or replace function public.refresh_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
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
      when v_total <= 0 then 'unpaid'
      when v_paid >= v_total then 'paid'
      when v_paid > 0 then 'partial'
      else 'unpaid'
    end
  where id = p_invoice_id;
end;
$$;

create or replace function public.invoice_totals_trigger()
returns trigger
language plpgsql
set search_path = public
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
