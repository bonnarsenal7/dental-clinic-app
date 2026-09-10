-- Row-Level Security. Every clinical/business table is locked down from
-- the moment it exists — nothing here is "add security later".
--
-- Access rules (confirmed for this build):
--   receptionist: full read/write on patients, medical/dental histories,
--     consents, visits (the administrative record), invoices, invoice
--     items, and payments. NO access at all — not even read — to
--     visit_notes (the dentist's clinical write-up) or tooth_records.
--   dentist: full read/write on everything receptionist has, PLUS full
--     read/write on visit_notes and tooth_records.
--   admin: full access everywhere, including staff management and
--     clinic settings.
--
-- current_staff_role() is SECURITY DEFINER so policies on other tables
-- can safely check it without recursing back into staff's own RLS.

create or replace function public.current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from staff where id = auth.uid() and active;
$$;

alter table staff enable row level security;
alter table patients enable row level security;
alter table medical_histories enable row level security;
alter table dental_histories enable row level security;
alter table consents enable row level security;
alter table visits enable row level security;
alter table visit_notes enable row level security;
alter table tooth_records enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table audit_log enable row level security;
alter table clinic_settings enable row level security;

-- staff: everyone can read their own row (so the app can learn its own
-- role/active status right after login); only admin manages the roster.
-- Note: the very first admin row has to be inserted manually via the
-- Supabase SQL editor (which runs as postgres and bypasses RLS) — see
-- the bootstrap instructions in CLAUDE.md. After that, admins create
-- every subsequent account through the app.
create policy "staff read own row" on staff for select
  using (id = auth.uid());
create policy "admin read all staff" on staff for select
  using (current_staff_role() = 'admin');
create policy "admin insert staff" on staff for insert
  with check (current_staff_role() = 'admin');
create policy "admin update staff" on staff for update
  using (current_staff_role() = 'admin');

-- Shared front-desk + clinical tables: receptionist, dentist, and admin
-- all get full read/write. Only admin can delete.
create policy "front desk rw select patients" on patients for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert patients" on patients for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update patients" on patients for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete patients" on patients for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select medical_histories" on medical_histories for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert medical_histories" on medical_histories for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update medical_histories" on medical_histories for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete medical_histories" on medical_histories for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select dental_histories" on dental_histories for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert dental_histories" on dental_histories for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update dental_histories" on dental_histories for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete dental_histories" on dental_histories for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select consents" on consents for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert consents" on consents for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete consents" on consents for delete
  using (current_staff_role() = 'admin');
-- consents are intentionally not updatable — a correction is a new signed row.

create policy "front desk rw select visits" on visits for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert visits" on visits for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update visits" on visits for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete visits" on visits for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select invoices" on invoices for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert invoices" on invoices for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update invoices" on invoices for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete invoices" on invoices for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select invoice_items" on invoice_items for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert invoice_items" on invoice_items for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw update invoice_items" on invoice_items for update
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete invoice_items" on invoice_items for delete
  using (current_staff_role() = 'admin');

create policy "front desk rw select payments" on payments for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert payments" on payments for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete payments" on payments for delete
  using (current_staff_role() = 'admin');
-- payments are not updatable — a correction is a new row (e.g. a refund
-- entry once Phase 4/5 adds that), so the ledger is never silently edited.

-- Clinical-only tables: dentist and admin only. No policy at all for
-- receptionist means the default-deny applies — not read, not write.
create policy "clinical rw select visit_notes" on visit_notes for select
  using (current_staff_role() in ('dentist', 'admin'));
create policy "clinical rw insert visit_notes" on visit_notes for insert
  with check (current_staff_role() in ('dentist', 'admin'));
create policy "clinical rw update visit_notes" on visit_notes for update
  using (current_staff_role() in ('dentist', 'admin'));
create policy "admin delete visit_notes" on visit_notes for delete
  using (current_staff_role() = 'admin');

create policy "clinical rw select tooth_records" on tooth_records for select
  using (current_staff_role() in ('dentist', 'admin'));
create policy "clinical rw insert tooth_records" on tooth_records for insert
  with check (current_staff_role() in ('dentist', 'admin'));
create policy "clinical rw update tooth_records" on tooth_records for update
  using (current_staff_role() in ('dentist', 'admin'));
create policy "admin delete tooth_records" on tooth_records for delete
  using (current_staff_role() = 'admin');

-- audit_log: any active staff member can write an entry for their own
-- actions; only admin can read the log back (Requirements doc M7).
create policy "active staff insert audit_log" on audit_log for insert
  with check (current_staff_role() is not null and staff_id = auth.uid());
create policy "admin read audit_log" on audit_log for select
  using (current_staff_role() = 'admin');

-- clinic_settings: every active staff member can read it (shown in the
-- nav shell); only admin can change it.
create policy "active staff read clinic_settings" on clinic_settings for select
  using (current_staff_role() is not null);
create policy "admin update clinic_settings" on clinic_settings for update
  using (current_staff_role() = 'admin');
