-- Clears the clinic's activity, keeping staff and patient records.
--
-- **This is irreversible and there is no verified backup.** docs/COMPLIANCE.md
-- still lists restorable backups as a blocking item: the dump path in
-- scripts/backup.sh has never been tested, and Storage objects are not backed
-- up at all. Take and *verify* a backup before running this, or accept that
-- what it deletes is gone.
--
-- KEPT
--   staff               accounts and roles
--   patients            the record, and with it
--   medical_histories   the intake answers
--   dental_histories
--   consents            signed consent rows and their signature images
--   procedures          the price list — configuration, not activity
--   clinic_settings     clinic name and hours
--
-- CLEARED
--   appointments, recalls          the diary
--   visits, visit_notes            what happened at them
--   tooth_records                  charts
--   invoices, invoice_items, payments, commission with them
--   daily_expenses, salary_entries the day's books
--   clinic_days                    end-of-day closures (and their locks)
--   patient_files                  attachment rows (see Storage note below)
--   audit_log                      the trail of all of the above
--
-- ORDER MATTERS, twice:
--   * clinic_days goes FIRST. While a day is closed, daily_entries_guard
--     (0020) refuses to delete that day's expenses and salary — for everyone,
--     admin included. Removing the closure is what unlocks them.
--   * audit_log goes LAST. Every delete above it fires 0006's audit trigger,
--     which writes new rows; clearing the log first would leave those behind.
--
-- Invoices are deleted before visits: invoices.visit_id has no ON DELETE
-- rule, so visits cannot go first.
--
-- STORAGE IS NOT TOUCHED. Deleting patient_files rows removes the app's list
-- of attachments, not the objects in the patient-files bucket. X-rays and ID
-- scans stay there until removed through the Supabase Storage UI. Consent
-- signatures are kept on purpose, and their rows still point at them.
--
-- Usage: paste into the Supabase SQL editor and run, or
--        psql "$SUPABASE_DB_URL" -f scripts/reset-clinic-data.sql

begin;

select
  (select count(*) from patients) || ' patients and ' ||
  (select count(*) from staff) || ' staff will be kept; clearing ' ||
  (select count(*) from appointments) || ' appointments, ' ||
  (select count(*) from visits) || ' visits, ' ||
  (select count(*) from invoices) || ' invoices, ' ||
  (select count(*) from payments) || ' payments, ' ||
  (select count(*) from clinic_days) || ' closed days'
  as about_to_clear;

-- The day's books. clinic_days first: it holds the lock on the other two.
delete from clinic_days;
delete from daily_expenses;
delete from salary_entries;

-- Money. Children first; invoice_items and payments cascade from invoices
-- anyway, but being explicit keeps the order readable.
delete from payments;
delete from invoice_items;
delete from invoices;

-- The diary and what happened at each visit.
delete from recalls;
delete from appointments;
delete from tooth_records;
delete from visit_notes;
delete from patient_files;
delete from visits;

-- Last: everything above wrote to it.
delete from audit_log;

select
  (select count(*) from staff) || ' staff, ' ||
  (select count(*) from patients) || ' patients, ' ||
  (select count(*) from medical_histories) || ' medical histories, ' ||
  (select count(*) from dental_histories) || ' dental histories, ' ||
  (select count(*) from consents) || ' consents, ' ||
  (select count(*) from procedures) || ' procedures kept'
  as kept;

select
  (select count(*) from appointments) + (select count(*) from visits) +
  (select count(*) from visit_notes) + (select count(*) from tooth_records) +
  (select count(*) from invoices) + (select count(*) from invoice_items) +
  (select count(*) from payments) + (select count(*) from recalls) +
  (select count(*) from daily_expenses) + (select count(*) from salary_entries) +
  (select count(*) from clinic_days) + (select count(*) from patient_files) +
  (select count(*) from audit_log)
  as rows_remaining_should_be_zero;

commit;
