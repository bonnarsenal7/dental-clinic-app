-- Records who actually signed a consent, and on what authority.
--
-- The registration screen has always invited "the patient (or
-- parent/guardian)" to sign, but `consents` stored only the patient_id and
-- the signature image. A guardian's signature was therefore indistinguishable
-- from the patient's own, while the wording of CONSENT_TEXT is in the
-- patient's voice ("I consent"). For a clinic that treats children that is a
-- gap in the record, not a cosmetic one: the question a consent form exists
-- to answer is who agreed, and whether they were entitled to.
--
-- Both columns are NULLABLE on purpose. Ten consents already exist and
-- nothing in the system knows who signed them. Backfilling 'self' would be
-- inventing a fact about a document somebody already put their name to,
-- which is precisely the kind of thing a consent log must not do. A null
-- here means "signed before this was recorded" and should read that way in
-- the UI.

alter table consents
  add column signed_by_name text,
  add column signer_relationship text;

comment on column consents.signed_by_name is
  'Printed name of the person who physically signed. Null on rows written before 0010.';
comment on column consents.signer_relationship is
  'How the signer is entitled to consent. Null on rows written before 0010.';

-- 'representative' covers a legally appointed attorney or carer for an adult
-- who cannot consent for themselves. Widening this list means a migration,
-- which is deliberate: these are the authorities the clinic accepts.
alter table consents
  add constraint consents_signer_relationship_check
  check (signer_relationship in ('self', 'parent', 'guardian', 'representative'));

-- Either both are recorded or neither is. A name with no stated authority,
-- or an authority with no name, is a half-record that looks complete in a
-- list and answers nothing when it matters.
alter table consents
  add constraint consents_signer_complete_check
  check (
    (signed_by_name is null and signer_relationship is null)
    or (signed_by_name is not null and signer_relationship is not null)
  );

-- Note: consents remains insert/select only for every role (0002_rls.sql).
-- These columns are write-once like the rest of the row -- a correction is a
-- new signing event, not an edit to an old one.
