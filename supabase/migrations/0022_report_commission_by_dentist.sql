-- Freeze the per-dentist commission into the end-of-day report.
--
-- The report is what Close Clinic saves and every re-download is rebuilt
-- from (0020), so the PDF's breakdown has to be saved with it. Reading it live
-- would let a later change — reception reassigning a finished appointment's
-- dentist (0015) — move a share between names on a report already printed.
--
-- The breakdown comes from clinic_day_commission_by_dentist() (0021), the same
-- function the dashboard uses, so the printed rows are the ones that were on
-- screen at closing. That function authorises by current_staff_role(), which
-- still resolves to the caller inside this SECURITY DEFINER function.
--
-- Days closed before this migration have no `commission_by_dentist` key. It is
-- not backfilled: those reports are what was closed, and the PDF says the
-- breakdown was not recorded rather than presenting a live one as frozen.
--
-- Everything else in the function is unchanged from 0020.
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
  lock table public.daily_expenses, public.salary_entries, public.invoices, public.appointments
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
    ), '[]'::jsonb)
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
