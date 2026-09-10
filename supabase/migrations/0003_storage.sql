-- Phase 2: file storage for consent signatures and patient attachments
-- (X-rays, ID scans). One private bucket, split by folder prefix:
--   signatures/<patient_id>/<timestamp>.png
--   attachments/<patient_id>/<timestamp>-<filename>

insert into storage.buckets (id, name, public)
values ('patient-files', 'patient-files', false)
on conflict (id) do nothing;

-- Metadata for attachments (X-rays, ID scans) so the app can list/label
-- them without listing the bucket directly. Signatures are referenced
-- straight from consents.signature_image_url instead, since each is tied
-- to exactly one consent row already.
create table patient_files (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_type text,
  uploaded_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create index patient_files_patient_id_idx on patient_files (patient_id);

alter table patient_files enable row level security;

create policy "front desk rw select patient_files" on patient_files for select
  using (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert patient_files" on patient_files for insert
  with check (current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete patient_files" on patient_files for delete
  using (current_staff_role() = 'admin');

-- storage.objects already has RLS enabled by default on Supabase projects.
create policy "front desk rw select patient-files objects" on storage.objects for select
  using (bucket_id = 'patient-files' and current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "front desk rw insert patient-files objects" on storage.objects for insert
  with check (bucket_id = 'patient-files' and current_staff_role() in ('receptionist', 'dentist', 'admin'));
create policy "admin delete patient-files objects" on storage.objects for delete
  using (bucket_id = 'patient-files' and current_staff_role() = 'admin');
