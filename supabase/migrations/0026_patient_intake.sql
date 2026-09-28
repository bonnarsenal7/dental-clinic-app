-- Patient self-intake: a new patient types their own details on a screen
-- that has no staff login behind it.
--
-- The front desk used to hand over a tablet signed in as reception, and the
-- patient then held reception's permissions — every patient, every history,
-- every invoice — however the screen was locked. Hiding the navigation does
-- not change what the token in the browser can read.
--
-- So the patient's screen is served from a second address
-- (toothco-intake.vercel.app), where no staff member has ever signed in, and
-- it talks to the database as `anon`. What `anon` may do is exactly two
-- functions below, and neither reads anything back:
--
--   intake_status(code)   is this code still good? ('ready' / 'used' / ...)
--   submit_intake(code, …) hand in one form, once
--
-- The flow:
--   1. reception presses Start patient intake → start_intake() returns a
--      one-time code (only its hash is stored)
--   2. the patient fills the form at /#<code> on the intake address
--   3. submit_intake() files it in intake_submissions and spends the code
--   4. reception reviews it, and accept_intake() creates the patient, both
--      histories and the consent in one transaction — or discards it
--
-- What a patient types goes into a staging table, not straight into
-- `patients`. Reception reads it first: a returning patient registering
-- themselves twice, or a typo in a cell number, is caught before it is a
-- record. Once reviewed, the staged copy of the medical history is erased —
-- the audit log keeps the fact that an intake happened, not a second copy of
-- what it said.

-- --- one-time codes -----------------------------------------------------------

create table intake_sessions (
  id uuid primary key default gen_random_uuid(),
  -- sha256 of the code. The code itself exists only in the URL of the one
  -- tab it was opened in, so a leaked table is not a list of usable links.
  code_hash text not null unique,
  created_by uuid references staff (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

comment on table intake_sessions is
  'One-time codes for the patient intake screen. Touched only by the intake functions; no role reads it directly.';

-- RLS on, no policies: nobody reads or writes this table except through the
-- SECURITY DEFINER functions below.
alter table intake_sessions enable row level security;

-- --- what the patient handed in ----------------------------------------------

create table intake_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references intake_sessions (id),
  -- Reserved now, becomes patients.id on acceptance. Not a foreign key: the
  -- patient does not exist yet. Reserving it lets the signature be uploaded
  -- to its final path before the patient row is written, and makes a retried
  -- acceptance land on the same place rather than beside it.
  patient_id uuid not null default gen_random_uuid(),
  -- The registration form's values, patient_type removed (reception decides
  -- that). Erased once reviewed.
  payload jsonb,
  -- The signature as a PNG data URL. The patient cannot write to Storage, so
  -- it waits here until reception accepts and uploads it. Erased once reviewed.
  signature_png text,
  signed_by_name text,
  signer_relationship text,
  consent_text_version text,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending',
  reviewed_by uuid references staff (id),
  reviewed_at timestamptz,

  constraint intake_submissions_status_check
    check (status in ('pending', 'accepted', 'discarded')),
  -- Mirrors consents_signer_relationship_check (0010).
  constraint intake_submissions_signer_relationship_check
    check (signer_relationship is null
           or signer_relationship in ('self', 'parent', 'guardian', 'representative')),
  -- A pending intake carries everything acceptance needs; a reviewed one
  -- carries none of it.
  constraint intake_submissions_payload_matches_status
    check ((status = 'pending') = (payload is not null))
);

create index intake_submissions_pending_idx on intake_submissions (submitted_at)
  where status = 'pending';

comment on table intake_submissions is
  'Patient-typed registrations awaiting front-desk review. Written only by submit_intake(); payload and signature are erased once accepted or discarded.';

-- Reviewing is one move, and it is final: pending → accepted or discarded.
-- Nothing the patient typed can be edited here — corrections are made on the
-- patient record after acceptance, where they are ordinary edits.
create or replace function public.intake_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'This intake has already been reviewed.'
      using errcode = 'check_violation';
  end if;
  if new.session_id is distinct from old.session_id
     or new.patient_id is distinct from old.patient_id
     or new.submitted_at is distinct from old.submitted_at
     or new.signed_by_name is distinct from old.signed_by_name
     or new.signer_relationship is distinct from old.signer_relationship
     or new.consent_text_version is distinct from old.consent_text_version
     or (new.status = 'pending' and (new.payload is distinct from old.payload
                                      or new.signature_png is distinct from old.signature_png)) then
    raise exception 'What a patient submitted cannot be edited. Accept it, then correct the record.'
      using errcode = 'check_violation';
  end if;

  if new.status <> 'pending' then
    new.payload := null;
    new.signature_png := null;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger intake_submissions_guard
  before update on intake_submissions
  for each row execute function public.intake_submissions_guard();

alter table intake_submissions enable row level security;

-- The front desk registers patients, so the front desk reviews intakes. Not
-- the dentist: registration is not theirs (see "The dentist's view").
create policy "front desk reads intakes" on intake_submissions for select
  using (current_staff_role() in ('receptionist', 'admin'));
create policy "front desk reviews intakes" on intake_submissions for update
  using (current_staff_role() in ('receptionist', 'admin'))
  with check (current_staff_role() in ('receptionist', 'admin'));
create policy "admin deletes intakes" on intake_submissions for delete
  using (current_staff_role() = 'admin');
-- No insert policy: submit_intake() is the only way in.

-- --- starting one (reception) ------------------------------------------------

create or replace function public.start_intake()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  if coalesce(public.current_staff_role()::text, '') not in ('receptionist', 'admin') then
    raise exception 'Only the front desk can start a patient intake.'
      using errcode = 'insufficient_privilege';
  end if;

  -- 144 random bits, URL-safe. Not guessable, so the code alone is the
  -- permission to hand in one form.
  v_code := rtrim(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '=');

  insert into intake_sessions (code_hash, created_by, expires_at)
  values (encode(digest(v_code, 'sha256'), 'hex'), auth.uid(), now() + interval '2 hours');

  return v_code;
end;
$$;

comment on function public.start_intake() is
  'Issues a one-time intake code, valid for two hours. Reception and admin only.';

-- --- the patient's side (anon) -----------------------------------------------

create or replace function public.intake_status(p_code text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select case
              when s.used_at is not null then 'used'
              when s.expires_at <= now() then 'expired'
              else 'ready'
            end
       from intake_sessions s
      where s.code_hash = encode(digest(coalesce(p_code, ''), 'sha256'), 'hex')),
    'unknown');
$$;

comment on function public.intake_status(text) is
  'Whether an intake code can still be used. Returns a word, never data. Callable without a login.';

create or replace function public.submit_intake(
  p_code text,
  p_payload jsonb,
  p_signature_png text,
  p_signed_by_name text,
  p_signer_relationship text,
  p_consent_text_version text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_session intake_sessions%rowtype;
begin
  -- FOR UPDATE: two taps on Submit, or two tabs, cannot both spend the code.
  select * into v_session
    from intake_sessions
   where code_hash = encode(digest(coalesce(p_code, ''), 'sha256'), 'hex')
   for update;

  if not found then
    raise exception 'This form link is not valid. Please ask reception for a new one.'
      using errcode = 'check_violation';
  end if;
  if v_session.used_at is not null then
    raise exception 'This form has already been submitted. Please hand the tablet back to reception.'
      using errcode = 'check_violation';
  end if;
  if v_session.expires_at <= now() then
    raise exception 'This form has expired. Please ask reception to start a new one.'
      using errcode = 'check_violation';
  end if;

  -- The endpoint is reachable with any HTTP client, so shape and size are
  -- checked here and not only by the form. The real form is a few kB; the
  -- signature a few tens of kB.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536
     or coalesce(btrim(p_payload ->> 'name'), '') = '' then
    raise exception 'The form is incomplete. Please check your name and try again.'
      using errcode = 'check_violation';
  end if;
  if p_signature_png is null
     or p_signature_png not like 'data:image/png;base64,%'
     or length(p_signature_png) > 1000000 then
    raise exception 'Please sign before submitting.'
      using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_signed_by_name), '') = ''
     or coalesce(p_signer_relationship, '') = ''
     or coalesce(btrim(p_consent_text_version), '') = '' then
    raise exception 'Enter the name of the person signing.'
      using errcode = 'check_violation';
  end if;

  update intake_sessions set used_at = now() where id = v_session.id;

  insert into intake_submissions (
    session_id, payload, signature_png, signed_by_name, signer_relationship, consent_text_version
  ) values (
    v_session.id,
    -- The category is the front desk's call (0023), not the patient's.
    p_payload - 'patient_type',
    p_signature_png,
    btrim(p_signed_by_name),
    p_signer_relationship,
    btrim(p_consent_text_version)
  );
end;
$$;

comment on function public.submit_intake(text, jsonb, text, text, text, text) is
  'Files one patient-typed registration against a valid, unused intake code, and spends the code. Callable without a login; returns nothing.';

-- --- accepting one (reception) -----------------------------------------------
--
-- SECURITY INVOKER: it runs with the reviewer's own rights, so the inserts
-- below pass through the same RLS as registering a patient by hand. What it
-- adds is that the patient, both histories, the consent and the review all
-- land in one transaction — the by-hand path (registerPatient in api.ts) can
-- leave a patient without histories if a later insert fails, and a retry here
-- would otherwise create the same person twice.
--
-- The column mapping mirrors registerPatient(): blank text is null, numbers
-- are parsed. **Keep the two in step** when a field is added to the form.
--
-- The signature is uploaded by the caller first, to
-- signatures/<patient_id>/intake-<id>.png, because Storage is written over
-- HTTP, not from SQL.
create or replace function public.accept_intake(
  p_intake_id uuid,
  p_patient_type text,
  p_signature_path text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  s intake_submissions%rowtype;
  p jsonb;
begin
  select * into s from intake_submissions where id = p_intake_id for update;
  if not found then
    raise exception 'That intake could not be found.' using errcode = 'no_data_found';
  end if;
  if s.status <> 'pending' then
    raise exception 'This intake has already been reviewed.' using errcode = 'check_violation';
  end if;
  if coalesce(p_signature_path, '') not like 'signatures/' || s.patient_id || '/%' then
    raise exception 'The signature was not uploaded for this patient.' using errcode = 'check_violation';
  end if;

  p := s.payload;

  insert into patients (
    id, patient_type, name, address, birthday, age, sex, height, weight,
    occupation, spouse, phone_number, cell_number, remarks, created_by
  ) values (
    s.patient_id,
    coalesce(p_patient_type, 'regular'),
    btrim(p ->> 'name'),
    nullif(btrim(p ->> 'address'), ''),
    nullif(btrim(p ->> 'birthday'), '')::date,
    nullif(btrim(p ->> 'age'), '')::integer,
    nullif(btrim(p ->> 'sex'), ''),
    nullif(btrim(p ->> 'height'), '')::numeric,
    nullif(btrim(p ->> 'weight'), '')::numeric,
    nullif(btrim(p ->> 'occupation'), ''),
    nullif(btrim(p ->> 'spouse'), ''),
    nullif(btrim(p ->> 'phone_number'), ''),
    nullif(btrim(p ->> 'cell_number'), ''),
    nullif(btrim(p ->> 'remarks'), ''),
    auth.uid()
  );

  insert into medical_histories (
    patient_id, under_physician_care, physician_name, physician_phone,
    hospitalized, hospitalized_reason, conditions, other_condition_details,
    allergic_to_food_or_drug, allergy_details, current_medications,
    medication_details, allergic_to_anesthesia, smokes
  ) values (
    s.patient_id,
    (p ->> 'under_physician_care')::boolean,
    nullif(btrim(p ->> 'physician_name'), ''),
    nullif(btrim(p ->> 'physician_phone'), ''),
    (p ->> 'hospitalized')::boolean,
    nullif(btrim(p ->> 'hospitalized_reason'), ''),
    coalesce(p -> 'conditions', '{}'::jsonb),
    nullif(btrim(p ->> 'other_condition_details'), ''),
    (p ->> 'allergic_to_food_or_drug')::boolean,
    nullif(btrim(p ->> 'allergy_details'), ''),
    (p ->> 'current_medications')::boolean,
    nullif(btrim(p ->> 'medication_details'), ''),
    (p ->> 'allergic_to_anesthesia')::boolean,
    (p ->> 'smokes')::boolean
  );

  insert into dental_histories (
    patient_id, last_visit_date, last_dental_problem, previous_dentist_name,
    previous_dentist_address, symptoms, oral_habits, oral_habits_other_details
  ) values (
    s.patient_id,
    nullif(btrim(p ->> 'last_visit_date'), '')::date,
    nullif(btrim(p ->> 'last_dental_problem'), ''),
    nullif(btrim(p ->> 'previous_dentist_name'), ''),
    nullif(btrim(p ->> 'previous_dentist_address'), ''),
    coalesce(p -> 'symptoms', '{}'::jsonb),
    coalesce(p -> 'oral_habits', '{}'::jsonb),
    nullif(btrim(p ->> 'oral_habits_other_details'), '')
  );

  -- signed_at is when the patient signed, not when reception got round to
  -- accepting it. staff_id is the reviewer: nobody from the clinic was
  -- beside the patient, and the record should not claim otherwise.
  insert into consents (
    patient_id, staff_id, consent_text_version, signature_image_url,
    signed_by_name, signer_relationship, signed_at
  ) values (
    s.patient_id, auth.uid(), s.consent_text_version, p_signature_path,
    s.signed_by_name, s.signer_relationship, s.submitted_at
  );

  update intake_submissions set status = 'accepted' where id = s.id;

  return s.patient_id;
end;
$$;

comment on function public.accept_intake(uuid, text, text) is
  'Turns a pending intake into a patient, both histories and a consent, in one transaction. Runs with the caller''s own RLS.';

-- --- who may call what -------------------------------------------------------

revoke all on function public.start_intake() from public;
revoke all on function public.intake_status(text) from public;
revoke all on function public.submit_intake(text, jsonb, text, text, text, text) from public;
revoke all on function public.accept_intake(uuid, text, text) from public;

grant execute on function public.start_intake() to authenticated;
grant execute on function public.intake_status(text) to anon, authenticated;
grant execute on function public.submit_intake(text, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function public.accept_intake(uuid, text, text) to authenticated;

-- --- audit -------------------------------------------------------------------
-- Patient data, so 0006's trigger records every submission and review. The
-- patient_id it logs is the reserved one, which is the patient's real id once
-- accepted — so the intake shows up in that patient's access history.
create trigger audit_intake_submissions
  after insert or update or delete on intake_submissions
  for each row execute function public.audit_row_change();
