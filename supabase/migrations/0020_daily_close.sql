-- End of day: daily expenses, daily salary, and "Close Clinic".
--
-- Reception records what the clinic spent and paid out today; at close of
-- business they press Close Clinic, which freezes the day's figures into a
-- report and locks the day. Nothing about the day's expenses, salary or
-- commission can change afterwards — for anyone, admin included.
--
-- **That is stricter than everything else in the app, on purpose.** Elsewhere
-- an admin overrides and the audit log records it (0013). A closed day is the
-- clinic's end-of-day reconciliation: a figure an admin could still move
-- afterwards would make the printed report a draft. There is deliberately no
-- reopen in the app. A day closed by mistake can only be reopened by deleting
-- its clinic_days row from the SQL editor, which the audit log records.
--
-- "Today" is Asia/Manila's, as everywhere else (0009).

create or replace function public.clinic_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

comment on function public.clinic_today() is
  'The clinic''s calendar day. The database runs in UTC; the clinic does not.';

-- --- the tables -------------------------------------------------------------

-- One row per closed day. Its existence is the lock; `report` is the frozen
-- figures, so a re-download always matches what was closed even when a
-- payment lands afterwards.
create table clinic_days (
  id uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  closed_at timestamptz not null default now(),
  closed_by uuid references staff (id),
  report jsonb not null
);

create table daily_expenses (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default public.clinic_today(),
  description text not null constraint daily_expenses_description_check check (length(btrim(description)) > 0),
  amount numeric(12, 2) not null constraint daily_expenses_amount_check check (amount > 0),
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create index daily_expenses_date_idx on daily_expenses (business_date);

-- A dentist's salary record is their rows here: one per day worked, or more
-- than one where a day is paid in parts. Staffing varies daily, so this is a
-- log of what was paid rather than a rate on the staff row.
create table salary_entries (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default public.clinic_today(),
  dentist_id uuid not null references staff (id),
  description text not null constraint salary_entries_description_check check (length(btrim(description)) > 0),
  amount numeric(12, 2) not null constraint salary_entries_amount_check check (amount > 0),
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create index salary_entries_date_idx on salary_entries (business_date);
create index salary_entries_dentist_idx on salary_entries (dentist_id, business_date);

-- --- the lock, and the day an entry belongs to ------------------------------
--
-- A trigger rather than RLS: the rule needs the clinic_days table, the old
-- and new row at once, and has to hold for admin, whom RLS already admits.
-- SECURITY DEFINER so it can read staff to check a salary's dentist.
create or replace function public.daily_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The database decides the day and who recorded it. An entry is always
    -- today's; a client cannot backdate one onto a day already closed.
    new.business_date := public.clinic_today();
    new.created_by := auth.uid();
    new.created_at := now();
    if exists (select 1 from public.clinic_days where business_date = new.business_date) then
      raise exception 'The clinic is already closed for %. Nothing more can be added to that day.',
        to_char(new.business_date, 'FMDD Mon YYYY')
        using errcode = 'check_violation';
    end if;

  elsif tg_op = 'UPDATE' then
    if exists (select 1 from public.clinic_days where business_date = old.business_date) then
      raise exception 'The clinic is closed for %. Its entries can no longer be changed.',
        to_char(old.business_date, 'FMDD Mon YYYY')
        using errcode = 'check_violation';
    end if;
    if new.business_date is distinct from old.business_date
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'An entry stays on the day, and with the person, it was recorded against.'
        using errcode = 'check_violation';
    end if;

  else
    if exists (select 1 from public.clinic_days where business_date = old.business_date) then
      raise exception 'The clinic is closed for %. Its entries can no longer be removed.',
        to_char(old.business_date, 'FMDD Mon YYYY')
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Nested, not `and`-ed: daily_expenses has no dentist_id, and PL/pgSQL
  -- resolves the field when the statement is prepared, not when it is reached.
  if tg_table_name = 'salary_entries' then
    if not exists (
      select 1 from public.staff where id = new.dentist_id and role in ('dentist', 'admin')
    ) then
      raise exception 'Salary can only be recorded against a dentist.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger daily_expenses_guard
  before insert or update or delete on daily_expenses
  for each row execute function public.daily_entries_guard();

create trigger salary_entries_guard
  before insert or update or delete on salary_entries
  for each row execute function public.daily_entries_guard();

-- --- who may do what ---------------------------------------------------------
--
--   receptionist   read, add            never edit or delete
--   admin          read, add, edit, delete — until the day is closed
--   dentist        nothing: colleagues' pay is not theirs to read
--
-- The close is enforced by the trigger above for every role.

alter table clinic_days enable row level security;
alter table daily_expenses enable row level security;
alter table salary_entries enable row level security;

create policy "front desk reads closed days" on clinic_days for select
  using (current_staff_role() in ('receptionist', 'admin'));
-- No insert, update or delete policy for anyone: close_clinic_day() writes
-- the row, and nothing in the app reopens a day.

create policy "front desk reads expenses" on daily_expenses for select
  using (current_staff_role() in ('receptionist', 'admin'));
create policy "front desk adds expenses" on daily_expenses for insert
  with check (current_staff_role() in ('receptionist', 'admin'));
create policy "admin edits expenses" on daily_expenses for update
  using (current_staff_role() = 'admin')
  with check (current_staff_role() = 'admin');
create policy "admin deletes expenses" on daily_expenses for delete
  using (current_staff_role() = 'admin');

create policy "front desk reads salary" on salary_entries for select
  using (current_staff_role() in ('receptionist', 'admin'));
create policy "front desk adds salary" on salary_entries for insert
  with check (current_staff_role() in ('receptionist', 'admin'));
create policy "admin edits salary" on salary_entries for update
  using (current_staff_role() = 'admin')
  with check (current_staff_role() = 'admin');
create policy "admin deletes salary" on salary_entries for delete
  using (current_staff_role() = 'admin');

-- --- commission is locked with its day ---------------------------------------
--
-- Commission counts toward the day of the visit: the day its invoice was
-- raised (clinic's choice). So once that day is closed, its invoices'
-- commission is fixed. The check lives in 0017's guard trigger, which every
-- path to the column passes through — set_invoice_commission() included.
-- The consequence, knowingly accepted: a commission not entered before its
-- day was closed cannot be entered at all.
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

  if new.commission_amount is distinct from old.commission_amount then
    if coalesce(actor, '') not in ('receptionist', 'admin') then
      raise exception 'Commission is entered by reception.'
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.clinic_days
      where business_date = (old.created_at at time zone 'Asia/Manila')::date
    ) then
      raise exception 'The clinic is closed for %. Commission for that day can no longer be changed.',
        to_char((old.created_at at time zone 'Asia/Manila')::date, 'FMDD Mon YYYY')
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- --- the day's figures -------------------------------------------------------
--
-- The arithmetic is here, not in the browser, as with daily_dashboard (0009).
-- SECURITY INVOKER: called by reception it sees what their policies admit;
-- called from close_clinic_day() it runs as that function's owner.
--
--   revenue     payments received on the day (refunds are negative)
--   commission  commission on the day's non-void invoices
create or replace function public.clinic_day_totals(p_date date default public.clinic_today())
returns table (
  business_date date,
  revenue_total numeric,
  expense_total numeric,
  salary_total numeric,
  commission_total numeric
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
      where i.status <> 'void' and (i.created_at at time zone 'Asia/Manila')::date = p_date)
$$;

revoke all on function public.clinic_day_totals(date) from public;
grant execute on function public.clinic_day_totals(date) to authenticated;

-- --- Close Clinic -------------------------------------------------------------
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

  -- Hold writes to what the report counts until this commits. Without it an
  -- expense or a commission saved in the same instant could land on the day
  -- after its figures were read and before the lock row was visible — locked,
  -- and missing from the report. SHARE blocks inserts, updates and deletes;
  -- they wait a moment, then meet the lock.
  lock table public.daily_expenses, public.salary_entries, public.invoices in share mode;

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
    ), '[]'::jsonb)
  );

  begin
    insert into public.clinic_days (business_date, closed_by, report)
    values (v_date, auth.uid(), v_report);
  exception when unique_violation then
    -- Two receptionists pressing Close at the same moment.
    raise exception 'The clinic is already closed for %.', to_char(v_date, 'FMDD Mon YYYY')
      using errcode = 'check_violation';
  end;

  return v_report;
end;
$$;

revoke all on function public.close_clinic_day() from public;
grant execute on function public.close_clinic_day() to authenticated;

-- --- audit ---------------------------------------------------------------------
-- Money and its lock: every add, admin edit, delete and close is recorded by
-- 0006's trigger, which nobody can opt out of.
do $$
declare
  t text;
begin
  foreach t in array array['daily_expenses', 'salary_entries', 'clinic_days'] loop
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function public.audit_row_change()',
      'audit_' || t, t
    );
  end loop;
end;
$$;
