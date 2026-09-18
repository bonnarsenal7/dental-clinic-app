-- How many patients were actually seen today.
--
-- The front desk's "Today's summary" puts the day's headline figures in one
-- place: patients serviced, collected, salary, commission. Three of those
-- clinic_day_totals already returns; this adds the fourth.
--
-- **Serviced means a visit, not an appointment.** A visit row is created when
-- a patient is seated, and by the chart when a dentist starts one without a
-- booking — so it counts people actually treated, not people booked. Distinct
-- patients: two visits in one day is one patient serviced.
--
-- The return type changes, so the function is dropped and recreated rather
-- than replaced. close_clinic_day() selects it into a record and adapts.

drop function if exists public.clinic_day_totals(date);

create function public.clinic_day_totals(p_date date default public.clinic_today())
returns table (
  business_date date,
  revenue_total numeric,
  expense_total numeric,
  salary_total numeric,
  commission_total numeric,
  patients_served bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_date,
    (select coalesce(sum(p.amount), 0) from public.payments p
      where (p.paid_at at time zone 'Asia/Manila')::date = p_date),
    (select coalesce(sum(e.amount), 0) from public.daily_expenses e
      where e.business_date = p_date),
    (select coalesce(sum(s.amount), 0) from public.salary_entries s
      where s.business_date = p_date),
    (select coalesce(sum(i.commission_amount), 0) from public.invoices i
      where i.status <> 'void' and (i.created_at at time zone 'Asia/Manila')::date = p_date),
    (select count(distinct v.patient_id) from public.visits v
      where (v.visit_date at time zone 'Asia/Manila')::date = p_date)
$$;

revoke all on function public.clinic_day_totals(date) from public;
grant execute on function public.clinic_day_totals(date) to authenticated;
