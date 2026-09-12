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
- `npm run format` / `npm run format:check` — Prettier. CI runs the check
  first, so unformatted code fails before the tests do.

## Conventions
- TypeScript strict mode — `"strict": true` in both `tsconfig.app.json` and
  `tsconfig.node.json`. Keep it on. This convention was documented from the
  start but only actually set in the configs after Phase 3; the whole
  codebase passed with zero errors when it was switched on, so there is no
  legacy of strict-exempt code to be careful of.
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

### Deactivation is two things, so restoring undoes two things
`manage-staff` supports `create`, `deactivate`, `reactivate` and
`reset_password`. Deactivate sets `staff.active = false` **and** bans the
login in GoTrue; restoring has to undo both, and only the service role can
lift the ban.

**Never restore an account by flipping `staff.active` from the browser or
the SQL editor alone.** That produces an account that reads as active in the
Staff screen and still cannot sign in — the worst version, because it looks
fixed. `reactivate` puts the flag back if the unban fails, rather than
leaving the two halves inconsistent.

Restoring does not restore a password. The dialog says so, because otherwise
whoever restores the account will tell the staff member to just log in.

### An admin may set a password, or let one be generated
Both `create` and `reset_password` take an **optional** `password`. Left
blank, the server generates one and nothing changes. Supplied, that becomes
the password — because reading `Tmp-9fA2xQ` down the phone is how a new
starter is locked out on their first morning, and a clinic will otherwise
invent its own workaround.

**The eight-character minimum is enforced in the Edge Function, not only in
the form.** The endpoint is reachable with any HTTP client, so "the UI
checks it" is not a check. It matches the minimum `ResetPasswordPage`
already applies, so a password an admin sets is one the staff member could
have set themselves. A refused attempt leaves the old password working —
verified live, not assumed.

The response carries `chosen`, so the screen can say "Password set" rather
than "New temporary password". A chosen password is echoed back too: that is
how the admin sees what they actually typed.

The field is cleared whenever the dialog opens. Carrying a typed password
from one account's dialog to the next would set it on somebody it was never
meant for.

### Resetting a password issues one, rather than emailing a link
`reset_password` sets a new temporary password and returns it once, the same
shape as `create`. It is not an emailed reset link, because the case it
exists for is a staff member locked out mid-clinic-day who often cannot
reach the mailbox on file — or whose address is shared. Self-service by
email still lives at `/forgot-password` for anyone who can receive mail.

**Only offered for active accounts.** A new password does nothing against a
deactivated one: the GoTrue ban refuses the login before the password is
ever checked, so handing an admin a credential that cannot be used would be
worse than refusing. The Edge Function enforces this too, not just the UI.

**It does not cut off an open session.** Changing a password leaves existing
refresh tokens valid. If the point of the reset is that the old password
leaked, deactivate and restore instead — that bans and unbans in GoTrue,
which does end the session. The confirmation dialog says this.

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

### Clinic name
`src/core/branding.ts` holds `CLINIC_NAME` ("ToothCo Dental Clinic").

For anyone signed in, the name in the nav bar and on receipts comes from
`clinic_settings.clinic_name`, editable by an admin at `/admin/settings` —
that remains the source of truth. `CLINIC_NAME` covers the two cases that
can't read it: the **login screen**, which is pre-auth and so blocked by
the `clinic_settings` RLS policy (it requires an active staff role), and
the fallback when the setting is blank. Keep both in step when renaming —
they had already drifted once, with the login saying "Dental Clinic App"
while the header said "ToothCo".

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
All three are confirmed from a session: `migration list`, `db push` and
`functions deploy`. The deploy prints a "Docker is not running" warning and
succeeds anyway — the current CLI bundles Edge Functions without it.

**Node is installed** (Homebrew, v26), so `npm run build` — which is the
type-check — and `npm run lint` both run in-session. They were briefly
unavailable: Node was missing from this machine when Phase 3 was written,
which is why that phase shipped verified only by CI. If `npm run build`
ever dies on a missing `@rolldown/binding-darwin-*` module, `node_modules`
was populated for another platform — `npm ci` repairs it.

CI pins Node 22 while local is 26, so a version-sensitive failure could
appear in one and not the other.

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

### A consent records who signed, not just that someone did
`0010_consent_signer.sql` adds `signed_by_name` and `signer_relationship`
(`self` / `parent` / `guardian` / `representative`, enforced by a check
constraint that the UI's dropdown mirrors).

The screen had always invited "the patient (or parent/guardian)" to sign
while `consents` stored only `patient_id` and the image — so a guardian's
signature was indistinguishable from the patient's own, on a document
written in the patient's voice ("I consent"). For a clinic that treats
children that is a gap in the record, not a cosmetic one.

**Both columns are nullable, and must stay that way.** Ten consents predate
this and nothing knows who signed them. Backfilling `self` would invent a
fact about a document somebody already put their name to. A null means
"not recorded" and the profile says exactly that rather than leaving a
blank that reads as the patient.

A second constraint requires both columns or neither: a name with no stated
authority is a half-record that looks complete in a list and answers nothing
when it matters.

### Consent text
`CONSENT_TEXT` in `historyOptions.ts` is `v3-draft`, flagged in the UI as
draft pending legal review under the Data Privacy Act. Do not treat it as
final and do not remove the draft notice until a lawyer has signed it off.

**The three clinic facts are constants, not brackets in the prose.**
`PRIVACY_CONTACT.name`, `PRIVACY_CONTACT.details` and `RECORD_RETENTION`
start empty. While any is unset the notice renders `«… NOT SET»` where a
patient reads it, and the capture screen shows a red banner naming which —
because v2 kept them as `[RETENTION PERIOD]` inside the text, which would
have been shown to patients verbatim. A placeholder that is loud on screen
is the point; a tidy blank is the bug.

Filling them changes what a patient is told, so **bump
`CONSENT_TEXT_VERSION` when you do.** The version is stored on every
consents row, so old signatures stay attached to the words actually shown
when they were given — which is why the test fixtures still reference
`v2-draft` and should keep doing so.

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

### The chart is reached by accessible name, not by `<title>`
Every pickable zone and every tooth carries `role="button"` and an
`aria-label` — the same wording as its tooltip. An SVG `<title>` nested in
a `<g>` is announced inconsistently by screen readers **and** is invisible
to testing-library's `ByTitle`, which only matches `svg > title` as a
direct child. That is why the chart had no coverage of what a tap actually
hits until roles were added.

There is deliberately **no `tabIndex`**. Making 260 zones tab-stops would be
worse than none; keyboard charting needs arrow-key navigation, which is not
built. That remains an open gap.

The click handler sits on the zone's `<g>`, not on the `<path>` inside it,
so the shape and the tooltip naming it are one target.

### Medical alerts on the chart
`src/features/patients/MedicalAlerts.tsx` renders above the odontogram, so
nobody starts marking teeth without having passed the allergy they are
about to inject around. The chart screen previously showed no medical
information at all — the profile warned about an anaesthesia allergy, the
screen the dentist actually works on chairside did not.

`CONDITION_ALERTS` in `historyOptions.ts` decides what is worth surfacing
and how urgently. Not every ticked intake box changes what a dentist does,
so most don't appear; the ones that do carry a `why` ("angina — cardiac
risk, limit epinephrine"), because a condition name alone doesn't tell a
hurried clinician what to do differently.

**Both empty cases say something.** A clear history renders "no medical
alerts — history reviewed", and a missing one renders a warning. A blank
space would be ambiguous between "nothing to worry about" and "it never
loaded", and a clinician shouldn't have to guess which.

If you add this to another clinical screen, add a test that it's *on* that
screen. Deleting the banner from the chart page passed all 56 tests in the
suite — the component was covered, its wiring wasn't.

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

## Phase 4 — Billing & Invoicing (done)

### Where it lives
`src/features/billing/` — `types.ts`, `api.ts`, `ledger.ts` (running
balance + peso formatting), `receiptPdf.ts` (jsPDF), and five screens:
`BillingPage` (patient picker), `PatientLedgerPage`, `InvoiceBuilderPage`,
`InvoiceDetailPage`, `PriceListPage`.

Routes: `/billing`, `/patients/:id/billing` (ledger),
`/patients/:id/invoices/new` (builder), `/invoices/:id` (detail + payments
+ receipt), and `/billing/prices` (admin-only price list).

### Totals are derived in the database, not by the client
`invoices.total_amount` and `invoices.status` are recomputed by triggers
(`refresh_invoice_totals`) whenever `invoice_items` or `payments` change.
**Never write either column from the app** — create the lines and refetch.
Money is not something to leave to a UI bug, and this keeps the two in step
no matter which screen wrote the row.

A voided invoice stays void and is excluded from the patient's balance; a
payment does not resurrect it.

The trigger branches on `TG_OP` rather than
`coalesce(new.invoice_id, old.invoice_id)`: PL/pgSQL leaves `NEW`
unassigned on DELETE, and touching it raises rather than yielding null.
UPDATE refreshes both sides so moving a line between invoices can't leave
the old one stale.

### The RLS boundary shapes who can invoice from the chart
`tooth_records` is dentist/admin-only (0002_rls.sql), so **a receptionist
genuinely cannot pull charted procedures into an invoice** — not a UI
choice, an RLS fact. The workflow this implies:

- **dentist/admin** builds the invoice from the visit's chart (they're
  already in the chart at the end of the appointment)
- **receptionist** records payment and prints the receipt

The builder shows reception an explicit message in place of the charted-
procedures section and leaves manual line entry fully available, rather
than showing them an empty list that looks like a bug.

### Invoice lines denormalise their wording
`invoice_items.description` and `.tooth_number` are **copied onto the line**
at creation rather than read through `tooth_record_id`. Two reasons: a
receptionist has no access to `tooth_records` and must still print a
receipt, and an invoice is a financial record that must not re-word itself
when the chart is later re-charted. `tooth_record_id` is kept only as the
provenance link, with a partial unique index so a charted procedure can't
be billed twice.

### What's billable
Only charted conditions representing work *performed*: `filled` and
`crown`. `decayed` and `missing` are findings and `planned` is future work
— none are billable. `procedures.chart_condition` maps a price-list entry
onto one of those two, which is how the builder knows what to offer; the
check constraint on that column widens if Phase 3's vocabulary grows.

When a clinic has several procedures for one condition (composite vs
amalgam filling), the builder picks the cheapest as a starting guess and
leaves the fee editable on the line.

### Ledger and receipts
`buildLedger()` interleaves charges and payments chronologically with a
running balance, rather than grouping per invoice — that's how the paper
Date / Treatment / Fee / Balance sheet reads. Void invoices are dropped
entirely. Same-timestamp charges sort before the payment that settles them
so the balance never dips negative on a pair written together.

Receipts render with jsPDF and `doc.save()` rather than
`output('dataurlnewwindow')` — the latter is popup-blocked and renders
poorly on tablets, which is where the clinic prints from. The receipt
number is a short slice of the invoice uuid (a uuid is unusable over the
phone); it is **not** a sequential BIR official receipt number — if the
clinic needs one of those it goes in `payments.reference`.

Payments remain append-only per 0002: a correction is another row and a
refund is a negative amount.

## Phase 5 — Compliance, security & backups (code done; sign-off outstanding)

**Read `docs/COMPLIANCE.md` first.** It is the phase's actual deliverable —
the written checklist the exit criteria asks for — and it records three
BLOCKING items that mean the system is not ready for real patient data:
no restorable backups exist, public signup is enabled, and the consent text
has not had legal review. Don't treat Phase 5 as done because the code is.

### Audit logging is done with triggers, not app code
`0006_audit.sql` attaches an `AFTER INSERT OR UPDATE OR DELETE` trigger to
all 13 tables holding patient data, money, or access control. **Never add
app-side write logging** — the point is that the log fires regardless of
what wrote the row, including the SQL editor and psql. A client-written
audit log is worthless: the client that skips the entry is the one you
need the log for.

- The trigger is `SECURITY DEFINER`, so nobody can opt out of being logged,
  and it does not swallow errors — a failed log fails the transaction.
- `audit_log` is append-only: no update or delete policy for any role,
  admin included.
- `changed_fields` holds column **names, never values**. Storing values
  would make the audit log a second copy of every medical history — a
  bigger breach surface in the name of protecting one.
- `patient_id` and `staff_id` are plain uuids, deliberately **not** foreign
  keys, so entries outlive their subjects. A FK would have made patients
  undeletable (the AFTER DELETE trigger names the row it just deleted);
  a cascade would have erased the evidence.
- Clients may only insert `operation = 'view'` rows (0006 narrowed 0002's
  policy), so a write entry can't be forged.

**Reads are the weak half and are meant to look that way.** PostgreSQL has
no SELECT trigger, so view logging comes from the client
(`src/core/auditView.ts`, wired into the profile, chart and ledger screens),
fire-and-forget so a logging failure never blocks a clinician mid-
appointment. The `operation` column keeps views distinguishable from
trigger-written entries.

Screen: `/admin/audit` (admin only) — filters plus CSV export of everything
matching the filters, not just the visible page.

### Consent text
`CONSENT_TEXT` is now a full RA 10173 draft (`v2-draft`), replacing Phase
2's placeholder. It still contains bracketed fields the clinic must fill in
and **has not been reviewed by a lawyer** — leave the draft warning in
`ConsentCapture.tsx` until it has. Re-wording means bumping
`CONSENT_TEXT_VERSION`, so old signatures stay attached to the words that
were on screen when they were given.

### Backups
`scripts/backup.sh` dumps roles, schema and data. It prefers direct
`pg_dump` (needs `libpq` + `SUPABASE_DB_URL`) and falls back to the
Supabase CLI (which needs Docker, since it runs pg_dump in a container).

Two things to know: **the dump path is untested** — this environment has
neither Docker nor the database password — and **storage objects are not
backed up at all**, so a restore yields consent rows pointing at signature
images that no longer exist. Both are recorded as open in
`docs/COMPLIANCE.md`.

## Phase 6 — Offline resilience & polish (done)

### Connectivity is detected centrally, in the Supabase client
`src/core/supabaseClient.ts` wraps `fetch` and reports the outcome to
`src/core/useOnlineStatus.ts`. **Don't add per-screen connectivity checks** —
routing every call through one observer means a screen nobody thought about
still drives the banner correctly, and a request that *succeeds* counts as
proof the connection is back.

That last part matters: `navigator.onLine` only knows the link layer, so it
reports `true` for a tablet associated with a clinic access point whose
uplink is down — precisely the failure this phase exists for. The flag is
the starting value; an observed request outcome overrides it.

It only observes. **Nothing is queued or retried**, per the project
constraint: this is a clear offline state, not a sync engine. Writes to a
health record are never silently deferred.

### Errors
`src/core/errors.ts` — `toMessage(e)` is what every catch block calls. It
replaces network failures with a plain-language message and leaves real
errors (constraint violations, RLS refusals) with their own wording, which
is genuinely useful to read. Before this, all 21 error sites rendered
`TypeError: Failed to fetch` verbatim, which reads as a bug in the app
rather than as "the Wi-Fi went".

Signature matching is tested against the real strings Chrome, Firefox,
Safari and undici produce — if that list drifts, the banner stops firing,
so extend `NETWORK_SIGNATURES` rather than special-casing at a call site.

### No lost data
The property holds because **every `reset()` and `navigate()` sits after
its awaited write, inside the `try`**. A failed write throws, the reset
never runs, and react-hook-form keeps what was typed. Preserve that
ordering in new forms — moving a `reset()` before or outside the `await` is
what would silently discard a half-filled registration.

The odontogram additionally stages marks locally with a `beforeunload`
guard (Phase 3).

### Shared states
`src/core/components/states.tsx` — `LoadingState`, `EmptyState`,
`ErrorState` (the last takes an optional `onRetry`). Use these rather than
improvising: before Phase 6 an empty list and a failed request looked
identical on several screens.

`ErrorBoundary` (in `main.tsx`, wrapping everything) stops a render crash
blanking the screen mid-appointment, and says plainly what is and isn't
saved.

### Tablet ergonomics
Handled once in `src/index.css` under `@media (pointer: coarse)` rather
than as `min-h-[44px]` on ~80 className strings — so touch targets reach
the 44px minimum on tablets, desktop stays compact, and screens added later
inherit it. Links styled as buttons are matched via `a[class*="rounded-md"]`
since they're `<a>`, not `<button>`. `canvas { touch-action: none }` stops
the browser treating a signature stroke as a scroll.

### Crash reporting
`src/core/sentry.ts`, initialised before render. **Inert unless
`VITE_SENTRY_DSN` is set** (see `.env.example`), so local dev and CI stay
silent. `sendDefaultPii` is off and fetch breadcrumb bodies are dropped —
this is a health records system and must not ship patient data to a
third-party tracker. `beforeSend` drops network errors, which would
otherwise bury real crashes under flaky-Wi-Fi noise.

## Testing (added with Phase 6)

`npm test` (vitest, happy-dom) — also `npm run test:watch`. CI runs lint →
test → build, so a failing test blocks a push.

Test files live beside what they test (`errors.test.ts` next to
`errors.ts`) and are inside `tsconfig.app.json`'s `include`, so `npm run
build` type-checks them too. Vite doesn't bundle them: nothing reachable
from `main.tsx` imports them.

### What's covered, and why these
The suite is deliberately not broad. It covers the places where being
wrong is expensive and where reading the code doesn't tell you the answer:

- **`core/errors.test.ts`** — the real disconnect strings Chrome, Firefox,
  Safari, undici and Chrome's net stack produce. If a browser changes its
  wording, the offline banner silently stops appearing; this fails instead.
  Also pins that constraint violations and RLS refusals keep their own
  wording rather than being replaced with "you're offline".
- **`charting/chartState.test.ts`** — the append-only fold. Includes an
  explicit order-sensitivity case, since order deciding meaning is the
  whole premise, and the rule that `planned` overlays rather than erases.
- **`billing/ledger.test.ts`** — money. Running balance, refunds as
  negative payments, void invoices excluded, and numeric-string coercion
  (PostgREST returns `numeric` as a string often enough that naive addition
  would concatenate).
- **`components/OfflineBanner.test.tsx`** — including the case
  `navigator.onLine` gets wrong: an observed failure must beat the flag.
- **`patients/VisitTimeline.test.tsx`** — **Phase 6's exit criterion as a
  test.** A rejected write must leave the typed note on screen.

### Both guarantees are mutation-tested
Rather than trusting green, the two that matter were verified by breaking
the source and confirming the tests caught it:

- moving `reset()` before the `await` in `VisitTimeline` — the exact
  data-loss bug — failed *"keeps the typed note on screen"*
- removing Safari's `'load failed'` signature failed *"treats a Safari
  disconnect as offline"*

Worth repeating for any new test asserting something important: a test that
passes for the wrong reason is worse than no test.

### The api.ts modules are tested through a recording client
`src/test/supabaseMock.ts` is a Proxy-based stand-in for the Supabase client
that records the chained call. Queue a result per table (several, in order,
for code that touches two tables), then assert on the query rather than only
its result.

These modules are worth testing because **the query is the behaviour**:
which day's bounds are asked for, that void invoices are excluded from "has
this visit been billed", that a payment inserts rather than updates, that
the tooth-image path lands under the dentist-only `tooth/` prefix. None of
that is observable from a screen test that mocks the api module away — which
is why all six sat at 0% while their screens were covered.

`src/test/fixtures.ts` builds complete domain objects. Partial literals cast
with `as` typecheck by fiat, so a field added to the type never shows up as
missing anywhere.

### Tests run in Asia/Manila
`npm test` sets `TZ=Asia/Manila`, because on a UTC runner every date
assertion in this app is vacuously true — local and UTC agree, so a UTC bug
passes. That is exactly how `listDueRecalls` shipped building its horizon
from `toISOString().slice(0, 10)`: correct in UTC, one day short for every
local time before 08:00 in the clinic's own zone.

`toLocalDateString` in `src/core/localDate.ts` is the single definition.
It previously existed as a copy in two components, which is how the third
caller came to reach for `toISOString()` instead.

### What coverage is, and what it isn't
About 73% of statements. The gap is deliberate rather than a backlog:
`App.tsx` and `main.tsx` are wiring, `sentry.ts` is inert without a DSN,
`PlaceholderPage` is eight lines. **`receiptPdf.ts` is the one real gap** —
jsPDF draws to a canvas, so the output is not assertable in happy-dom, and
a receipt is a money artifact. It needs a human looking at a printed page,
which belongs in the pilot.

Coverage is a map of what has been *looked* at, not evidence anything
works. The evidence is that a test fails when the behaviour it names is
removed — see the mutation notes above, and keep adding to them.

### Not covered
No browser-level verification — layout, portrait/landscape, real touch
targets, and the signature pad are unverified by automation and still need
a human on a tablet. happy-dom has no layout engine, so these tests say
nothing about how anything looks.

## Documentation

- `docs/PROCESS_FLOW.md` — how a patient moves through the clinic and the
  system: who does each step, what carries forward automatically, what the
  database guarantees, and where the flow currently stalls. Start here when
  picking the project up.
- `docs/PILOT.md` — the scripted clinic day, friction log and sign-off sheet.
- `docs/TECHNICAL_REVIEW.md` — the 2026-09-12 engineering review: 14 findings
  with the commands that establish each one, and a remediation tracker.
  **Three blockers are open** — consent wording, backups, and credential
  practice. Closed on 2026-09-12: public signup (F-1) and the production
  password-reset redirect (F-14). Read this before planning work.

  Two standing practices came out of those two fixes. **Always run
  `supabase config diff` before `supabase config push`** — a non-interactive
  run auto-proceeds through the confirmation prompt, and the diff is what
  separates the properties `config.toml` declares from the ~11 where the
  CLI's defaults differ from real remote settings (pushing those would
  disable email confirmation and drop the mail rate limit to 1s). And
  **verify a live setting from the live project, not from the file** —
  `config.toml` had `enable_signup = false` for days while production was
  still open.
  The narrative version, with reasoning, is published at
  https://claude.ai/code/artifact/c8d9e26a-556c-4e52-910f-b93c53b609ff —
  that document is point-in-time; the markdown file is what gets ticked off.
- `docs/COMPLIANCE.md` — the RLS, backup, restore and audit checklist, and
  the three items still blocking real patient data.

## Phase 7 — Staff testing & pilot (prepared; the pilot itself is the clinic's to run)

**`docs/PILOT.md` is the deliverable.** It carries the scripted clinic day,
the friction log, the shadow-run log, the pre-go-live checklist and the
sign-off sheet. Most of this phase is work only the clinic can do —
shadow-running, collecting friction, signing off — so what's in the repo is
the dataset and the script, not a completed phase.

### Two kinds of seed data, and the difference matters
- `scripts/seed-price-list.sql` — **real configuration.** 21 procedures at
  plausible Philippine rates. Survives the purge. The clinic must review
  every fee at `/billing/prices`; these are a starting point so the invoice
  builder can be exercised, not prices anyone agreed to.
- `scripts/seed-pilot-patients.sql` — **fixtures. Not real people.** 10
  patients with histories, visits, notes, charts, invoices and payments.
  Every id begins `5eed` and every `remarks` opens with
  `[PILOT DATA — not a real patient]`.

`scripts/purge-pilot-patients.sql` removes the fixtures before go-live. It
deletes by **id prefix, not by the remarks marker** — an id can't be
accidentally edited by a staff member, whereas remarks is a free-text field
on the patient form. Both seeds are re-runnable.

`audit_log` deliberately survives the purge (`patient_id` is not a foreign
key), so the record that fixture rows existed and were deleted remains.

### Blocking the pilot
**There is no active receptionist account** — both are `active = false`, and
`current_staff_role()` returns null for an inactive member, so a
receptionist sees nothing at all. The role boundary is half of what the
pilot exists to test. An admin must fix this at `/admin/staff`.

Phase 5's blockers also apply: take a backup at the end of each pilot day,
close public signup first, and don't capture *real* patients' consent
against the unreviewed draft wording — use paper until §1.3 is signed off.

## Scheduling — appointments, queue, recalls (added after Phase 7)

The largest functional gap in the roadmap, and the thing the v2 backlog's
"appointment reminders" actually depends on: until `0008_scheduling.sql`,
`visits` recorded what had already happened and nothing recorded what was
going to.

`src/features/scheduling/` — `types.ts`, `appointmentStatus.ts` (the state
machine), `api.ts`, `SchedulePage` (day sheet + live queue),
`BookAppointmentForm`, `RecallsPage`, `PatientScheduling` (profile panel),
`AppointmentCard`. Routes: `/schedule`, `/recalls`.

### The queue is derived, never stored
"Who is in the clinic right now" is today's appointments with status
`arrived` or `in_chair`. **Don't add a queue table** — where a patient is
*is* their status, and a second copy would drift from it within a day.
`isInQueue` / `isPending` in `appointmentStatus.ts` are the whole
definition, and a test asserts every status lands in at most one section of
the day sheet so nothing can vanish from the screen.

### The day only runs forwards
`TRANSITIONS` allows `booked → confirmed → arrived → in_chair → completed`,
plus writing a booking off as cancelled/no-show **before** it is seated, and
rebooking from either. `completed` is terminal. Letting a day run backwards
would make the queue meaningless — "arrived" after "completed" puts a
treated patient back in the waiting room. The UI only ever offers
`nextStatuses()`, so the buttons and the rules can't diverge.

### Seating asks who is actually treating the patient
Moving someone to `in_chair` opens a dialog naming the treating dentist,
defaulting to whoever the booking says. Whoever was pencilled in days ago is
often not who is free when the patient finally sits down, and the visit is
attributed to whoever is named here — so it asks rather than assuming. An
unassigned booking says so, which is the case where asking earns its keep.

Changing it also moves `appointments.dentist_id`, so the schedule shows
reality rather than the original guess. That reassignment goes through the
same exclusion constraint as a new booking, so it can be refused if that
dentist is already with someone — translated into words and shown inside
the dialog.

### Reception reads dentists through a function, not the staff table
`staff` lets a non-admin read **only their own row** (0002_rls.sql), so a
direct select returned nothing for a receptionist: the Dentist dropdown
offered only "unassigned", the role that does most of the booking could not
attach a booking to anyone, and the double-booking constraint never engaged
because it excludes null-dentist rows.

`bookable_dentists()` (0011) is `SECURITY DEFINER` and returns **id and name
only**. A policy would have been the obvious fix and is the wrong one: RLS is
row-level, so letting reception read those rows also hands them colleagues'
email addresses. The function does its own authorization —
`current_staff_role()` is null for anyone not active staff, so an anonymous
caller gets an empty set.

**This was invisible to the unit tests**, which all mock `listDentists`. It
only appeared when the booking flow was exercised as a signed-in
receptionist against the live database. Worth remembering before trusting a
green suite on anything RLS-shaped.

### Seating a patient creates the visit
Moving to `in_chair` inserts the `visits` row and stores `visit_id` on the
appointment, so the dentist charts against the booking instead of pressing
"Start a visit for today" by hand. Same no-re-entry thread that already runs
chart → invoice.

### A finished appointment frees the chair (0014)
The exclusion constraint excludes `cancelled`, `no_show`, **`completed` and
`pending_payment`**. The last two were added after a bug report: seating a
patient and choosing a dentist failed with "That dentist is already with
another patient at this time" when the dentist was plainly free.

Excluding only cancelled and no-show meant every completed appointment
reserved its slot for ever. Because a clinic's slots repeat, the day filled
with phantom conflicts as it went on — four dentists each had a finished
09:00, so every option in the dropdown was refused.

What the constraint is for is stopping a dentist being committed to two
patients at once, and commitment ends when treatment does. `pending_payment`
frees the chair for the same reason `completed` does: the dentist has
finished and the patient is at the counter. Holding the slot until the bill
is settled would make the front desk's speed a constraint on the dentist's
diary.

**The reproduction is worth keeping in mind**: a loop trying every
(appointment, dentist) pair inside a transaction that rolls back. The
signature of the bug was that one appointment failed against *every*
dentist, including ones with nothing booked — which is what said the
conflict was not real.

### Double-booking is refused by the database
A GiST exclusion constraint over `(dentist_id, tstzrange(scheduled_at,
ends_at))` — not a UI check, since the UI is not the only thing that will
ever write here. Cancelled and no-show rows are excluded from it, so they
free the slot. `ends_at` is maintained by a trigger rather than being a
generated column because `timestamptz + interval` is only STABLE (it depends
on the session time zone) and generated columns require immutability.
`api.ts` translates the constraint name into something a receptionist can
act on.

### Forms set `noValidate` and let react-hook-form validate
Every form with validation rules carries `noValidate`, and renders the
message itself — via `<FieldError>` from `core/components/states.tsx`, or
inline next to the field.

**Check for this by searching `required:`, not `required: true`.** Half the
forms pass a message string (`required: 'Name is required'`), and a
narrower grep missed two of them — the staff form's `type="email"` and the
intake form's `type="number"`, both of which would have had the browser
validating instead.

Without it the browser validates first, which means: messages differ per
browser and can't be styled, native bubbles sit awkwardly on a tablet, and
**the form's own guards become unreachable** — native validation stops the
submit handler ever running, so code like "Enter a payment amount" never
fires. Both layers now have a job: the field rule catches empty, the
handler catches what a `required` rule can't (a zero payment, a
non-numeric amount).

It also makes the forms testable. happy-dom computes `500 % 0.01 !== 0` in
floating point and reports `stepMismatch` on any `step="0.01"` money field,
so a native-validating form silently never submits under test — the
symptom is a test that times out with nothing rendered. Real browsers
compare with decimal scaling per spec and accept it, so this was a test-only
failure hiding behind a production-shaped smell.

### The patient chooser is a visible result list, not a dropdown
Search results render as clickable rows. This replaced a native `<select>`,
and the two sections below are kept because they record how it got here —
`size` listbox, then plain dropdown, then this.

The root problem a dropdown could not solve: **a closed `<select>` hides its
own contents**, so narrowing the search changed nothing anybody could see.
Every fix for that was a workaround for the control being wrong — a match
count beside the field, auto-selecting a single result. Both are gone; the
results are simply on screen.

**The chosen patient is held as the whole `Patient`, not an id.** That is
what removes the old bug class rather than patching it: the form cannot book
somebody who is not on screen, because what it books *is* what is on screen.
The earlier version kept an id in react-hook-form, and a `<select>` whose
chosen `<option>` had been filtered away silently fell back to its
placeholder while the id stayed — booking a patient nobody could see.

Once chosen, the chooser gives way to a "Booking for" banner with a Change
button, and the search stops running. Reception books with the patient's
name in their ear; losing it behind a collapsed control while the rest of
the form is filled in is how the wrong person gets booked.

Rows are real `<button>` elements, so the `pointer: coarse` rule gives them
a 44px target without any extra class. Both of a patient's numbers show
beside the name — the search matches either, and seeing which one you
recognised is how you tell two people with the same name apart.

**A test here must outlast the 250ms debounce.** An assertion made straight
after a click passes even if the selection is cleared a moment later; a
mutation that did exactly that survived the whole suite until a test waited
the debounce out.

### Don't use a `size` listbox for a chooser
The patient picker was `<select size={4}>`. On a tablet — which is where
this app is used — a multi-row select renders as an inline list instead of
opening the native picker: fiddly to tap and easy to read as inert, which
is exactly how it was reported ("not clickable"). Plain single-select with
a placeholder option.

Its `<label htmlFor>` also pointed at the search box above it, leaving the
control a user actually picks with unlabelled — invisible to a screen
reader, and the reason `getByLabelText('Patient')` returned the wrong
element. Label the control, not its neighbour.

### A search box that filters a `<select>` owes three things
Reported as "search in the schedule is not working or wired in the patient
drop down". The wiring was fine — the debounce fired, the options narrowed.
Three separate things around it were not:

1. **Clear the form value when the chosen option disappears.** A `<select>`
   whose selected `<option>` is removed silently falls back to displaying
   the placeholder, but react-hook-form still holds the old id. The form
   showed "— choose a patient —" and booked a patient who was nowhere on
   screen. Reconcile the value against the new results on every search.
2. **Enter must not submit.** A search box inside a `<form>` gets the
   browser's implicit submission, so typing a name and pressing Enter fired
   the booking and answered "Choose a patient first." `preventDefault` on
   Enter.
3. **Say how many matched.** A closed `<select>` hides its options, so
   narrowing the list changes nothing a user can see — which is what "not
   wired" meant. A live count next to the field is the feedback; a single
   match is selected outright. Put the count *outside* the `Field`, since
   `Field`'s label wraps the control and anything inside it joins the
   select's accessible name.

Also: don't render "No patients match that search." before the first search
has resolved — an empty list at mount is "not loaded yet", not "no results",
and the form opened by declaring itself broken.

## Chairside billing (0012, 0013)

The dentist bills what they did, while they are doing it; finishing
treatment locks the figures; reception takes the money and can change
nothing about what was charged.

    in_chair  --(dentist finishes)-->  pending_payment  --(reception)-->  completed

`pending_payment` is new, and `completed` now means *paid and gone*. It
counts as in the queue: the patient is standing at the counter and is
reception's problem until they leave.

### The rules are in Postgres, not in the buttons
A receptionist with the anon key and curl bypasses every React guard in the
app, so the buttons are a convenience and 0013 is the rule:

- **invoice_items**: dentist may insert/update/delete only while the parent
  invoice is `draft`; reception has no write at all; admin always.
- **invoices**: dentist raises the draft and edits it while draft; reception
  cannot insert or update; admin always.
- **transitions**: a BEFORE UPDATE trigger, not more RLS — RLS answers "may
  you touch this row", and whether a particular OLD → NEW move is yours needs
  both rows at once.

`canRoleTransition()` mirrors that trigger so the UI does not offer a button
the database is about to reject. **If one changes, change both.**

### Two things that look like details and are not
**`refresh_invoice_totals` is SECURITY DEFINER.** Reception records a
payment, which fires the trigger to update `invoices` — and reception has no
update on `invoices`. As an invoker function it would silently fail to move
the invoice to paid: money in, status stuck.

**`draft` is sticky in that trigger, like `void`.** Otherwise the invoice
leaves draft the moment the dentist adds a first line, unlocking nothing and
locking them out of their own running total.

### A second procedure is a second booking
Nothing reopens a finished invoice. `completed` and `pending_payment` are
both dead ends for everyone but an admin — the trigger says so in words
("Book the extra procedure separately"). A new booking makes a new visit,
which makes its own invoice.

### No app-side audit logging was added, deliberately
0006's triggers already record every admin override unconditionally,
including changes made outside the app. A log the client writes is a log the
client can skip. `scripts/test-chairside-billing.py` proves the override
lands in `audit_log` with the field name and the admin's id.

### Completing an appointment leads into billing
Finishing treatment is when someone gets billed, so **pressing Complete
navigates straight to the invoice** rather than leaving a link to follow
later. A step that has to be remembered at a busy front desk is a step that
gets skipped. The `completed` card still offers **Create invoice** for
anything completed earlier, linking to the same place:
`/patients/:id/invoices/new?appointment=<id>&visit=<id>`.

The redirect checks for an existing invoice first and opens that instead.
The offer can be taken twice — by the dentist at the chair and by reception
at checkout — and landing on a blank builder for an already-billed visit is
how a second invoice gets raised. Only `completed` redirects; every other
status change leaves you on the schedule with the next patient in front of
you.

`completed` is reachable only from `in_chair`, and seating creates the
visit, so a completed appointment always has a `visit_id` to bill against.

### The invoice builder shows the dentist's note
A chart records findings; the note records the appointment. Whoever raises
the invoice sees the note for that visit inline, because work that was done
but never charted is otherwise billed as nothing. An absent note says so
explicitly rather than rendering blank, which would read as "nothing was
done".

**Reception does not see it, and the screen says so.** `visit_notes` has no
policy at all for them (0002_rls.sql) — the same boundary that already hides
charted procedures. `getVisitNote` is not even called for reception. Do not
route around this to make the billing screen "complete": a test asserts the
note text never reaches a receptionist's DOM.

The builder uses both parameters: `appointment` to prefill the first line,
`visit` to pull charted procedures. The prefill takes the description from
the booked procedure (or the appointment's `reason` if none was chosen) and
**the fee from the price list** — the appointment already names the
procedure and `procedures.default_fee` already knows its price, so neither
is retyped at checkout. The amount stays editable, because the booked
procedure is not always what was done.

If the visit already has a non-void invoice the card shows **View invoice**
instead, and the builder warns. Both matter because the offer can be taken
twice — by the dentist at the chair and by reception at checkout. The
unique index on `tooth_record_id` stops a charted procedure being billed
twice, but a manually typed line has no such protection.

### reception_notes is not clinical
`appointments.reception_notes` is administrative — "bring HMO card", "allow
extra time" — and **reception can read it**. That is exactly why it is a
separate field from `visit_notes`, which reception cannot see at all
(0002_rls.sql). Don't put clinical content in it.

### Recalls
Their own table, because a patient can owe more than one return at once: a
six-month hygiene recall *and* the second half of a root canal.
`interval_months` null means a one-off follow-up rather than a repeating
recall. Set from the patient profile at the end of an appointment, which is
the only moment anyone reliably remembers to.

### Dates are local, never UTC
Day bounds and booking times are built from local date/time fields. Using
`toISOString().slice(0,10)` would push the clinic's evening appointments
onto the following day.

## Daily dashboard

`/` is now the clinic's day rather than a welcome message.
`src/features/dashboard/` — `api.ts`, `DashboardPage.tsx`, `StatTile.tsx`,
`types.ts`. (The old `core/components/DashboardPage.tsx` is gone; a screen
that runs queries is a feature, not shared furniture.)

### Aggregation happens in SQL
`0009_dashboard.sql` defines the `daily_dashboard` view, which returns one
row of today's numbers. **Don't move this arithmetic into the browser** —
it would mean downloading the whole ledger over clinic Wi-Fi to render one
figure, and it would put the money maths a long way from the money.

**The view is `security_invoker = true`, and that is load-bearing.** A
normal view runs as its owner, which would hand a receptionist totals
computed over rows their own policies forbid — quietly punching through the
RLS boundary the whole project rests on. Every new view here needs the same
flag. Every table it reads is front-desk readable, so all three roles get
the same correct numbers.

### Today is Asia/Manila, not UTC
The database is UTC and the clinic is not. A bare
`scheduled_at::date = current_date` would roll the day over at 8am local.
Every date comparison in the view goes through
`at time zone 'Asia/Manila'`. This becomes a per-branch setting if the
clinic ever opens elsewhere.

### Role split
- **Money** (collected, billed, outstanding, cash breakdown) — receptionist
  and admin. Not the dentist.
- **Clinical alerts for today's patients** — dentist and admin. Not
  reception, whose job is flow rather than clinical judgement.
- Queue, schedule counts, and recalls — everyone.

This is a presentation split, not a security boundary: RLS already governs
what each role can fetch. It is still tested, and mutation-tested — making
`seesMoney` always true fails "does not show takings to the dentist".

### The alerts panel repeats the chart's warning on purpose
The chart warns the dentist who is already treating someone. The dashboard
warns them while the day can still be rearranged. Cancelled and no-show
patients are excluded — warning about someone who isn't coming is noise
that makes the real warnings easier to skip past.

Numeric columns are coerced with `Number()` everywhere: PostgREST returns
Postgres `numeric` as a string often enough that naive arithmetic would
render `NaN` or concatenate two totals.

## Test environment gotchas

- **A `ref`-driven third-party component must be mocked as a class.** React
  only hands an instance to a `ref` for a class component; a bare `class`
  in a `vi.mock` is treated as a function component and called without
  `new`. See `ConsentCapture.test.tsx`, where the signature pad stub extends
  `React.Component` for exactly this reason.

- **`testTimeout` (20s) must stay above testing-library's `asyncUtilTimeout`
  (5s).** If they are equal, a failing `findBy*` is cut off by the test
  timeout and reports "Test timed out" instead of "Unable to find an
  element" with the rendered DOM — which turns every failure into a guess.
- **happy-dom mis-validates `step="0.01"`.** See the `noValidate` note
  above; it is a floating-point bug in its `stepMismatch` check, not a
  defect in the app.

## Every form control has an accessible name
Checked and held at zero: no `<input>`, `<select>` or `<textarea>` without a
wrapping `<label>`, an `id` paired with `htmlFor`, or an `aria-label`.
Placeholder-only is tolerated for search boxes and nothing else.

This is not only an accessibility concern — it is what makes a control
findable by `getByLabelText`, and an unlabelled control is usually a sign
nobody has tried to use it from the outside. The patient chooser bug was
found exactly this way: its label pointed at the neighbouring search box.

Re-check after adding a form; the scan is a short script over the JSX (see
the commit that introduced this section).

## Brand palette & logo (added post-Phase 7)

The clinic supplied their real logo — a gold gradient tooth mark and
"ToothCo Dental Clinic" wordmark on a marble background — and asked for the
app's theme to be based on it. Two things came out of that: a gold color
scale, and the logo itself in two header spots.

### The gold scale was sampled from the logo, not eyeballed
`gold-50` through `gold-900` in `src/index.css`'s `@theme` block were picked
by sampling actual pixels from the logo with PIL (filtering by HSV
saturation/hue to isolate the gold gradient from the white/marble
background), then adjusting for contrast rather than trusting the raw
sample. The logo's midtone gold is roughly `#D9A441`, which is only about
3.1:1 against white — fine for a large logo mark, not fine for button text
or focus rings. `gold-700` (`#8A6524`, ~5.3:1) and `gold-800` (`#6E4F1C`,
~7.5:1) are the darkened, WCAG-checked shades actually used for interactive
surfaces; the lighter steps exist for backgrounds/borders/highlights where
contrast against white isn't the constraint.

### gold-* is the brand/primary-action color, not a status color
Before this change, `bg-slate-800` / `hover:bg-slate-700` /
`border-slate-800` / `focus:ring-slate-400` were the de facto "primary
action / active nav state" convention across the app (checked
`ChartLegend.tsx`, `AppShell.tsx`, and `AuditLogPage.tsx` specifically to
confirm slate-800 never doubled as a semantic/status color anywhere). That
made it a mechanical, safe find-and-replace across all 28 files that used
it:
- `bg-slate-800` → `bg-gold-700`
- `hover:bg-slate-700` → `hover:bg-gold-800`
- `border-slate-800` → `border-gold-700`
- `focus:ring-slate-400` → `focus:ring-gold-500`

**Keep using `gold-*` only for brand/primary-action UI** (nav active state,
primary buttons, focus rings) — never repurpose it for success/warning/error
states. Those already have their own red/amber/green treatment elsewhere
(chart alerts, form errors, audit log) and should stay off the brand scale
so the two meanings never collide.

### The logo file
`src/assets/toothco-logo.png` is a processed copy of the clinic's upload:
background removed (thresholded on HSV saturation so the white/marble
background goes transparent while the gold gradient survives), then
cropped to the mark's bounding box. The original, unprocessed upload isn't
committed — regenerate from a fresh export if the clinic sends a new logo,
rather than editing this file directly.

It's used in two places:
- `LoginPage.tsx` — shown large and centered above the sign-in form. The
  `<h1>{CLINIC_NAME}</h1>` that used to be the visible heading is now
  `sr-only`: the logo image carries `alt={CLINIC_NAME}` for meaning, and the
  hidden heading exists only so `LoginPage.test.tsx`'s
  `getByRole('heading').toHaveTextContent(CLINIC_NAME)` still has something
  to find. Don't delete the hidden heading without updating that test.
- `AppShell.tsx` — shown small in the header next to the clinic name text.
  Here the `<img>` is `alt=""` (decorative) because the adjacent text node
  already says the clinic's name out loud via `clinicName || CLINIC_NAME`;
  giving the image its own alt text would announce the name twice to a
  screen reader.

The logo is a static asset for the "ToothCo" brand mark specifically, while
the text next to it in `AppShell` stays driven by `clinic_settings.clinic_name`
so an admin can still rename the clinic without a redeploy — only the
image is fixed to this brand.

## Design tokens

**`src/index.css` is the design system.** Tailwind v4 declares its theme in
CSS rather than a JS config, so the `@theme static` block there is the
single source for colour and radius. `src/core/theme/` stays empty on
purpose — a second place to look is a second place to drift.

`static` matters: by default Tailwind emits only theme variables it sees a
utility using, which left the chart and state tokens out of the bundle
entirely and emitted an arbitrary three of the eight golds. A token nobody
consumes yet still has to be inspectable in devtools.

### The neutral scale overrides `slate-*`
Not a new name — an override, so all 638 existing `slate-*` usages re-skin
with no component edits. The hue moves warm; **the lightness does not**.
Each step was solved to match the luminance of the Tailwind slate it
replaces, so every contrast ratio the app already relied on survives: body
text on a card stays 14.6:1, muted text 4.76:1. If you change a step, hold
its luminance or you will silently regress contrast somewhere you are not
looking.

### The rule the palette rests on
**Colour is scoped by where it may appear, not only by what it means.**

- **Gold is the clinic** — navigation, primary actions, links, focus,
  selected rows. The furniture.
- **The five chart colours never leave the chart** — inside a tooth, its
  legend, its badges, and nowhere else.
- **Record state is red, green or neutral** — never amber, because amber
  now belongs to both the chart and the brand.

A dental chart already uses saturated colour to mean something precise. If
the primary button is also a strong colour, the chart stops being scannable
at a glance — the eye has to decide what is a finding and what is
furniture. That is why the brand sits low in chroma.

| Colour            | Belongs on                                              | Never on                      |
| ----------------- | ------------------------------------------------------- | ----------------------------- |
| `gold-900/800`    | Nav, headers, and any gold on the charting screen        | —                             |
| `gold-700/600`    | Primary buttons, links, hover — away from the chart      | Beside a tooth glyph          |
| `gold-500`        | Focus rings, small accents                               | Text on white                 |
| `gold-100`        | Selected rows, subtle tints                              | Page background               |
| The five chart colours | Inside a tooth, the legend, tooth badges            | Buttons, tiles, chrome, pills |
| `state-attention` | Offline, unpaid, overdue, long waits, destructive confirm | Decoration                   |
| `state-settled`   | Paid, settled, "no medical alerts"                       | Decoration                    |
| Neutral           | Everything else, including part-paid                     | —                             |

### The gold scale, with the numbers behind it
Contrast against white text, or against ink where the tone is too light to
carry white. These were measured, not picked by eye.

| Token      | Hex       | Use                                        | Contrast     |
| ---------- | --------- | ------------------------------------------ | ------------ |
| `gold-900` | `#4A3611` | Nav bar; **any gold near the chart**       | 11.5:1 white |
| `gold-800` | `#6B4E18` | Headers, pressed states                    | 7.7:1 white  |
| `gold-700` | `#8A661F` | Primary buttons                            | 5.3:1 white  |
| `gold-600` | `#A57C26` | Hover                                      | 4.6:1 ink    |
| `gold-500` | `#C29A3D` | Focus ring, accents                        | 6.6:1 ink    |
| `gold-300` | `#E3C87E` | Borders on gold surfaces                   | 10.6:1 ink   |
| `gold-100` | `#F6ECD2` | Selected rows, tints                       | 14.8:1 ink   |
| `gold-50`  | `#FBF6E9` | Lightest tint                              | —            |

**Keep the page background near-white.** A gold brand tempts a cream
ground; tinting it makes gold stop reading as gold and washes the app out
under clinic lighting. Gold should be the only warm thing carrying weight.

### A swatch can never sit on a dark saturated ground
Sharper than the guard below, and the reason the chart legend's selected
state is a light tint rather than a solid gold button. On `gold-700` the
five chart colours measure **1.02:1 to 2.05:1** — they disappear. On
`gold-100` they run 2.18:1 to 4.39:1, and the gold border still carries
"selected" at 4.46:1. Asserted in `theme.test.ts`.

### The gold guard
Gold is the clinic's colour, applied from Phase C. It is deliberately low in
chroma so it never competes with a tooth, and one rule is load-bearing:

**`gold-700` and lighter must never sit beside a tooth glyph.** Against the
chart's crown amber it measures **1.65:1** — the same colour at a glance.
`gold-900` measures **3.61:1**. So on the charting screen gold drops to 900;
everywhere else 700 is the primary. `src/core/theme.test.ts` asserts both
numbers, so editing either value fails the build rather than quietly
breaking the chart.

### Chart colours exist twice, for now
`--color-chart-*` in CSS and hex literals in `chartVocabulary.ts`, which
needs real values for SVG fills. The test pins them together so they cannot
drift. A later phase collapses them into one source — at which point the
`"node"` entry in `tsconfig.app.json`'s types (there only so that test can
read the stylesheet) can go too.

### No amber in record state
Amber is the chart's crown and the brand's hue. A third meaning would make
all three ambiguous, so paid/unpaid/waiting are red, green or neutral —
asserted by hue in the token test. Anything merely informational (a
part-paid invoice, a short wait) takes a neutral, not a warning colour.

## UI primitives (Phase B)

`src/core/components/ui/` — `Dialog`, `ConfirmDialog`, `toast`. Built on
Radix rather than generated by the shadcn CLI: `shadcn init` rewrites
`index.css` with its own HSL variable scheme, and this project's tokens are
hand-authored there with contrast figures behind each value. Radix is what
shadcn wraps anyway, so the outcome is the same — source we own — without
adopting a second theming system.

### Why Radix, and why not the alternatives
| Option | Verdict | Why |
| --- | --- | --- |
| Tailwind v4 `@theme` | adopted | Already installed; v4 defines tokens in CSS, so the design system uses the framework's own mechanism rather than a bespoke one. |
| Radix primitives | adopted | Supplies the focus management and ARIA the app lacked. Tailwind-native, so no second styling system. |
| shadcn/ui CLI | skipped | It is Radix plus Tailwind classes, which is what we wrote by hand — but `shadcn init` rewrites `index.css` with its own HSL variable scheme, and the tokens there are hand-authored with contrast figures behind each value. |
| MUI · Chakra · Mantine | no | Each brings its own styling runtime and theme system. Two to maintain, and the existing utility classes would all have to go at once. |
| daisyUI | no | Fast to apply, but CSS-only: no focus trap, no ARIA wiring. It solves the branding complaint and leaves the accessibility one. |
| Headless UI | not enough | Good, and from the Tailwind team, but a smaller set than Radix — the table, the toast and the data-dense pieces would still be hand-built. |

### `window.confirm` is gone; don't bring it back
`ConfirmDialog` is the pattern for every irreversible action. It owns its
own pending state, so a slow network can't be double-confirmed by an
impatient second tap, and **it shows a failure inside itself** rather than
behind it — a failure the person who pressed the button can't see is a
failure nobody reads. Mutation-tested: closing on error fails a test.

### Toasts confirm; errors stay inline
`toastSaved` is for "that worked" only. Inline confirmation near a control
is often already scrolled past on a tablet by the time the request returns,
so success is anchored to the viewport. **Errors stay inline**, next to the
input that caused them, because a toast disappears and an error has to
persist.

### Native `<select>` stays — a deliberate reversal
The upgrade plan proposed replacing selects with a Radix listbox. That is
wrong for this app: a native select opens the OS picker on a tablet, which
is the better touch target, and the one select bug reported so far was
fixed by moving *to* a native dropdown. Swapping them would also break every
`selectOptions` call in the suite for no user gain.

### Bundle
Phase B costs +100 kB raw, +32 kB gzipped. Measured by building with the
imports stashed, not estimated — an earlier guess was wrong by a factor of
six because it compared against a stale number.

Route splitting since fixed the real weight problem — see below.

## Route splitting

Everything behind the login is `lazy()`. First load went from **1,560 kB to
556 kB** — measured by summing what `index.html` actually asks for, which
includes the module preloads, not just the entry chunk.

The largest win is the PDF stack: `receiptPdf` (392 kB), `html2canvas`
(195 kB) and `index.es` (148 kB) now arrive only when someone opens an
invoice. Most sessions never generate a receipt.

**The auth screens and the shell stay eager.** They are what someone
actually waits for; splitting them would add a round trip to the one thing
on the critical path.

The Suspense boundary lives **inside `AppShell`, around the outlet**, so the
nav bar stays put while a route arrives rather than the screen blanking.

### `src/core/routes.ts` is the single import map
`App.tsx` builds its `lazy()` components from `routeChunks`, and the shell
warms from the same object. **Don't inline a dynamic import at a call
site** — a second specifier for the same page fetches a second copy of the
chunk and warms nothing.

### Warming is short, role-aware, and declines on metered connections
Splitting means tapping "Schedule" waits on a fetch, so once signed in the
shell warms the handful of routes that role opens first — five at most.
Warming everything would put the bundle back on the wire and undo the
split. Reception gets the invoice screen warmed because it drags in the PDF
stack, the worst thing to wait for with a patient at the desk; a dentist
does not, and gets the chart instead.

It skips entirely when `navigator.connection.saveData` is set: these
tablets sometimes fall back to a phone hotspot, and speculatively pulling
half a megabyte of someone's mobile data is not a trade to make for them.

`requestIdleCallback` has a `setTimeout` fallback that is **not
theoretical** — Safari on iPad only gained it in 16.4, so on an older clinic
tablet the fallback is the live path. Both are tested.

## UI components (Phase C, partial)

`src/core/components/ui/` — `Button`/`ButtonLink`, `Field` with `TextInput`
/ `TextArea` / `NativeSelect`, `PageHeader`, `Card`, plus Phase B's `Dialog`
/ `ConfirmDialog` / `toast`. Reach for these before writing a class string.

### Two properties worth not breaking
**`Button` defaults to `type="button"`.** A bare `<button>` inside a form
submits it, and that bug only shows when someone clicks the wrong control.
Submitting has to be asked for.

**`Field` wraps its control rather than pairing by `id`/`htmlFor`.** Both are
valid HTML; only one can drift. An `htmlFor` pointing at the wrong element
typechecks perfectly and is exactly what made the patient chooser
unreachable. Where the migration found a redundant `id`/`htmlFor` pair it
dropped the id.

**`TextInput` must keep passing `ref` through to the DOM node** —
react-hook-form's `register()` registers the field through it. If that
broke, every form in the app would submit empty values while looking
correct. There is a test for exactly that.

### Progress, and what is left
Hand-rolled label wrappers went from 32 to 10, and total `className` uses
from 682 to 615. `PatientForm` — the largest form, 23 fields — is fully
converted.

Still hand-rolled: the ten remaining labels in the auth screens and the
audit log, which pair by `htmlFor` in a shape the migration did not match,
and most primary buttons outside the three converted files. These are
consistency debt rather than risk; convert them when touching those files.

### Why this refactor was safe
The suite queries by **accessible name and role**, never by class. So the
282 tests passing through a 19-field conversion is real evidence the names
survived — and a failing query during this work means a control genuinely
stopped saying what it said, not that a style changed.

## Print (Phase E)

Receipts are PDFs, but the treatment ledger, the patient record and the
tooth chart are printed straight from the browser — for the paper file, for
a referral, and during the pilot to reconcile against the old ledger. The
rules live at the end of `src/index.css`.

**The trap: don't hide `[role="button"]`.** The odontogram gives every tooth
and every surface that role, so a rule hiding everything with it prints a
blank chart — the one document most worth printing, and a failure nobody
notices until a sheet comes out of the printer empty. The hide rule is
scoped to real `<button>` elements and button-styled links. `theme.test.ts`
asserts this, and fails if `[role="button"]` is ever added to that list.

Also deliberate: `print-color-adjust: exact` on SVG, because a chart in
greyscale cannot distinguish red decay from a blue filling; scroll
containers unclipped, since a clipped table on paper is a lost record;
`thead` repeated on every sheet; and `.fixed` / `.sticky` hidden, or the
offline banner and the unsaved-marks bar repeat on every page.

**Not verified visually.** These rules are asserted in the stylesheet and
nothing more — no one has put a page through a printer. That check belongs
in the pilot.

## Screen work (Phase D)

Four changes, each with a stated reason — but **these are informed guesses,
not findings.** Nobody has watched a receptionist use this. The friction log
in `docs/PILOT.md` should confirm or overturn them.

### The wait time escalates
Reception is asked "how long have they been waiting" more than anything else
on the schedule, so the figure grows and reddens instead of sitting at a
constant 12px: quiet under 15 minutes, bold at 15, large and red at 25.
Thresholds are `WAIT_NOTICEABLE` / `WAIT_OVERDUE` in `appointmentStatus.ts`
— a clinic that habitually runs ten minutes behind should not be shouted at
for it, or the red stops meaning anything.

**Amber is not available here**, which is why this needed rebuilding rather
than restyling: it means "crown" on the chart and carries the brand. Record
state is red, green or neutral. A test asserts no wait ever renders amber.

### The patient in the chair gets an edge
`in_chair` is the one row that is happening rather than pending, so it
carries a left border rather than only a differently coloured badge.

### Medical alerts sit above the day's numbers
A dentist opening the dashboard at the start of a shift needs to know who
cannot be treated as planned before they read how many are booked, and an
alert under four stat tiles is an alert someone scrolls past. The order is
asserted by a test and mutation-checked.

### The chart says that it scrolls
`.scroll-hint-x` shades whichever edge still has teeth behind it, using
`background-attachment` rather than a scroll listener — nothing to keep in
sync. The odontogram is wider than a tablet in portrait, and a chart that
silently clips reads as a chart with teeth missing.

### Not done
The rest of the tablet pass. Spacing, reach and one-handed use cannot be
judged from a desktop browser, and guessing at them would be inventing
findings.

## Formatting

Prettier, config in `.prettierrc.json`. The settings were read off the
existing code rather than chosen from defaults — no semicolons, single
quotes, double quotes in JSX — so adopting it did not also impose a style
change nobody asked for.

**Check with `npm run format:check`, not `prettier --check src`.** CI runs
`prettier --check .`, which covers `supabase/functions/` and the config
files as well. Checking only `src` passes locally and fails CI the moment
an Edge Function is edited — which is exactly how the `reset_password`
commit broke the build.

`printWidth` is **110** because it produced the least churn: 74 files
touched against 82 at 100 and 91 at 90. It also suits code carrying long
Tailwind class strings, which cannot usefully be broken anyway.

**SQL and Markdown are in `.prettierignore`.** The migrations use alignment
to keep policy blocks scannable and the docs hard-wrap at ~76 characters;
Prettier would reflow both into something harder to read in a diff. The
editor settings disable format-on-save for those two languages to match.

`.vscode/settings.json` is committed — the `.gitignore` was excluding it,
which would have made the shared formatting rules a local preference rather
than a shared one. Open the project and VS Code will suggest the three
extensions it expects.

## Typography — an open recommendation, not yet done

The app currently uses Tailwind's default system font stack; no webfont is
loaded. The design review recommended **Figtree** for the whole interface —
open apertures at small sizes, tabular figures, and enough weight range to
build hierarchy without a second face — with a mono face for identifiers
that must not be misread.

Tabular figures are the part that actually matters here rather than the
family: the ledger, the day sheet and the chart all put digits in columns,
and proportional numerals make those columns ragged. The app already asks
for `tabular-nums` in those places, which the system stack honours
unevenly across platforms.

Not adopted, because a webfont is a first-load cost on clinic Wi-Fi and the
system stack is legible. Revisit if the pilot reports the numbers being
hard to scan.
