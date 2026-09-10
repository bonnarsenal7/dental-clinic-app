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

## Phase 1 — Auth & Data Model (done)

### Schema
SQL migrations live in `supabase/migrations/` (run in order). All of
0001-0004 are applied to the live project — check with
`supabase migration list`.
- `0001_schema.sql` — all tables: staff, patients, medical_histories,
  dental_histories, consents, visits, visit_notes, tooth_records, invoices,
  invoice_items, payments, audit_log, clinic_settings.
- `0002_rls.sql` — RLS enabled on every table, `current_staff_role()`
  helper (SECURITY DEFINER), and every policy.

**Deviation from the original Phase 1 sketch:** `visits.notes` was split
into its own `visit_notes` table. Reception needs full read/write on
`visits` (the administrative record: who, when) but must have **zero**
access — not even read — to the dentist's clinical write-up. Row-level
security can't hide one column of a row a role otherwise has SELECT on,
so the notes text lives in a separate table with no reception policy at
all, which enforces true zero-access rather than "hidden in the UI."

### Access rules (enforced by RLS, not app code)
- **receptionist**: full read/write on patients, medical_histories,
  dental_histories, consents (insert/select only — no update, no delete),
  visits, invoices, invoice_items, payments. **No policy at all** (full
  deny) on `visit_notes` and `tooth_records`.
- **dentist**: everything receptionist has, plus full read/write on
  `visit_notes` and `tooth_records`.
- **admin**: full access everywhere, including `staff` and
  `clinic_settings`, and is the only role that can delete rows anywhere.
- Nobody can update `consents` or `payments` rows once written — a
  correction is a new row, so the audit trail is never silently edited.

### Auth
- Supabase Auth email/password. `staff.id` is the same UUID as
  `auth.users.id`.
- **Deactivation is enforced two ways**, not just a UI hide: the
  `manage-staff` Edge Function sets `staff.active = false` (blocks all
  RLS-guarded data access immediately) AND calls
  `auth.admin.updateUserById(id, { ban_duration: '876000h' })` (blocks
  GoTrue login/refresh itself, so a still-valid token can't be reused
  either). `AuthContext` also force-signs-out and shows a message if it
  ever loads a session whose staff row is inactive or missing, as a
  client-side backstop.
- Idle timeout: **15 minutes** of no mouse/keyboard/touch/scroll activity
  auto-signs-out (`useIdleTimeout`). Chosen as a middle ground for shared
  clinic tablets — short enough that a tablet left at the front desk
  doesn't stay logged in for long, long enough not to log out a dentist
  mid-chairside-charting just because they paused to talk to a patient.
- Password reset: `ForgotPasswordPage` sends a Supabase reset email;
  `ResetPasswordPage` sets the new password and is reused for both the
  post-email-link flow (`/reset-password`, public — the email link itself
  carries a temporary session) and a logged-in staff member changing their
  password voluntarily (`/change-password`, inside the authenticated
  shell, linked from the nav bar).

### Staff account management
Creating and deactivating accounts needs the Supabase **service-role**
key, which must never reach the browser. Both actions go through the
`manage-staff` Edge Function (`supabase/functions/manage-staff/`), which
verifies the caller is an active admin (via their own JWT) before doing
anything privileged. Creating an account generates a random temporary
password shown once to the admin to relay to the new staff member
out-of-band; there's no email-invite flow yet.

**Bootstrapping the very first admin** is necessarily manual (nothing can
call "admin creates staff" before an admin exists): create the user in
the Supabase Dashboard under Authentication → Users → Add user, then run
this once in the SQL Editor with that user's UUID:
```sql
insert into staff (id, name, email, role) values
  ('<uuid-from-dashboard>', 'Your Name', 'you@example.com', 'admin');
```
Every account after that is created through the in-app Staff screen.

### Navigation shell
Top nav bar (not a side rail) — chosen because a side rail eats
horizontal space on a portrait-orientation tablet, which is how staff
mostly hold them. Nav items are role-aware: `Staff` and `Clinic Settings`
only render for `admin`.

### Folder structure additions
```
src/features/auth/       — AuthContext, login/forgot/reset pages, ProtectedRoute, idle timeout
src/features/admin/      — staff management + clinic settings screens (admin-only), api.ts
src/core/components/     — AppShell (nav), DashboardPage, PlaceholderPage (Phase 2-4 stand-ins)
supabase/migrations/     — versioned SQL, applied via `supabase db push`
supabase/functions/      — Edge Functions (currently: manage-staff)
```

### Applying this to the live Supabase project
**These sessions can reach `supabase.com`.** The Supabase CLI is installed
and the project is already linked (`xzpheuvthmsucvhytdjh`); `supabase
migration list` and `supabase db push` have both been run from a session
successfully. Phase 1 originally recorded the opposite — that the sandbox
was cut off by network policy and you had to apply everything yourself.
That was true when it was written and no longer is.

The practical consequence: a session can change the live database
directly — the same project the clinic will run on from Phase 7's pilot
onward. So treat a push as the outward-facing action it is: check
`supabase migration list` and `supabase db push --dry-run` first, and
don't push unless asked to.

```
supabase login
supabase link --project-ref xzpheuvthmsucvhytdjh
supabase db push
supabase functions deploy manage-staff
```
(`functions deploy` hasn't been exercised from a session yet — only
`migration list` and `db push` are confirmed.)

**What sessions still can't do: run the build.** Node isn't installed on
this machine — `node`, `npm`, and `npx` are all absent from PATH, and the
`node_modules/.bin` shims are `#!/usr/bin/env node` scripts that can't
execute. So `npm run build` (which is the type-check) and `npm run lint`
cannot run in-session, and TypeScript errors will not be caught here. Run
both yourself before deploying.

## Phase 2 — Patient Records Module (done)

### What's built
- `src/features/patients/PatientsPage.tsx` — list + debounced search by
  name/cell/phone (`ilike` across all three).
- `src/features/patients/PatientForm.tsx` — shared demographics + medical
  history + dental history form (used for both registration and edit).
  Checklists render from `historyOptions.ts` (the condition/symptom/habit
  vocab), each backed by a jsonb map on the corresponding table, with a
  "specify" text field next to allergies, current medications, and any
  "other" checkbox — never collapsed into one free-text box.
- `src/features/patients/ConsentCapture.tsx` — signature pad
  (`react-signature-canvas`) that uploads a trimmed PNG to the private
  `patient-files` Storage bucket and writes a `consents` row. Reused for
  both first-time registration and the "Re-confirm consent" action on a
  patient's profile — consent is a log of signing events, not a flag.
- `src/features/patients/PatientRegisterPage.tsx` — registration flow:
  fill the form → patient + histories are created → immediately prompts
  for the signature, so registration and consent happen as one motion
  (with a "skip for now" escape hatch to capture consent later).
- `src/features/patients/VisitTimeline.tsx` — chronological visit list.
  The "add visit note" form only renders for dentist/admin (matches the
  RLS boundary from Phase 1); a receptionist viewing the same timeline
  sees the visit dates but an explicit "clinical notes are only visible
  to dentist/admin accounts" message instead of the note text, since
  `visit_notes` rows are invisible to them at the RLS level, not just
  hidden by the UI.
- `src/features/patients/FileAttachments.tsx` — upload/list X-rays, ID
  scans, etc. Files are private; viewing one fetches a short-lived (10
  minute) signed URL rather than a permanent public link.

### Storage
`supabase/migrations/0003_storage.sql` adds a private `patient-files`
bucket (folders: `signatures/<patient_id>/…`, `attachments/<patient_id>/…`)
and a `patient_files` metadata table (so attachments can be listed/labeled
without listing the bucket directly — signatures don't need this since
each is already tied 1:1 to a `consents` row). Bucket access follows the
same front-desk tier as `patients` (receptionist/dentist/admin read/write,
admin-only delete).

### Consent text
The wording in `historyOptions.ts` (`CONSENT_TEXT`) is a placeholder,
clearly flagged in the UI as draft pending Phase 5's legal review under
the Data Privacy Act — do not treat it as final, and don't remove the
"draft" notice until Phase 5 actually replaces it.

### Reconciling the Supabase CLI (done — kept for the record)
Migrations 0001 and 0002 were applied by pasting SQL directly into the
Supabase SQL Editor (before the CLI was working locally), so the CLI's
remote migration history didn't know about them. That was reconciled with:
```
supabase migration repair --status applied 0001
supabase migration repair --status applied 0002
```
The repair stuck — remote history now lists 0001-0004, so no further
repair is needed. Only run `migration repair` again if SQL is applied
outside the CLI once more.

## Phase 3 — Dental Charting (Odontogram) (done)

### Where it lives
`src/features/charting/` — `chartVocabulary.ts` (FDI layout, surfaces,
condition palette), `chartState.ts` (the fold), `types.ts`, `api.ts`,
`ToothGlyph.tsx`, `Odontogram.tsx`, `ChartLegend.tsx`,
`ToothDetailPanel.tsx`, `PatientChartPage.tsx`, `ChartingPage.tsx`.

Routes: `/charting` (patient picker) and `/patients/:id/chart` (the chart),
both wrapped in `ProtectedRoute allow={['dentist','admin']}` to match the
RLS boundary on `tooth_records` — a receptionist never sees the nav item,
the profile button, or the route.

### The chart is an append-only log, not a current-state table
`tooth_records` is never updated in place: re-charting a tooth writes a new
row that supersedes the earlier one, so the history per tooth stays intact.
`deriveChart()` folds the log in order into the state shown on screen.

**`0004_charting.sql` adds a `seq bigserial` column, and the fold reads
that — not `created_at`.** `created_at` defaults to `now()`, which is
*transaction* time, so every row written in one save shares a timestamp;
ordering by it would make "decayed, then sound" and "sound, then decayed"
indistinguishable after a reload. `seq` is a total order over the log.

How each condition folds (`kind` in `TOOTH_CONDITIONS`):
- `sound` (`reset`) — clears every finding on the tooth
- `decayed`, `filled` (`surface`) — apply to one named surface
- `missing`, `crown` (`whole`) — apply to the tooth and clear its surfaces
  (a missing tooth has no surfaces; a crown covers all of them)
- `planned` (`plan`) — an **overlay**, drawn as a dashed ring around the
  tooth. It does not erase existing findings, because planned work sits on
  top of what is already charted. Clearing a plan means marking the tooth
  `sound`, which clears the rest too.

The vocabulary is constrained in the database as well as in TypeScript
(`tooth_records_condition_check` / `_surface_check` / `_surface_scope_check`,
plus `_fdi_number_check` for valid FDI numbers). Extending the palette
therefore needs a migration alongside the `chartVocabulary.ts` edit — that
coupling is deliberate: these values are what the chart means.

### Surfaces
Stored under five canonical names — `mesial`, `distal`, `buccal`,
`lingual`, `occlusal` — and displayed with the term that fits the tooth
(`surfaceLabel()`): incisal on anteriors, labial on anterior faces, palatal
on the upper arch. Which edge of a tooth's square is which surface flips by
quadrant and arch (`surfacesForTooth()`), because the chart is drawn as if
facing the patient: their right is on the viewer's left.

### Chairside interaction
- The legend **is** the tool picker; `Inspect` is the default, so tapping a
  tooth opens its history without marking anything.
- The selected condition sets the click target: whole-tooth conditions take
  the whole 44px square, surface conditions make the five zones live.
  The detail panel also offers full-width surface buttons, since a 13px
  zone is a poor fingertip target on a tablet.
- **Marks are staged, not written on tap.** They accumulate with an amber
  dot on the tooth and a sticky bar showing the count, and only reach the
  database on `Save to chart`, so a mis-tap chairside is undone with a tap.
  A `beforeunload` guard warns if the tab is closed with marks unsaved.

### Linking chart entries to visits
Every saved mark carries a `visit_id`. The chart page has a "Recording
against visit" selector that defaults to today's visit if one exists, with
`+ Start a visit for today` when it doesn't; saving is blocked until one is
chosen. The tooth detail panel shows each entry's visit date and the
dentist's note for that visit inline, which is the link back.

### Per-tooth images
A saved `tooth_record` can carry one image (`image_path`/`image_name`),
uploaded from the tooth detail panel. Records only ever *gain* an image
they don't have — replacing one would orphan the old object, which only an
admin could clear up.

Images go in the same private `patient-files` bucket as Phase 2, under
`tooth/<patient_id>/<tooth_number>/…`. **`0004_charting.sql` replaces
0003's bucket-wide front-desk storage policies** so they exclude the
`tooth/` prefix, and adds dentist/admin-only policies for it — otherwise
the dentist/admin-only boundary on `tooth_records` would leak through
Storage, since `storage.objects` policies are permissive (OR'd) and a broad
one can't be narrowed by adding another.

### Applying this migration
Already applied — `supabase db push` was run from the session that wrote
it, and remote history lists 0004.

The new CHECK constraints validate existing rows, so if this ever gets
replayed against a database with `tooth_records` data using conditions
outside the vocabulary, that data has to be cleared first. It applied
clean here, so there was none.
