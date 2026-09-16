-- Two kinds of patient: regular and orthodontic.
--
-- A categorisation and nothing more. Orthodontic patients use the same
-- fields, the same histories, the same chart, the same billing — there is no
-- second table and no branch anywhere. If that changes later, this column is
-- what the change hangs off.
--
-- Every existing patient becomes 'regular': that is what they have been
-- treated as, and the default keeps the pilot data and the seed script
-- working untouched.

alter table patients
  add column patient_type text not null default 'regular'
    constraint patients_patient_type_check check (patient_type in ('regular', 'orthodontic'));

comment on column patients.patient_type is
  'regular | orthodontic. Set when the patient is registered; changed afterwards only by an admin (patients_guard_type).';

-- --- changing it later is an admin's -----------------------------------------
--
-- Reception registers patients and keeps their details up to date (0002), so
-- they set the type at registration — the front desk knows which the patient
-- is. **Moving a patient between categories afterwards is an admin's**, and
-- RLS cannot say that: a policy grants the whole row, and reception must keep
-- the rest of it. So a trigger, like the other "who may make this particular
-- change" rules (0013, 0015, 0020).
--
-- An update that leaves the type alone passes untouched, which is what lets
-- reception go on editing a patient's details through the same form.
create or replace function public.patients_guard_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.patient_type is distinct from old.patient_type
     and coalesce(public.current_staff_role(), '') <> 'admin' then
    raise exception 'Only an admin can change a patient''s type.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists patients_guard_type on patients;
create trigger patients_guard_type
  before update on patients
  for each row execute function public.patients_guard_type();
