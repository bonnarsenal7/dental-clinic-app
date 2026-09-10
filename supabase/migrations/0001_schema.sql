-- Phase 1: core schema
-- Field lists are modeled on the clinic's real paper intake, history, and
-- consent forms (see CLAUDE.md / Requirements doc) rather than invented.

create extension if not exists pgcrypto;

create type staff_role as enum ('dentist', 'receptionist', 'admin');

-- One row per Supabase Auth user who is also clinic staff. id is the same
-- uuid as auth.users.id so RLS can key off auth.uid() directly.
create table staff (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  birthday date,
  age integer,
  sex text,
  height numeric,
  weight numeric,
  occupation text,
  spouse text,
  phone_number text,
  cell_number text,
  remarks text,
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create index patients_name_idx on patients using gin (to_tsvector('simple', name));
create index patients_cell_number_idx on patients (cell_number);
create index patients_phone_number_idx on patients (phone_number);

-- One row per patient (kept up to date, not versioned) — mirrors the
-- clinic's single-sheet medical history form.
create table medical_histories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references patients (id) on delete cascade,
  under_physician_care boolean,
  physician_name text,
  physician_phone text,
  hospitalized boolean,
  hospitalized_reason text,
  -- map of condition name -> boolean, e.g. { "angina": false, "diabetes": true, ... }
  -- keys: angina, tb, stroke, high_blood_pressure, asthma, emphysema,
  -- rheumatic_fever_arthritis, epilepsy, malignancy_tumor, hepatitis_a_or_b,
  -- hiv_positive, thyroid_problem, kidney_problems, diabetes, anemia,
  -- excessive_bleeding, ulcers, back_problems, other
  conditions jsonb not null default '{}'::jsonb,
  other_condition_details text,
  allergic_to_food_or_drug boolean,
  allergy_details text,
  current_medications boolean,
  medication_details text,
  allergic_to_anesthesia boolean,
  smokes boolean,
  updated_at timestamptz not null default now()
);

create table dental_histories (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references patients (id) on delete cascade,
  last_visit_date date,
  last_dental_problem text,
  previous_dentist_name text,
  previous_dentist_address text,
  -- keys: bleeding_gums, swollen_gums, sensitive_to_hot, sensitive_to_cold,
  -- sensitive_to_sweet, sensitive_to_pressure_or_biting,
  -- prolonged_bleeding_after_extraction, has_dentures_braces_or_retainers,
  -- lockjaw, food_stuck_between_teeth, bad_taste_or_odor
  symptoms jsonb not null default '{}'::jsonb,
  -- keys: thumb_sucking, nail_biting, teeth_grinding, other
  oral_habits jsonb not null default '{}'::jsonb,
  oral_habits_other_details text,
  updated_at timestamptz not null default now()
);

-- One row per signing event — the paper form is re-signed across visits,
-- so this is a log, not a single yes/no flag on the patient.
create table consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  staff_id uuid references staff (id),
  consent_text_version text not null,
  signature_image_url text not null,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Administrative visit record (date, who, which patient). Reception can
-- create/manage these. The dentist's write-up of the visit lives in
-- visit_notes instead, so it can be locked down separately (see 0002_rls.sql).
create table visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  staff_id uuid references staff (id),
  visit_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index visits_patient_id_idx on visits (patient_id);

-- Clinical notes, split out from visits so reception can have zero access
-- (not even read) to what a dentist wrote, per the access rule confirmed
-- for this build. One notes record per visit.
create table visit_notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references visits (id) on delete cascade,
  notes text not null default '',
  created_by uuid references staff (id),
  updated_at timestamptz not null default now()
);

-- FDI tooth numbering (11-48 permanent, 51-85 primary) — matches the
-- clinic's existing paper chart. Clinical data: no reception access.
create table tooth_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  visit_id uuid references visits (id) on delete cascade,
  tooth_number smallint not null,
  surface text,
  condition text not null,
  created_at timestamptz not null default now()
);

create index tooth_records_patient_id_idx on tooth_records (patient_id);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  visit_id uuid references visits (id),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'void')),
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index invoices_patient_id_idx on invoices (patient_id);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount numeric(12, 2) not null,
  method text not null check (method in ('cash', 'card', 'bank_transfer', 'other')),
  paid_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff (id),
  action text not null,
  table_name text not null,
  record_id uuid,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on audit_log (created_at desc);

-- Singleton settings row (Phase 1 task 7: clinic name + operating hours).
create table clinic_settings (
  id smallint primary key default 1 check (id = 1),
  clinic_name text not null default '',
  operating_hours text not null default '',
  updated_at timestamptz not null default now()
);

insert into clinic_settings (id, clinic_name, operating_hours) values (1, '', '');
