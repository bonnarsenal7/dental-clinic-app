-- Phase 3: dental charting (odontogram).
--
-- tooth_records already exists from 0001_schema.sql (patient_id, visit_id,
-- tooth_number, surface, condition). This migration adds the columns the
-- chart UI needs, constrains the FDI/condition/surface vocabularies at the
-- database level, and closes a storage gap: per-tooth X-rays are clinical
-- data, so they must not sit under the same front-desk-readable prefix as
-- consent signatures and ID scans.

alter table tooth_records
  add column created_by uuid references staff (id),
  -- One optional image per record — e.g. the X-ray that justified marking
  -- this tooth decayed. Object path in the private patient-files bucket,
  -- under the clinical-only tooth/ prefix (see the storage policies below).
  add column image_path text,
  add column image_name text,
  -- The chart's meaning depends on the order records were written in: a
  -- tooth marked decayed and then sound is sound, and the reverse is not.
  -- created_at can't carry that order, because now() is transaction time —
  -- every row saved in one batch shares a timestamp. seq is a total order
  -- over the log, so the fold is deterministic within a batch as well as
  -- across them.
  add column seq bigserial;

-- FDI two-digit numbering, matching the clinic's paper chart: quadrants
-- 1-4 are permanent teeth (positions 1-8), quadrants 5-8 are primary teeth
-- (positions 1-5). Anything else is a typo, not a tooth.
alter table tooth_records
  add constraint tooth_records_fdi_number_check check (
    tooth_number between 11 and 18
    or tooth_number between 21 and 28
    or tooth_number between 31 and 38
    or tooth_number between 41 and 48
    or tooth_number between 51 and 55
    or tooth_number between 61 and 65
    or tooth_number between 71 and 75
    or tooth_number between 81 and 85
  );

-- Condition/procedure vocabulary. Kept in step with TOOTH_CONDITIONS in
-- src/features/charting/chartVocabulary.ts — extending the vocabulary means
-- a migration, which is deliberate: these values are the chart's meaning.
alter table tooth_records
  add constraint tooth_records_condition_check
    check (condition in ('sound', 'decayed', 'filled', 'missing', 'crown', 'planned')),
  add constraint tooth_records_surface_check
    check (surface is null or surface in ('mesial', 'distal', 'buccal', 'lingual', 'occlusal')),
  -- Surface-scoped findings must name a surface; whole-tooth ones must not.
  add constraint tooth_records_surface_scope_check
    check ((condition in ('decayed', 'filled')) = (surface is not null));

-- The chart reads a patient's whole log in seq order and folds it per
-- tooth in memory, so index the shape it actually queries. The old
-- patient_id-only index is a strict prefix of this one.
drop index tooth_records_patient_id_idx;
create index tooth_records_patient_seq_idx on tooth_records (patient_id, seq);

-- --- Storage: keep per-tooth clinical images off the front desk ----------
--
-- 0003_storage.sql gave receptionist/dentist/admin read+write across the
-- whole patient-files bucket. tooth_records themselves are dentist/admin
-- only (0002_rls.sql), so the images hanging off them must be too —
-- otherwise the RLS boundary leaks through Storage. storage.objects
-- policies are permissive (OR'd), so the broad ones have to be replaced,
-- not merely supplemented.

drop policy "front desk rw select patient-files objects" on storage.objects;
drop policy "front desk rw insert patient-files objects" on storage.objects;

create policy "front desk rw select patient-files objects" on storage.objects for select
  using (
    bucket_id = 'patient-files'
    and coalesce((storage.foldername(name))[1], '') <> 'tooth'
    and current_staff_role() in ('receptionist', 'dentist', 'admin')
  );
create policy "front desk rw insert patient-files objects" on storage.objects for insert
  with check (
    bucket_id = 'patient-files'
    and coalesce((storage.foldername(name))[1], '') <> 'tooth'
    and current_staff_role() in ('receptionist', 'dentist', 'admin')
  );

create policy "clinical rw select tooth-image objects" on storage.objects for select
  using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = 'tooth'
    and current_staff_role() in ('dentist', 'admin')
  );
create policy "clinical rw insert tooth-image objects" on storage.objects for insert
  with check (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = 'tooth'
    and current_staff_role() in ('dentist', 'admin')
  );
