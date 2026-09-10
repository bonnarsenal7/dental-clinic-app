# Dental Clinic App

## Stack
- Frontend: Vite + React + TypeScript, Tailwind CSS (v4, via `@tailwindcss/vite`)
- Routing: react-router-dom
- Forms: react-hook-form
- Backend: Supabase (Postgres, Auth, Storage) — fully managed cloud, no local server, no custom API layer
- Signature capture: react-signature-canvas
- PDF generation: jsPDF
- Hosting: Vercel (auto-deploy on push to `main`)
- Error monitoring (from Phase 6): Sentry's React SDK

Supabase is called directly from React via `@supabase/supabase-js` — there is no separate backend service. Authorization is enforced with Postgres Row-Level Security (RLS) policies, not app-layer checks, so RLS policies are a first-class part of the schema, not an afterthought.

## Folder structure
```
src/
  core/
    supabaseClient.ts   — Supabase client init, reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    components/         — shared UI components
    theme/              — design tokens (Tailwind config is the source of truth for colors/spacing/type)
  features/
    auth/
    patients/
    charting/
    billing/
```
Feature-first: each feature folder owns its own components, hooks, and Supabase queries.

## Environment
- `.env.local` (gitignored) holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never commit real values.
- `npm run dev` — local dev server
- `npm run build` — type-checks (`tsc -b`) then builds
- `npm run lint` — oxlint

## Conventions
- TypeScript strict mode (from the Vite react-ts template defaults) — keep it on.
- Tooth numbering is FDI (two-digit): 11–48 for permanent teeth, 51–85 for primary/temporary teeth. This matches the clinic's real paper chart — do not switch to Universal numbering.
- Medical and dental history are structured checklists (stored as JSON per patient), not free-text blobs — modeled directly on the clinic's real paper intake form.
- Consent-for-treatment is captured per signing event (a `consents` row per signature), not a single yes/no flag, since the paper form is re-signed across visits.
- This is a web app accessed from a tablet's browser — there is no native app, no app-store distribution, and no local/offline-first sync. Network loss should show a clear "you're offline" state rather than silently queuing writes (see Phase 6).

## Build roadmap (9 phases)

P0 — Foundations & setup (Week 1)
Goal: Get accounts, tooling, and project skeletons in place so every later phase has a stable base.
Tasks:
  - Create the Supabase project (pick a region close to the Philippines for latency)
  - Scaffold a Vite + React + TypeScript app; install @supabase/supabase-js
  - Set up a feature-first folder structure: src/features/{auth,patients,charting,billing}/
  - Init git repo with CI (lint + type-check + tests on push) and connect a Vercel project for automatic deploys
  - Set up Tailwind CSS and define shared design tokens (colors, spacing, type scale) used across all screens
Exit criteria: The React app runs locally and is live at a Vercel URL, and successfully reads an empty table from Supabase in both places.

P1 — Auth & data model (Week 2)
Goal: Staff can log in with roles, and the core schema exists with RLS enforced from day one.
Tasks:
  - Design schema: staff, patients, medical_histories, dental_histories, consents, visits, tooth_records, invoices, invoice_items, payments, audit_log — fields per the clinic's real paper intake and consent forms
  - Implement Supabase Auth (email/password for staff logins)
  - Write RLS policies per role — e.g. receptionists cannot edit clinical notes
  - Build the login screen and a role-aware navigation shell
  - Add password reset/change and session timeout on idle
  - Build a basic staff management screen (list, create, deactivate accounts) and a clinic settings screen (name, hours)
Exit criteria: Two test accounts with different roles show visibly different permissions in both the app and the Supabase dashboard, and a deactivated account can no longer log in.

P2 — Patient records module (Weeks 3–4)
Goal: Staff can create, search, and update patient profiles and visit history.
Tasks:
  - Patient list with search by name / contact number
  - Registration form matching the clinic's paper intake: name, address, birthday, age, sex, height, weight, occupation, spouse, phone & cell, remarks
  - Structured medical history form — checkbox list per condition (not a free-text box), plus physician info and hospitalization
  - Structured dental history form — checkbox list of symptoms/habits, plus last visit and previous dentist
  - Consent-for-treatment capture: signature pad + timestamp, saved as its own consents record, re-signable at any later visit
  - Visit notes: add and edit free-text notes tied to a patient and date
  - File attachments (X-rays, ID scans) via Supabase Storage
Exit criteria: A receptionist can register a new patient end-to-end — including medical/dental history and a signed consent — and a dentist can add a visit note to that file.

P3 — Dental charting (odontogram) (Weeks 5–6)
Goal: An interactive tooth chart tied to each patient's record, usable chairside.
Tasks:
  - Build the odontogram as an SVG-based React component, using FDI numbering (11–48 permanent, 51–85 primary) to match the clinic's paper chart
  - Define the condition/procedure vocabulary (decayed, filled, missing, crown, planned) with a color legend
  - Save and load tooth_records per patient, with history per tooth over time
  - Link chart entries back to the relevant visit note
  - Let a specific tooth_record carry its own attached image (e.g. an X-ray for that tooth), reusing Phase 2's Supabase Storage setup
Exit criteria: A dentist marks conditions on a chart during a mock visit, then reopens the patient later and sees the same chart.

P4 — Billing & invoicing (Weeks 7–8)
Goal: Generate and track invoices and payments per patient and per visit.
Tasks:
  - Configurable procedure price list
  - Invoice builder: pull charted procedures from a visit, add manual line items
  - Payment recording — cash/card, partial payments, running balance
  - Per-patient treatment ledger view (Date / Treatment Procedures / Fee / Balance) — the digital equivalent of the clinic's existing paper ledger
  - PDF receipt generation, downloadable/printable from the browser
Exit criteria: The full flow — visit → charted procedures → invoice → payment → printable receipt — works with no manual re-entry.

P5 — Compliance, security & backups (Week 9)
Goal: Data handling matches the sensitivity of health records before real patients touch it.
Tasks:
  - Wire an audit log to key actions (record views/edits)
  - Build a simple audit-log screen so staff can actually read/export it, not just store it
  - Review and tighten RLS policies against realistic role scenarios
  - Confirm automated Supabase backups; add a manual export routine
  - Document and test a restore-from-backup procedure
  - Draft the legal text for the consent-for-treatment and data-handling copy shown in Phase 2's signature capture (flag for legal review — Data Privacy Act)
Exit criteria: A written checklist confirms RLS, backups, restore, and audit logging are active — reviewed with someone versed in the Data Privacy Act.

P6 — Offline resilience & polish (Week 10)
Goal: The app tolerates flaky clinic Wi-Fi and feels finished.
Tasks:
  - Handle connectivity loss gracefully — a clear offline state (not a full sync engine — see Constraints above)
  - Loading, empty, and error states across every screen
  - Responsive layout pass for tablet-width browsers — spacing, touch targets, portrait and landscape
  - Basic crash/error logging for visibility after launch (Sentry's React SDK)
Exit criteria: A simulated Wi-Fi drop mid-entry causes no crash and no lost data.

P7 — Staff testing & pilot (Weeks 11–12)
Goal: Real staff exercise the app on realistic clinic days before full cutover.
Tasks:
  - Load a realistic (anonymized or pilot) patient dataset for hands-on testing
  - Shadow-run alongside the current paper/Excel process for a set period
  - Collect friction points from receptionist and dentist daily use
  - Fix bugs and rough edges the pilot surfaces
Exit criteria: A full clinic day runs through the app with no data-loss incidents, and staff sign off to go live.

P8 — Launch & ongoing maintenance (Ongoing)
Goal: Cut over fully and keep the system healthy afterward.
Tasks:
  - Migrate remaining historical records from the old system
  - Retire the paper/Excel fallback
  - Set a monitoring and backup-check cadence (e.g. monthly)
  - Keep a backlog for v2 — appointment reminders, insurance claims, multi-branch
Exit criteria: The clinic runs entirely on the new system for one full month with no critical incidents.
