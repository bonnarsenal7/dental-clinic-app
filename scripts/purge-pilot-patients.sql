-- Removes the Phase 7 pilot fixture patients.
--
-- **Run this before go-live.** Phase 8 migrates the clinic's real
-- historical records; fixture patients must not survive into a live system
-- where someone could mistake one for a real person.
--
-- Deletes by id prefix rather than by the remarks marker: an id is not
-- something a staff member can accidentally edit, whereas remarks is a
-- free-text field on the patient form that anyone could clear.
--
-- The cascade from `patients` takes medical and dental histories, consents,
-- visits, visit notes, tooth records, patient files, invoices, invoice
-- items and payments.
--
-- Two things deliberately survive:
--   * audit_log entries — patient_id is not a foreign key (0006_audit.sql),
--     so the record that these rows once existed and were deleted remains.
--     That is the point of an audit log.
--   * the procedure price list — that is real clinic configuration seeded
--     by scripts/seed-price-list.sql, not fixture data.
--
-- Storage objects are NOT removed. The fixtures reference placeholder
-- signature paths that were never uploaded, so there is nothing to clean;
-- if staff attached real files to a fixture patient during the pilot, those
-- objects stay in the bucket and need removing by hand.
--
-- Usage:  psql "$SUPABASE_DB_URL" -f scripts/purge-pilot-patients.sql

begin;

select count(*) || ' pilot patients about to be deleted' from patients where id::text like '5eed%';

delete from patients where id::text like '5eed%';

select
  (select count(*) from patients where id::text like '5eed%') || ' pilot patients remaining, ' ||
  (select count(*) from visits where id::text like '5eed%') || ' visits, ' ||
  (select count(*) from invoices where id::text like '5eed%') || ' invoices (all should be 0)';

commit;
