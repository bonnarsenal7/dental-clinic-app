-- Starter procedure price list.
--
-- NOT pilot fixture data — this is real configuration the clinic keeps and
-- edits. It exists because `procedures` was empty, which leaves the invoice
-- builder with nothing to offer and makes Phase 4 untestable.
--
-- **The fees below are plausible Philippine private-clinic rates, not this
-- clinic's rates.** Someone from the clinic must review every line before
-- the pilot bills anything; they are a starting point so the screens can be
-- exercised, not a price list anyone agreed to. Edit them in the app at
-- /billing/prices rather than here once seeded.
--
-- chart_condition links a procedure to Phase 3's charting vocabulary, so
-- the invoice builder can pull it straight from what was charted at a
-- visit. Only 'filled' and 'crown' are allowed there (0005_billing.sql):
-- decayed and missing are findings, and planned is future work.
--
-- Safe to re-run: conflicts on the case-insensitive name index are skipped,
-- so it will not overwrite a fee the clinic has since adjusted.
--
-- Usage:  psql "$SUPABASE_DB_URL" -f scripts/seed-price-list.sql

insert into procedures (name, code, default_fee, chart_condition) values
  -- Diagnostic and preventive
  ('Consultation',                     'CONS',   500.00, null),
  ('Oral prophylaxis (cleaning)',      'PROPHY', 1200.00, null),
  ('Fluoride treatment',               'FLUOR',  800.00, null),
  ('Pit and fissure sealant',          'SEAL',   900.00, null),
  ('Periapical x-ray',                 'PAX',    500.00, null),
  ('Panoramic x-ray',                  'PANO',  1800.00, null),

  -- Restorative — these carry chart_condition so the invoice builder can
  -- pull them from a tooth charted as filled.
  ('Composite filling (light cure)',   'COMP',  1800.00, 'filled'),
  ('Amalgam filling',                  'AMAL',  1200.00, 'filled'),
  ('Temporary filling',                'TEMPF',  700.00, 'filled'),
  ('Glass ionomer filling',            'GIC',   1500.00, 'filled'),

  -- Crowns — likewise chart-linked.
  ('Porcelain fused to metal crown',   'PFM',  15000.00, 'crown'),
  ('Zirconia crown',                   'ZIRC', 22000.00, 'crown'),
  ('Stainless steel crown (paediatric)','SSC',  4500.00, 'crown'),

  -- Surgical
  ('Simple extraction',                'EXT',   1500.00, null),
  ('Surgical extraction / odontectomy','ODONT', 6000.00, null),

  -- Endodontic
  ('Root canal treatment — anterior',  'RCTA',  7000.00, null),
  ('Root canal treatment — premolar',  'RCTP',  9000.00, null),
  ('Root canal treatment — molar',     'RCTM', 13000.00, null),

  -- Prosthodontic
  ('Complete denture (per arch)',      'CD',   25000.00, null),
  ('Removable partial denture',        'RPD',  15000.00, null),
  ('Denture repair',                   'DREP',  2500.00, null)
on conflict (lower(name)) do nothing;

select count(*) || ' procedures in the price list' from procedures;
