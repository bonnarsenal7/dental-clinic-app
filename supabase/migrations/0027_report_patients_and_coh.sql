-- Freeze the patient list and the non-cash total into the end-of-day report.
--
-- The EOD report now follows the clinic's paper format: a "Today's patients"
-- table (name, procedure, method, amount), and an overall summary ending in
-- today's cash on hand:
--
--   COH = revenue - bank & digital - expenses - (salary + commission)
--
-- Both have to be frozen with the report, for the same reason as the
-- per-dentist commission (0022): every re-download is rebuilt from what was
-- saved at closing, never recomputed.
--
-- `payments` is one row per payment taken today (the same rows
-- clinic_day_totals() sums as revenue), so the table always adds up to the
-- revenue total. A refund is a negative row. `procedure` is the invoice's
-- lines, joined. `non_cash_total` is every method but cash — card, bank
-- transfer and other (GCash and the like).
--
-- Days closed before this migration have neither key. They are not
-- backfilled; the PDF says the list was not recorded.
--
-- Everything else in the function is unchanged from 0022.
create or replace function public.close_clinic_day()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := public.current_staff_role();
  v_date date := public.clinic_today();
  v_totals record;
  v_closer text;
  v_report jsonb;
begin
  if coalesce(v_actor, '') not in ('receptionist', 'admin') then
    raise exception 'Only reception or an admin can close the clinic.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Hold writes to what the report counts until this commits (see 0020).
  -- appointments joins the list: the breakdown attributes commission through
  -- them, so a dentist reassigned in the same instant must not split the
  -- printed rows from the saved total.
  lock table public.daily_expenses, public.salary_entries, public.invoices, public.appointments,
    public.payments, public.invoice_items
    in share mode;

  if exists (select 1 from public.clinic_days where business_date = v_date) then
    raise exception 'The clinic is already closed for %.', to_char(v_date, 'FMDD Mon YYYY')
      using errcode = 'check_violation';
  end if;

  select * into v_totals from public.clinic_day_totals(v_date);
  select name into v_closer from public.staff where id = auth.uid();

  v_report := jsonb_build_object(
    'business_date', v_date,
    'closed_at', now(),
    'closed_by_name', v_closer,
    'revenue_total', v_totals.revenue_total,
    'expense_total', v_totals.expense_total,
    'salary_total', v_totals.salary_total,
    'commission_total', v_totals.commission_total,
    'net_total', v_totals.revenue_total - v_totals.expense_total - v_totals.salary_total,
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('description', e.description, 'amount', e.amount)
                       order by e.created_at)
      from public.daily_expenses e
      where e.business_date = v_date
    ), '[]'::jsonb),
    'salaries', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'dentist_id', s.dentist_id,
                         'dentist_name', st.name,
                         'description', s.description,
                         'amount', s.amount)
                       order by st.name, s.created_at)
      from public.salary_entries s
      join public.staff st on st.id = s.dentist_id
      where s.business_date = v_date
    ), '[]'::jsonb),
    'commission_by_dentist', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'dentist_id', c.dentist_id,
                         'dentist_name', c.dentist_name,
                         'commission_total', c.commission_total)
                       order by c.dentist_name nulls last)
      from public.clinic_day_commission_by_dentist(v_date) c
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
                         'patient_name', pt.name,
                         'procedure', (
                           select string_agg(ii.description, ', ' order by ii.created_at)
                           from public.invoice_items ii
                           where ii.invoice_id = p.invoice_id),
                         'method', p.method,
                         'amount', p.amount)
                       order by p.paid_at)
      from public.payments p
      join public.invoices i on i.id = p.invoice_id
      join public.patients pt on pt.id = i.patient_id
      where (p.paid_at at time zone 'Asia/Manila')::date = v_date
    ), '[]'::jsonb),
    'non_cash_total', (
      select coalesce(sum(p.amount), 0)
      from public.payments p
      where (p.paid_at at time zone 'Asia/Manila')::date = v_date
        and p.method <> 'cash'
    )
  );

  begin
    insert into public.clinic_days (business_date, closed_by, report)
    values (v_date, auth.uid(), v_report);
  exception when unique_violation then
    raise exception 'The clinic is already closed for %.', to_char(v_date, 'FMDD Mon YYYY')
      using errcode = 'check_violation';
  end;

  return v_report;
end;
$$;

revoke all on function public.close_clinic_day() from public;
grant execute on function public.close_clinic_day() to authenticated;
