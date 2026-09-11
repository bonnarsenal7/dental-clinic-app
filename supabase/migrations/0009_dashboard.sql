-- A daily dashboard: the numbers a clinic actually opens the app to see.
--
-- Aggregated in the database rather than by pulling every invoice into the
-- browser and summing it there. Two reasons: the arithmetic stays next to
-- the money it describes, and a tablet on clinic Wi-Fi shouldn't download
-- the whole ledger to show one figure.
--
-- **`security_invoker = true` is essential here.** Without it a view runs as
-- its owner, which would hand a receptionist totals computed over rows their
-- own policies forbid — quietly punching a hole through the RLS boundary
-- the whole project rests on. With it, every underlying policy still
-- applies. Every table read below is front-desk readable, so all three
-- roles get the same, correct numbers.
--
-- Timezone: the clinic is in the Philippines and the database is UTC. A
-- bare `scheduled_at::date = current_date` would roll the day over at 8am
-- local, so "today" is computed in Asia/Manila throughout. If the clinic
-- ever opens a branch in another zone this becomes a per-branch setting.

create or replace view daily_dashboard
with (security_invoker = true) as
with bounds as (
  select (now() at time zone 'Asia/Manila')::date as today
),
appts as (
  select a.status, a.arrived_at, a.seated_at
  from appointments a, bounds b
  where (a.scheduled_at at time zone 'Asia/Manila')::date = b.today
),
todays_payments as (
  select p.amount, p.method
  from payments p, bounds b
  where (p.paid_at at time zone 'Asia/Manila')::date = b.today
),
todays_production as (
  -- What was billed today, as opposed to what was collected. The two
  -- differ whenever someone pays off an older invoice, and a clinic wants
  -- both numbers.
  select ii.amount
  from invoice_items ii
  join invoices i on i.id = ii.invoice_id
  , bounds b
  where (i.created_at at time zone 'Asia/Manila')::date = b.today
    and i.status <> 'void'
),
balances as (
  select i.id, i.patient_id, i.total_amount - coalesce(sum(p.amount), 0) as balance
  from invoices i
  left join payments p on p.invoice_id = i.id
  where i.status <> 'void'
  group by i.id, i.patient_id, i.total_amount
)
select
  (select today from bounds) as today,

  (select count(*) from appts) as appointments_today,
  (select count(*) from appts where status in ('arrived', 'in_chair')) as in_clinic,
  (select count(*) from appts where status in ('booked', 'confirmed')) as still_to_come,
  (select count(*) from appts where status = 'completed') as completed_today,
  (select count(*) from appts where status = 'no_show') as no_shows_today,
  (select count(*) from appts where status = 'cancelled') as cancelled_today,
  -- Whole minutes the longest-waiting patient has been sitting there.
  (select coalesce(max(extract(epoch from now() - arrived_at) / 60), 0)::int
     from appts where status = 'arrived' and arrived_at is not null) as longest_wait_minutes,

  (select coalesce(sum(amount), 0) from todays_payments) as collected_today,
  (select coalesce(sum(amount), 0) from todays_payments where method = 'cash') as collected_cash,
  (select coalesce(sum(amount), 0) from todays_payments where method = 'card') as collected_card,
  (select coalesce(sum(amount), 0) from todays_payments where method = 'bank_transfer') as collected_transfer,
  (select coalesce(sum(amount), 0) from todays_payments where method = 'other') as collected_other,
  (select coalesce(sum(amount), 0) from todays_production) as produced_today,

  (select coalesce(sum(balance), 0) from balances where balance > 0) as outstanding_total,
  (select count(distinct patient_id) from balances where balance > 0) as patients_owing,

  (select count(*) from recalls, bounds where status = 'due' and due_on < bounds.today) as recalls_overdue,
  (select count(*) from recalls, bounds
     where status = 'due' and due_on between bounds.today and bounds.today + 30) as recalls_due_soon,

  (select count(*) from patients, bounds
     where (created_at at time zone 'Asia/Manila')::date = bounds.today) as new_patients_today;

comment on view daily_dashboard is
  'One row of today''s clinic numbers. security_invoker so RLS still applies.';
