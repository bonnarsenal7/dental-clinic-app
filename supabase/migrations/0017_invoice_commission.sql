-- The dentist's commission on an invoice.
--
-- Entered by reception on the payment screen and read, never written, by the
-- dentist on their dashboard. It lives on the invoice because the invoice is
-- the one record per visit that already carries the amount the commission is
-- a share of — the dashboard reads both from the same row.
--
-- Reception has no update on `invoices` (0013: the figures belong to the
-- dentist until treatment finishes, then to nobody but an admin), and that
-- must not be widened to let reception touch the commission — a policy
-- grants the whole row, which would hand them the total and the status too.
-- So the write goes through a SECURITY DEFINER function that sets exactly
-- one column, and a guard trigger stops anyone else changing that column by
-- the ordinary update path the dentist still has on a draft.
--
-- No app-side logging: 0006's audit trigger on `invoices` records the change
-- with the field name and the caller's id, as it does for every other write.

alter table invoices
  add column commission_amount numeric(12, 2) not null default 0
    constraint invoices_commission_amount_check check (commission_amount >= 0);

comment on column invoices.commission_amount is
  'Dentist commission for this invoice. Written only by reception or admin, via set_invoice_commission(); defaults to 0 until entered.';

-- --- only reception or an admin may change it ---------------------------

create or replace function public.invoices_guard_commission()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  actor text := public.current_staff_role();
begin
  if tg_op = 'INSERT' then
    if new.commission_amount <> 0 and coalesce(actor, '') not in ('receptionist', 'admin') then
      raise exception 'Commission is entered by reception.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.commission_amount is distinct from old.commission_amount
     and coalesce(actor, '') not in ('receptionist', 'admin') then
    raise exception 'Commission is entered by reception.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard_commission on invoices;
create trigger invoices_guard_commission
  before insert or update on invoices
  for each row execute function public.invoices_guard_commission();

-- --- the one write reception has on an invoice ---------------------------

create or replace function public.set_invoice_commission(p_invoice_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.current_staff_role();
  v_status text;
begin
  if coalesce(actor, '') not in ('receptionist', 'admin') then
    raise exception 'Commission is entered by reception.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'Commission cannot be negative.'
      using errcode = 'check_violation';
  end if;

  select status into v_status from public.invoices where id = p_invoice_id;
  if v_status is null then
    raise exception 'Invoice not found.' using errcode = 'no_data_found';
  end if;
  if v_status = 'void' then
    raise exception 'This invoice is void. Commission cannot be recorded against it.'
      using errcode = 'check_violation';
  end if;

  update public.invoices set commission_amount = p_amount where id = p_invoice_id;
end;
$$;

revoke all on function public.set_invoice_commission(uuid, numeric) from public;
grant execute on function public.set_invoice_commission(uuid, numeric) to authenticated;
