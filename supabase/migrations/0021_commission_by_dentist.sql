-- Commission today, per dentist.
--
-- Commission is one number on an invoice (0017) and says nothing about whose
-- it is. The dentist is found through the visit the invoice bills:
--
--   1. the appointment for that visit — its dentist_id is reassigned when the
--      patient is seated, so it names who actually treated them;
--   2. otherwise the visit's own staff_id — a visit started from the chart has
--      no appointment, and is recorded against the dentist who started it —
--      but only when that person is a dentist or an admin who treats. Seating
--      an unassigned booking records whoever seated it, often a receptionist,
--      and their name must not appear against a commission;
--   3. otherwise nobody: the row comes back with a null dentist and the screen
--      says so, rather than the commission quietly vanishing from the list.
--
-- The day is the invoice's day, as for the total in clinic_day_totals (0020),
-- so the rows always add up to that total.
--
-- SECURITY DEFINER because reception cannot read staff (0002); it does its
-- own authorisation, returning nothing to anyone but reception or an admin,
-- and hands back only a name — the same exposure as bookable_dentists (0011).
create or replace function public.clinic_day_commission_by_dentist(p_date date default public.clinic_today())
returns table (dentist_id uuid, dentist_name text, commission_total numeric)
language sql
stable
security definer
set search_path = public
as $$
  with day_invoices as (
    select i.visit_id, i.commission_amount
    from public.invoices i
    where public.current_staff_role() in ('receptionist', 'admin')
      and i.status <> 'void'
      and i.commission_amount > 0
      and (i.created_at at time zone 'Asia/Manila')::date = p_date
  ),
  attributed as (
    select
      d.commission_amount,
      coalesce(
        (select a.dentist_id
           from public.appointments a
          where a.visit_id = d.visit_id and a.dentist_id is not null
          order by a.scheduled_at desc
          limit 1),
        (select v.staff_id
           from public.visits v
           join public.staff s on s.id = v.staff_id
          where v.id = d.visit_id and s.role in ('dentist', 'admin'))
      ) as dentist_id
    from day_invoices d
  )
  select x.dentist_id, s.name, sum(x.commission_amount)
  from attributed x
  left join public.staff s on s.id = x.dentist_id
  group by x.dentist_id, s.name
  order by s.name nulls last
$$;

revoke all on function public.clinic_day_commission_by_dentist(date) from public;
grant execute on function public.clinic_day_commission_by_dentist(date) to authenticated;
