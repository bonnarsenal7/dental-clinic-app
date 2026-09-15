-- Pilot fixture patients — NOT REAL PEOPLE.
--
-- Phase 7 needs a realistic dataset so staff can exercise search, charting,
-- billing and the ledger against something that behaves like a real day's
-- list, rather than against three records named after the developer.
--
-- Two safety properties, both deliberate:
--
-- Addresses are in Davao City, where the clinic is. A pilot that searches
-- for a patient and reads back a Metro Manila address teaches staff to
-- distrust the data.
--
--  1. Every fixture patient's `remarks` starts with the marker below and is
--     visible on their profile. A realistic name with an unmistakable label
--     beats an obviously fake name that nobody would ever search for.
--  2. Every id begins `5eed` (leetspeak for "seed", and valid hex), so
--     fixture rows are identifiable at a glance and the purge is exact
--     rather than a heuristic on names.
--
-- **Purge before go-live** with scripts/purge-pilot-patients.sql. Phase 8
-- migrates real historical records and fixture patients must not survive
-- into that.
--
-- Re-runnable: it deletes its own rows first, so it always yields the same
-- dataset rather than duplicating it.
--
-- Usage:  psql "$SUPABASE_DB_URL" -f scripts/seed-pilot-patients.sql

begin;

-- Clear any previous run. Cascades take histories, consents, visits, notes,
-- tooth records, invoices, items and payments. audit_log.patient_id is not
-- a foreign key (0006_audit.sql), so the audit trail of the fixtures' own
-- creation survives — which is correct, and worth seeing in /admin/audit.
delete from patients where id::text like '5eed%';

-- Attribute work to whichever accounts this environment actually has,
-- rather than hardcoding ids that differ between projects.
create temp table actors on commit drop as
  select
    (select id from staff where role = 'dentist' and active order by created_at limit 1) as dentist,
    (select id from staff where role = 'admin' and active order by created_at limit 1) as admin;

insert into patients (id, name, address, birthday, age, sex, height, weight,
                      occupation, spouse, phone_number, cell_number, remarks, created_by, created_at)
select v.id::uuid, v.name, v.address, v.birthday::date, v.age, v.sex, v.height, v.weight,
       v.occupation, v.spouse, v.phone_number, v.cell_number,
       '[PILOT DATA — not a real patient]' || coalesce(' ' || v.note, ''),
       actors.admin,
       now() - (v.days_ago || ' days')::interval
from actors, (values
  ('5eed0001-0000-4000-8000-000000000001','Maria Clara Santos',  'Blk 12 Lot 4, Brgy. Catalunan Grande, Davao City'      , '1988-03-14',38,'F',158,52,'Teacher',           'Ramon Santos',     '(082) 227 4412','0917 555 0142','Prefers morning appointments.',            380),
  ('5eed0002-0000-4000-8000-000000000002','Jose Miguel Reyes',   '22 Mabini St., Brgy. Poblacion, Davao City'            , '1975-11-02',50,'M',172,78,'Civil engineer',    'Anna Reyes',       '(082) 221 9075','0918 555 0233','Anxious patient — explain each step.',     310),
  ('5eed0003-0000-4000-8000-000000000003','Angelica Dela Cruz',  '7-B Sampaguita St., Brgy. Matina Crossing, Davao City' , '1996-07-21',29,'F',162,55,'Nurse',             null,               null,            '0920 555 0388','Works night shifts.',                     260),
  ('5eed0004-0000-4000-8000-000000000004','Ricardo Bautista',    '145 Quirino Ave., Brgy. Bucana, Davao City'            , '1962-01-30',64,'M',168,85,'Retired',           'Lourdes Bautista', '(082) 295 3318','0927 555 0411','Hypertensive — check BP before extraction.',215),
  ('5eed0005-0000-4000-8000-000000000005','Kristine Joy Aquino', '3rd Flr, 88 J.P. Laurel Ave., Brgy. Bajada, Davao City', '2001-09-09',24,'F',155,48,'Call centre agent', null,               null,            '0905 555 0577',null,                                      180),
  ('5eed0006-0000-4000-8000-000000000006','Paolo Antonio Garcia','19 Mt. Apo St., Brgy. Poblacion, Davao City'           , '1993-05-17',32,'M',177,80,'Graphic designer',  null,               null,            '0939 555 0620','Grinds teeth — nightguard discussed.',     140),
  ('5eed0007-0000-4000-8000-000000000007','Lorna Villanueva',    '56 C.M. Recto Ave., Brgy. Poblacion, Davao City'       , '1970-12-25',55,'F',160,68,'Accountant',        'Edgar Villanueva', '(082) 233 6720','0916 555 0733','Diabetic — see medical history.',          95),
  ('5eed0008-0000-4000-8000-000000000008','Nathaniel Ocampo',    'Blk 3 Lot 22, Brgy. Sasa, Davao City'                  , '2015-04-08',10,'M',138,32,'Student',           null,               '(082) 244 8153','0995 555 0844','Paediatric — accompanied by mother.',      60),
  ('5eed0009-0000-4000-8000-000000000009','Divina Gracia Lim',   '401 Ilustre St., Brgy. Poblacion, Davao City'          , '1984-08-19',41,'F',165,60,'Pharmacist',        'Wilson Lim',       null,            '0908 555 0955',null,                                      30),
  ('5eed0010-0000-4000-8000-000000000010','Fernando Castillo',   '77 Ecoland Drive, Brgy. Matina, Davao City'            , '1958-06-11',67,'M',170,74,'Retired seafarer',  'Remedios Castillo','(082) 285 1094','0947 555 0166','Wears upper partial denture.',             12)
) as v(id,name,address,birthday,age,sex,height,weight,occupation,spouse,phone_number,cell_number,note,days_ago);

-- Medical histories. A spread of real conditions, because the point of the
-- pilot is that a dentist sees an allergy warning before treating someone.
insert into medical_histories (patient_id, under_physician_care, physician_name, hospitalized,
                               conditions, allergic_to_food_or_drug, allergy_details,
                               current_medications, medication_details, allergic_to_anesthesia, smokes)
select v.pid::uuid, v.care, v.doc, v.hosp, v.cond::jsonb, v.allergy, v.allergy_detail,
       v.meds, v.meds_detail, v.anes, v.smokes
from (values
  ('5eed0001-0000-4000-8000-000000000001', false, null,           false, '{}',                                          false, null,                 false, null,                       false, false),
  ('5eed0002-0000-4000-8000-000000000002', false, null,           false, '{"high_blood_pressure": true}',               true,  'Penicillin',         true,  'Losartan 50mg daily',      false, true),
  ('5eed0003-0000-4000-8000-000000000003', false, null,           false, '{"asthma": true}',                            false, null,                 true,  'Salbutamol inhaler PRN',   false, false),
  ('5eed0004-0000-4000-8000-000000000004', true,  'Dr. E. Mendoza', true, '{"high_blood_pressure": true, "angina": true}', false, null,               true,  'Amlodipine, Aspirin 80mg', true,  false),
  ('5eed0005-0000-4000-8000-000000000005', false, null,           false, '{}',                                          false, null,                 false, null,                       false, true),
  ('5eed0006-0000-4000-8000-000000000006', false, null,           false, '{}',                                          false, null,                 false, null,                       false, false),
  ('5eed0007-0000-4000-8000-000000000007', true,  'Dr. R. Tan',   false, '{"diabetes": true, "high_blood_pressure": true}', true, 'Sulfa drugs',     true,  'Metformin 500mg twice daily', false, false),
  ('5eed0008-0000-4000-8000-000000000008', false, null,           false, '{}',                                          false, null,                 false, null,                       false, false),
  ('5eed0009-0000-4000-8000-000000000009', false, null,           false, '{"thyroid_problem": true}',                   false, null,                 true,  'Levothyroxine 50mcg',      false, false),
  ('5eed0010-0000-4000-8000-000000000010', true,  'Dr. E. Mendoza', true, '{"high_blood_pressure": true, "stroke": true}', false, null,              true,  'Clopidogrel, Atorvastatin', false, false)
) as v(pid, care, doc, hosp, cond, allergy, allergy_detail, meds, meds_detail, anes, smokes);

insert into dental_histories (patient_id, last_visit_date, last_dental_problem, previous_dentist_name, symptoms, oral_habits)
select v.pid::uuid, v.last_visit::date, v.problem, v.prev_dentist, v.symptoms::jsonb, v.habits::jsonb
from (values
  ('5eed0001-0000-4000-8000-000000000001','2024-11-10','Routine cleaning',        'Dr. Lim Dental Clinic', '{}',                                              '{}'),
  ('5eed0002-0000-4000-8000-000000000002','2023-06-02','Toothache upper left',    null,                    '{"sensitive_to_cold": true, "bleeding_gums": true}','{}'),
  ('5eed0003-0000-4000-8000-000000000003','2025-01-18','Cleaning',                null,                    '{"bleeding_gums": true}',                         '{"nail_biting": true}'),
  ('5eed0004-0000-4000-8000-000000000004','2022-09-30','Extraction lower right',  'Smile Center Lanang' ,  '{"food_stuck_between_teeth": true}',              '{}'),
  ('5eed0005-0000-4000-8000-000000000005',null,        null,                      null,                    '{"sensitive_to_sweet": true}',                    '{}'),
  ('5eed0006-0000-4000-8000-000000000006','2024-03-22','Jaw pain on waking',      null,                    '{"sensitive_to_pressure_or_biting": true}',       '{"teeth_grinding": true}'),
  ('5eed0007-0000-4000-8000-000000000007','2025-05-14','Swollen gums',            'Dr. Lim Dental Clinic', '{"swollen_gums": true, "bleeding_gums": true}',    '{}'),
  ('5eed0008-0000-4000-8000-000000000008','2025-08-01','Check-up',                null,                    '{}',                                              '{"thumb_sucking": true}'),
  ('5eed0009-0000-4000-8000-000000000009','2024-12-05','Cleaning',                null,                    '{}',                                              '{}'),
  ('5eed0010-0000-4000-8000-000000000010','2025-02-11','Loose denture',           'Smile Center Lanang' ,  '{"has_dentures_braces_or_retainers": true}',       '{}')
) as v(pid, last_visit, problem, prev_dentist, symptoms, habits);

-- Signed consent for most of them. One (Kristine Joy Aquino) is left
-- unsigned on purpose, so the pilot exercises the "no signed consent on
-- file yet" path rather than only the happy one.
-- 0010 records who signed and on what authority. Nathaniel Ocampo is ten,
-- so his mother signs — which is the case the columns exist for, and the
-- one worth having on screen during the pilot.
insert into consents (patient_id, staff_id, consent_text_version, signature_image_url, signed_at,
                      signed_by_name, signer_relationship)
select p.id, actors.admin, 'v3-draft',
       'signatures/' || p.id || '/pilot-placeholder.png',
       p.created_at + interval '10 minutes',
       case when p.id = '5eed0008-0000-4000-8000-000000000008'::uuid
            then 'Teresita Ocampo' else p.name end,
       case when p.id = '5eed0008-0000-4000-8000-000000000008'::uuid
            then 'parent' else 'self' end
from patients p, actors
where p.id::text like '5eed%'
  and p.id <> '5eed0005-0000-4000-8000-000000000005'::uuid;

-- Visits, with the dentist's write-up. Spread across months so the
-- timeline and the ledger have something to order.
insert into visits (id, patient_id, staff_id, visit_date)
select v.id::uuid, v.pid::uuid, actors.dentist, now() - (v.days_ago || ' days')::interval
from actors, (values
  ('5eed1001-0000-4000-8000-000000000001','5eed0001-0000-4000-8000-000000000001',370),
  ('5eed1002-0000-4000-8000-000000000002','5eed0001-0000-4000-8000-000000000001',120),
  ('5eed1003-0000-4000-8000-000000000003','5eed0002-0000-4000-8000-000000000002',300),
  ('5eed1004-0000-4000-8000-000000000004','5eed0002-0000-4000-8000-000000000002', 44),
  ('5eed1005-0000-4000-8000-000000000005','5eed0004-0000-4000-8000-000000000004',200),
  ('5eed1006-0000-4000-8000-000000000006','5eed0006-0000-4000-8000-000000000006',130),
  ('5eed1007-0000-4000-8000-000000000007','5eed0007-0000-4000-8000-000000000007', 88),
  ('5eed1008-0000-4000-8000-000000000008','5eed0008-0000-4000-8000-000000000008', 55),
  ('5eed1009-0000-4000-8000-000000000009','5eed0010-0000-4000-8000-000000000010', 10),
  -- Today's three, so the schedule has real bills behind it rather than
  -- appointments with nothing attached. Each one puts a different stage of
  -- the billing lifecycle on the pilot's first screen.
  ('5eed1010-0000-4000-8000-000000000010','5eed0007-0000-4000-8000-000000000007',  0),
  ('5eed1011-0000-4000-8000-000000000011','5eed0006-0000-4000-8000-000000000006',  0),
  ('5eed1012-0000-4000-8000-000000000012','5eed0001-0000-4000-8000-000000000001',  0)
) as v(id, pid, days_ago);

insert into visit_notes (visit_id, notes, created_by)
select v.vid::uuid, v.note, actors.dentist
from actors, (values
  ('5eed1001-0000-4000-8000-000000000001','Routine check-up and oral prophylaxis. Generalised mild calculus. Advised flossing nightly. Recall 6 months.'),
  ('5eed1002-0000-4000-8000-000000000002','Occlusal caries 16. Composite restoration placed under LA, no complications. Patient tolerated well.'),
  ('5eed1003-0000-4000-8000-000000000003','C/O pain upper left, 3 days. Deep occlusal caries 26. Temporary dressing placed, RCT discussed and scheduled.'),
  ('5eed1004-0000-4000-8000-000000000004','Reviewed 26. Patient anxious; walked through each step. Advised to return for definitive restoration.'),
  ('5eed1005-0000-4000-8000-000000000005','BP 145/90 checked before treatment — cleared. Simple extraction 46, retained root. Haemostasis achieved, post-op given.'),
  ('5eed1006-0000-4000-8000-000000000006','Attrition on posterior teeth consistent with bruxism. Nightguard impression taken. Discussed stress triggers.'),
  ('5eed1007-0000-4000-8000-000000000007','Generalised gingival inflammation, consistent with poorly controlled diabetes. Prophylaxis done. Referred to physician for HbA1c.'),
  ('5eed1008-0000-4000-8000-000000000008','Paediatric check-up with mother present. Fissure sealants placed on 36 and 46. Thumb-sucking discussed with parent.'),
  ('5eed1009-0000-4000-8000-000000000009','Upper partial denture loose. Relined chairside. Reviewed hygiene of denture and remaining abutments.'),
  ('5eed1010-0000-4000-8000-000000000010','Gum review. Generalised inflammation improving since last prophylaxis. Scaling in progress.'),
  ('5eed1011-0000-4000-8000-000000000011','Attrition reviewed. Composite restoration 17 placed, panoramic taken. Nightguard impression next visit.'),
  ('5eed1012-0000-4000-8000-000000000012','Oral prophylaxis. Light calculus lower anteriors. Nothing else of note.')
) as v(vid, note);

-- Tooth records. Written in one insert, so seq orders them exactly as
-- listed and the chart folds the way this file reads.
insert into tooth_records (patient_id, visit_id, tooth_number, surface, condition, created_by)
select v.pid::uuid, v.vid::uuid, v.tooth, v.surface, v.condition, actors.dentist
from actors, (values
  ('5eed0001-0000-4000-8000-000000000001','5eed1002-0000-4000-8000-000000000002',16,'occlusal','decayed'),
  ('5eed0001-0000-4000-8000-000000000001','5eed1002-0000-4000-8000-000000000002',16,'occlusal','filled'),
  ('5eed0001-0000-4000-8000-000000000001','5eed1002-0000-4000-8000-000000000002',36,'mesial','filled'),
  ('5eed0002-0000-4000-8000-000000000002','5eed1003-0000-4000-8000-000000000003',26,'occlusal','decayed'),
  ('5eed0002-0000-4000-8000-000000000002','5eed1004-0000-4000-8000-000000000004',26,null,'planned'),
  ('5eed0002-0000-4000-8000-000000000002','5eed1003-0000-4000-8000-000000000003',47,'distal','filled'),
  ('5eed0004-0000-4000-8000-000000000004','5eed1005-0000-4000-8000-000000000005',46,null,'missing'),
  ('5eed0004-0000-4000-8000-000000000004','5eed1005-0000-4000-8000-000000000005',15,null,'crown'),
  ('5eed0006-0000-4000-8000-000000000006','5eed1006-0000-4000-8000-000000000006',17,'occlusal','filled'),
  ('5eed0006-0000-4000-8000-000000000006','5eed1006-0000-4000-8000-000000000006',27,'occlusal','filled'),
  ('5eed0007-0000-4000-8000-000000000007','5eed1007-0000-4000-8000-000000000007',11,null,'planned'),
  ('5eed0008-0000-4000-8000-000000000008','5eed1008-0000-4000-8000-000000000008',75,'occlusal','decayed'),
  ('5eed0008-0000-4000-8000-000000000008','5eed1008-0000-4000-8000-000000000008',85,null,'missing'),
  ('5eed0010-0000-4000-8000-000000000010','5eed1009-0000-4000-8000-000000000009',24,null,'missing'),
  ('5eed0010-0000-4000-8000-000000000010','5eed1009-0000-4000-8000-000000000009',25,null,'missing')
) as v(pid, vid, tooth, surface, condition);

-- Invoices. total_amount and status are left alone — the triggers from
-- 0005 derive them, which is also a live check that they still work.
-- `status` is given explicitly for today's three. Everywhere else the
-- default and the 0005 triggers decide it, which is deliberate — but a
-- draft has to be *asked* for, since the trigger treats draft as sticky and
-- will never put an invoice into it.
insert into invoices (id, patient_id, visit_id, created_by, created_at, status)
select v.id::uuid, v.pid::uuid, v.vid::uuid, actors.admin,
       (select visit_date from visits where id = v.vid::uuid),
       coalesce(v.status, 'unpaid')::text
from actors, (values
  ('5eed2001-0000-4000-8000-000000000001','5eed0001-0000-4000-8000-000000000001','5eed1002-0000-4000-8000-000000000002', null),
  ('5eed2002-0000-4000-8000-000000000002','5eed0002-0000-4000-8000-000000000002','5eed1003-0000-4000-8000-000000000003', null),
  ('5eed2003-0000-4000-8000-000000000003','5eed0004-0000-4000-8000-000000000004','5eed1005-0000-4000-8000-000000000005', null),
  ('5eed2004-0000-4000-8000-000000000004','5eed0007-0000-4000-8000-000000000007','5eed1007-0000-4000-8000-000000000007', null),
  ('5eed2005-0000-4000-8000-000000000005','5eed0008-0000-4000-8000-000000000008','5eed1008-0000-4000-8000-000000000008', null),
  -- Still being added to, chairside, while Lorna is in the chair.
  ('5eed2006-0000-4000-8000-000000000006','5eed0007-0000-4000-8000-000000000007','5eed1010-0000-4000-8000-000000000010','draft'),
  -- Treatment finished, invoice locked, patient at the counter owing money.
  ('5eed2007-0000-4000-8000-000000000007','5eed0006-0000-4000-8000-000000000006','5eed1011-0000-4000-8000-000000000011', null),
  -- Paid and gone, this morning.
  ('5eed2008-0000-4000-8000-000000000008','5eed0001-0000-4000-8000-000000000001','5eed1012-0000-4000-8000-000000000012', null)
) as v(id, pid, vid, status);

-- created_at is set from the invoice rather than left to default now().
-- Without this the line items carry today's date while their invoice and
-- payment carry historic ones, and the ledger renders a payment settling a
-- charge that hasn't happened yet — a negative running balance.
insert into invoice_items (invoice_id, description, amount, procedure_id, tooth_number, created_at)
select v.inv::uuid, v.descr, v.amount, (select id from procedures where lower(name) = lower(v.proc)), v.tooth,
       (select created_at from invoices where id = v.inv::uuid)
from (values
  ('5eed2001-0000-4000-8000-000000000001','Composite filling (light cure)', 1800.00,'Composite filling (light cure)', 16),
  ('5eed2001-0000-4000-8000-000000000001','Oral prophylaxis (cleaning)',    1200.00,'Oral prophylaxis (cleaning)',   null),
  ('5eed2002-0000-4000-8000-000000000002','Consultation',                    500.00,'Consultation',                  null),
  ('5eed2002-0000-4000-8000-000000000002','Temporary filling',               700.00,'Temporary filling',              26),
  ('5eed2003-0000-4000-8000-000000000003','Simple extraction',              1500.00,'Simple extraction',              46),
  ('5eed2003-0000-4000-8000-000000000003','Periapical x-ray',                500.00,'Periapical x-ray',              null),
  ('5eed2004-0000-4000-8000-000000000004','Oral prophylaxis (cleaning)',    1200.00,'Oral prophylaxis (cleaning)',   null),
  ('5eed2005-0000-4000-8000-000000000005','Pit and fissure sealant',         900.00,'Pit and fissure sealant',        36),
  ('5eed2005-0000-4000-8000-000000000005','Pit and fissure sealant',         900.00,'Pit and fissure sealant',        46),
  ('5eed2006-0000-4000-8000-000000000006','Oral prophylaxis (cleaning)',    1200.00,'Oral prophylaxis (cleaning)',   null),
  ('5eed2007-0000-4000-8000-000000000007','Composite filling (light cure)', 1800.00,'Composite filling (light cure)', 17),
  ('5eed2007-0000-4000-8000-000000000007','Panoramic x-ray',                1800.00,'Panoramic x-ray',               null),
  ('5eed2008-0000-4000-8000-000000000008','Oral prophylaxis (cleaning)',    1200.00,'Oral prophylaxis (cleaning)',   null)
) as v(inv, descr, amount, proc, tooth);

-- A deliberate mix: paid in full, part-paid, and untouched — so the ledger
-- and the outstanding-balance figure have something real to show.
insert into payments (invoice_id, amount, method, reference, received_by, paid_at)
select v.inv::uuid, v.amount, v.method, v.ref, actors.admin,
       (select created_at from invoices where id = v.inv::uuid) + interval '20 minutes'
from actors, (values
  ('5eed2001-0000-4000-8000-000000000001',3000.00,'cash','OR-10432'),
  ('5eed2002-0000-4000-8000-000000000002', 500.00,'cash','OR-10455'),
  ('5eed2003-0000-4000-8000-000000000003',2000.00,'card','OR-10478'),
  ('5eed2005-0000-4000-8000-000000000005',1800.00,'cash','OR-10502'),
  -- This morning's, already settled. 5eed2007 is deliberately unpaid: it is
  -- the one the front desk is meant to collect during the pilot.
  ('5eed2008-0000-4000-8000-000000000008',1200.00,'cash','OR-10511')
) as v(inv, amount, method, ref);

commit;

select count(*) || ' pilot patients seeded (ids beginning 5eed)' from patients where id::text like '5eed%';

-- --- Appointments and recalls (Phase 8 scheduling) -----------------------
-- Appended after the commit above so the schedule has something to show on
-- the pilot's first day: someone waiting, someone in the chair, some still
-- to come, and a recall list that isn't empty.

begin;

delete from appointments where patient_id::text like '5eed%';
delete from recalls where patient_id::text like '5eed%';

create temp table sched_actors on commit drop as
  select (select id from staff where role = 'dentist' and active order by created_at limit 1) as dentist;

-- visit_id matters: the schedule finds a bill through it, so an
-- appointment without one shows no invoice however well billed it is.
insert into appointments (patient_id, dentist_id, visit_id, scheduled_at, duration_minutes, reason, status, arrived_at, seated_at, reception_notes)
select v.pid::uuid, sched_actors.dentist, v.visit::uuid,
       -- Local midnight, not UTC midnight. date_trunc('day', now())
       -- truncates in the *session* timezone, which is UTC over a normal
       -- connection — so a 09:00 clinic slot landed at 09:00 UTC, which is
       -- 17:00 in Davao. The pilot's first screen showed a day running
       -- 17:00 to 23:30, with the clinic shut.
       (date_trunc('day', now() at time zone 'Asia/Manila') + v.at::interval)
         at time zone 'Asia/Manila',
       v.mins, v.reason, v.status::appointment_status,
       case when v.status in ('arrived','in_chair') then now() - (v.waited || ' minutes')::interval end,
       case when v.status = 'in_chair' then now() - interval '5 minutes' end,
       v.note
from sched_actors, (values
  -- Paid and gone, so the card offers "View invoice".
  ('5eed0001-0000-4000-8000-000000000001','09:00',30,'Oral prophylaxis',     'completed', 0,  null,                                   '5eed1012-0000-4000-8000-000000000012'),
  -- In the chair with a draft being added to, so the dentist's chairside
  -- panel opens on work already in progress.
  ('5eed0007-0000-4000-8000-000000000007','09:30',30,'Gum review',           'in_chair',  25, 'Diabetic — see medical alerts',        '5eed1010-0000-4000-8000-000000000010'),
  ('5eed0002-0000-4000-8000-000000000002','10:00',60,'Root canal, upper left','arrived',  12, 'Anxious — allow extra time',           null),
  -- Treatment finished, invoice locked, standing at the counter owing
  -- ₱3,600. This is the one reception is meant to collect during the pilot.
  ('5eed0006-0000-4000-8000-000000000006','11:30',30,'Nightguard review',    'pending_payment', 0, 'Bill ready — take payment',       '5eed1011-0000-4000-8000-000000000011'),
  ('5eed0008-0000-4000-8000-000000000008','12:30',30,'Paediatric check-up',  'confirmed', 0,  'Mother attending',                     null),
  ('5eed0005-0000-4000-8000-000000000005','13:30',30,'First consultation',   'booked',    0,  'New patient — no consent on file yet', null),
  ('5eed0010-0000-4000-8000-000000000010','14:30',45,'Denture adjustment',   'booked',    0,  null,                                   null),
  ('5eed0004-0000-4000-8000-000000000004','15:30',30,'Post-extraction check','booked',    0,  'Hypertensive — check BP',              null)
) as v(pid, at, mins, reason, status, waited, note, visit);

-- Tomorrow, so the day navigation has somewhere to go.
insert into appointments (patient_id, dentist_id, scheduled_at, duration_minutes, reason, status)
select v.pid::uuid, sched_actors.dentist,
       (date_trunc('day', now() at time zone 'Asia/Manila') + interval '1 day' + v.at::interval)
         at time zone 'Asia/Manila',
       v.mins, v.reason, 'booked'
from sched_actors, (values
  ('5eed0003-0000-4000-8000-000000000003','09:00',30,'Cleaning'),
  ('5eed0006-0000-4000-8000-000000000006','10:00',30,'Nightguard fitting')
) as v(pid, at, mins, reason);

-- A mix of overdue and upcoming, so the recall horizons all show something.
--
-- 0018 refuses a recall dated today or earlier, which is right for anything
-- the clinic writes — but overdue recalls are exactly what this fixture has
-- to produce. The guard is switched off for this one insert, inside this
-- transaction, and back on before it commits.
alter table recalls disable trigger recalls_future_due_on;

insert into recalls (patient_id, due_on, reason, created_by)
select v.pid::uuid, (current_date + v.days)::date, v.reason, sched_actors.dentist
from sched_actors, (values
  ('5eed0001-0000-4000-8000-000000000001', -45,'Six-month check-up and cleaning'),
  ('5eed0004-0000-4000-8000-000000000004', -12,'Review healing after extraction'),
  ('5eed0009-0000-4000-8000-000000000009',  -3,'Six-month check-up and cleaning'),
  ('5eed0006-0000-4000-8000-000000000006',  14,'Nightguard review'),
  ('5eed0003-0000-4000-8000-000000000003',  60,'Six-month check-up and cleaning')
) as v(pid, days, reason);

alter table recalls enable trigger recalls_future_due_on;

commit;

select (select count(*) from appointments where patient_id::text like '5eed%') || ' pilot appointments, ' ||
       (select count(*) from recalls where patient_id::text like '5eed%') || ' pilot recalls';
