-- Clears every patient record and everything hanging off one, while keeping
-- the things that are configuration rather than data.
--
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/clear-clinical-data.sql
--
-- KEPT deliberately:
--   staff            - the login accounts. Truncating these locks everyone
--                      out, including the admin, and recovery means
--                      re-bootstrapping the first admin by hand in the SQL
--                      editor (see CLAUDE.md).
--   procedures       - the price list. Configuration the clinic set up, not
--                      test data; scripts/seed-price-list.sql exists to
--                      create it and it is meant to survive a purge.
--   clinic_settings  - the clinic's name and hours.
--   audit_log        - append-only by design, and deliberately outlives the
--                      records it describes. Wiping it would destroy the
--                      evidence that any of this data ever existed.
--
-- DELETE rather than TRUNCATE, on purpose. Truncate does not fire row-level
-- triggers, so 0006's audit trigger would not record that this happened.
-- Clearing a clinic's records is exactly the kind of event the log exists
-- for, so this run writes its own audit trail as it goes.
--
-- Ordered parent-last. Most of this would cascade from `patients` alone,
-- but invoices.visit_id is NO ACTION rather than CASCADE, so doing it
-- explicitly keeps the order deterministic instead of relying on the
-- planner to resolve it.
--
-- TAKE A BACKUP FIRST. scripts/backup.sh, and check the dump actually
-- contains `COPY public.patients` before trusting it. At the time of
-- writing the project has no automated backups and PITR is disabled
-- (docs/TECHNICAL_REVIEW.md F-3), so there is no other way back.
--
-- Storage objects are NOT removed by this. Signature images and
-- attachments stay in the `patient-files` bucket as orphans; clear them
-- separately if they matter.

begin;

select
  (select count(*) from patients) || ' patients about to be deleted, with '
  || (select count(*) from visits) || ' visits, '
  || (select count(*) from invoices) || ' invoices and '
  || (select count(*) from tooth_records) || ' chart entries'
  as about_to_delete;

delete from payments;
delete from invoice_items;
delete from invoices;
delete from tooth_records;
delete from visit_notes;
delete from appointments;
delete from recalls;
delete from visits;
delete from consents;
delete from medical_histories;
delete from dental_histories;
delete from patient_files;
delete from patients;

select 'patients' as cleared, count(*) as remaining from patients
union all select 'visits', count(*) from visits
union all select 'visit_notes', count(*) from visit_notes
union all select 'tooth_records', count(*) from tooth_records
union all select 'invoices', count(*) from invoices
union all select 'invoice_items', count(*) from invoice_items
union all select 'payments', count(*) from payments
union all select 'appointments', count(*) from appointments
union all select 'recalls', count(*) from recalls
union all select 'consents', count(*) from consents
union all select 'medical_histories', count(*) from medical_histories
union all select 'dental_histories', count(*) from dental_histories
union all select 'patient_files', count(*) from patient_files
union all select 'KEPT staff', count(*) from staff
union all select 'KEPT procedures', count(*) from procedures
union all select 'KEPT clinic_settings', count(*) from clinic_settings
union all select 'KEPT audit_log', count(*) from audit_log
order by 1;

commit;
