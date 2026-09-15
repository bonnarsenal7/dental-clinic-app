-- A recall is a date, chosen on a calendar. Not an interval.
--
-- The profile used to ask "in how many months" and store both the computed
-- `due_on` and the interval that produced it. Nothing ever read the interval
-- back — no code set the next recall from it — so it was a second copy of a
-- decision that could only drift from the date. The clinic asked for the
-- date alone, so the column goes.
--
-- What is lost, knowingly: whether an existing recall was a repeating
-- check-up or a one-off follow-up. Every recall's due date is unchanged.

alter table recalls drop column interval_months;

-- --- a recall is always for a day still to come ---------------------------
--
-- The calendar on the profile only offers dates after today, but the
-- calendar is not the only thing that writes here.
--
-- A trigger rather than a CHECK: a check constraint is validated against
-- existing rows and re-evaluated on every update, and recalls that are
-- already overdue are exactly the ones reception is working through — marking
-- one `scheduled` or `completed` must not fail because its date has passed.
-- So only a new recall, or a changed date, must be in the future.
--
-- Today is Asia/Manila's today, not UTC's, as everywhere else (0009).
create or replace function public.recalls_future_due_on()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.due_on is distinct from old.due_on)
     and new.due_on <= (now() at time zone 'Asia/Manila')::date then
    raise exception 'A recall date must be after today.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists recalls_future_due_on on recalls;
create trigger recalls_future_due_on
  before insert or update of due_on on recalls
  for each row execute function public.recalls_future_due_on();
