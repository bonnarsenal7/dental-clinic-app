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

## Feature notes live beside the code

The detailed notes for each feature are in a CLAUDE.md inside its folder,
which Claude Code reads when working there. **Read the relevant one before
changing a feature** — the decisions, gotchas and "why" live there:

- `src/features/patients/CLAUDE.md` — records, intake form, consent/contract,
  patient type, self-intake (0026), visit history
- `src/features/billing/CLAUDE.md` — invoicing, chairside billing (0012/0013)
- `src/features/scheduling/CLAUDE.md` — appointments, queue, recalls, 0015
- `src/features/charting/CLAUDE.md` — the odontogram (Phase 3)
- `src/features/dashboard/CLAUDE.md` — daily dashboard, payment queue (0019)
- `src/features/dailyClose/CLAUDE.md` — expenses, salary, Close Clinic, EOD
  report (0020–0022, 0024, 0027)
- `src/features/calendar/CLAUDE.md` — dentist calendar (0025)
- `src/CLAUDE.md` — brand palette, logo and design tokens: the colour rules
  and contrast figures behind `src/index.css`
- `src/core/components/CLAUDE.md` — UI primitives and components
- `docs/ROADMAP.md` — the original nine-phase build plan

## Phase 1 — Auth & Data Model (done)

### Schema
SQL migrations live in `supabase/migrations/` (run in order). Every
migration in the folder is applied to the live project, currently 0001-0022
— but trust `supabase migration list`, not this number, which goes stale
the moment the next one lands.
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
mostly hold them. Nav items are role-aware: `Staff`, `Clinic Settings`,
`Audit Log` and `Charting` only render for `admin`, and a dentist's nav is
`Dashboard` and `Patients` alone — see "The dentist's view" below.

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

## Phase 5 — Compliance, security & backups (code done; sign-off outstanding)

**Read `docs/COMPLIANCE.md` first.** It is the phase's actual deliverable —
the written checklist the exit criteria asks for — and it records three
BLOCKING items that mean the system is not ready for real patient data:
no restorable backups exist, public signup is enabled, and the consent text
has not had legal review. Don't treat Phase 5 as done because the code is.

### Audit logging is done with triggers, not app code
`0006_audit.sql` attaches an `AFTER INSERT OR UPDATE OR DELETE` trigger to
every table holding patient data, money, or access control — 13 in 0006,
plus `daily_expenses`, `salary_entries` and `clinic_days` from 0020. A new
table in that category gets the same trigger in its own migration. **Never add
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
jsPDF draws to a canvas, so the layout is not assertable in happy-dom, and
a receipt is a money artifact. `receiptPdf.test.ts` swaps jsPDF for a
double that records what `text()` is asked to write, which covers the
wording and the amounts; the layout still needs a human looking at a
printed page, which belongs in the pilot.

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

`scripts/reset-clinic-data.sql` is the wider reset the clinic asked for:
**keeps staff, patients with their histories and consents, the price list
and clinic settings; clears everything else** — diary, visits, charts,
money, the day's books, closures, attachment rows, the dentist calendar,
self-intake forms and codes, and the audit log. **A new table of activity
needs adding to it** — it had silently fallen behind 0025 and 0026 until the
first reset after them. It runs from a session with
`supabase db query --linked -f scripts/reset-clinic-data.sql`; export the
tables it clears first (the 2026-09-29 reset wrote JSON per table to
`~/clinic-backups/`, outside the repo, since the rows name patients). Two
orderings in it are load-bearing: `clinic_days` is deleted **first**, or
0020's guard refuses to delete a closed day's expenses and salary, and
`audit_log` **last**, because every delete above it writes audit rows.
Storage objects are untouched, so attachments outlive their rows.

It is a script, not a migration, on purpose: a destructive one-off should
not be recorded in migration history, where it would re-run against any new
database.

### Blocking the pilot
**There is no active receptionist account** — both are `active = false`, and
`current_staff_role()` returns null for an inactive member, so a
receptionist sees nothing at all. The role boundary is half of what the
pilot exists to test. An admin must fix this at `/admin/staff`.

Phase 5's blockers also apply: take a backup at the end of each pilot day,
close public signup first, and don't capture *real* patients' consent
against the unreviewed draft wording — use paper until §1.3 is signed off.

## The visit note is part of the bill (0016)

Written in the chairside panel, locked by the same "finish treatment" that
locks the amounts, and **readable by reception**. There is no separate "add
visit note" section any more.

**0016 reverses the boundary Phase 1 was built around, at the clinic's
instruction.** `visit_notes` is its own table precisely so reception could
have `visits` without the write-up — RLS cannot hide one column of a row a
role can otherwise select. Two consequences, neither optional:

- **`CONSENT_TEXT` is now wrong.** It tells patients reception "can see your
  contact and billing details but not the dentist's clinical notes or your
  tooth chart". The first half of that is false as of 0016, in a document
  signed under RA 10173 and already waiting on legal review. This widens
  what that review must cover.
- **Tooth charts did not move.** Reception still has no policy at all on
  `tooth_records`, so the second half stays true.

`visit_is_open(visit_id)` is the lock: no invoice has left draft and no
appointment for the visit is finished. A function rather than a status
lookup because a visit can exist with no appointment — the chart can start
one — and the note must stay writable there too.

**Phase 6's exit criterion moved with the field.** The test that a rejected
write leaves the typed note on screen now lives in
`ChairsideBilling.test.tsx`. Losing a clinical note to a dropped connection
is the failure it exists to prevent, and the note changing sections does not
change that.

## The dentist's view

A dentist works from the dashboard and their own patients' records. The
diary, billing and registration are the front desk's.

### Screens and routes
A dentist's nav is `Dashboard` and `Patients`. Hiding a link is not enough
on its own, so `App.tsx` refuses them too:

    receptionist, admin   /schedule  /recalls  /billing  /patients/new
    admin                 /charting  /billing/prices  /admin/*
    dentist, admin        /patients/:id/chart

A refused route sends them to `/`. `AppShell.test.tsx` pins the nav per
role; `AppShell` and `App.tsx` must agree, or a dentist gets a link that
bounces.

### A dentist sees only today's patients — on screen
"Their own" means **the patient has an appointment booked with them today**
(Manila's day), **not cancelled and not a no-show**. No booking today, no
patients — an empty list, at the clinic's choice. It was "any booking, past
or future" until the clinic narrowed it: a dentist now reaches a record only
on a day they are treating that patient. The same rule is applied in two
places, and both must change together:

- `searchPatients(query, dentistId)` — an `appointments!inner(dentist_id)`
  embed filtered by `appointments.dentist_id`. **`!inner` is the filter**:
  without it the embed only attaches appointments and every patient still
  comes back, so the list looks scoped and is not. The join column is
  stripped from what is returned.
- `AssignedPatientRoute` — a layout route around every `/patients/:id/…`
  screen (profile, edit, chart, ledger, new invoice). For a dentist it asks
  `isAssignedToDentist()` first and renders "This patient isn't assigned to
  you" rather than the screen. **The screen does not mount until the check
  answers**, so another dentist's patient is never fetched by it or logged
  as viewed. Other roles pass straight through.

**This is a screen scope, not RLS — by the clinic's choice.** Row-level
security would have hidden the records from a dentist covering for a
colleague, and from a walk-in charted before reception booked them. So the
database still lets a dentist read any patient. Don't describe it as a
security boundary, and don't "fix" it with a policy without asking.

Consequences, all known:
- **A walk-in** with no booking against the dentist does not appear in their
  list until reception books them.
- **Yesterday's patient is out of reach** from midnight, chart and notes
  included — a record left unfinished at close of day needs a booking today,
  or an admin.
- **A dentist covering a colleague** sees the patient only once reception
  reassigns the booking (seating does this).
- **`/invoices/:id` is not scoped** — its URL does not name the patient.

**Register patient is hidden from a dentist** and the route refuses them.
A patient a dentist registered would have no booking with them, so it would
vanish from their own list the moment it was saved.

Mutation-checked: letting an unassigned patient through, and dropping the
`dentist_id` filter from the search, each fail a test.

### A dentist reads a bill; the front desk raises it and takes the money
The clinic asked for this after seeing a dentist offered both. **Nothing is
hidden — the whole invoice stays visible**, lines, totals, payments taken,
commission and the receipt download. What goes is the two controls:

- **`+ New invoice`** on the patient ledger renders for reception and admin
  only, and `/patients/:id/invoices/new` now refuses a dentist like the rest
  of the front desk's routes. A dentist still bills what they did from the
  **Current visit** panel on the patient's profile — that is the chairside
  path (0013) and it is untouched.
- **The Record payment form** on `/invoices/:id` renders for reception and
  admin only; a dentist reads "Payment is taken at the front desk." in its
  place, so the gap says something rather than looking like a missing
  section. Settling a bill also checks the patient out, and 0015 refuses a
  dentist that move anyway — the form was offering them a write that would
  half-fail.

A screen scope, not a new rule in the database: 0002 still lets a dentist
insert a payment, and 0013 still lets them raise a draft. Mutation-checked —
showing either control to a dentist fails a test.

### Commission (0017)
`invoices.commission_amount`, `numeric(12,2)`, `>= 0`, default `0`.
Reception enters it on the invoice screen (`InvoiceDetailPage`, the
"Dentist commission" box); a dentist reads it on their dashboard and cannot
change it.

It lives on the invoice because that is the one row per visit already
carrying the amount it is a share of. **Reception writes it through
`set_invoice_commission()`, never an update.** Reception has no update on
`invoices` (0013), and a policy granting one would hand them the total and
the status along with it. The function is `SECURITY DEFINER`, sets that one
column, allows only receptionist/admin, and refuses a negative amount or a
void invoice. A guard trigger (`invoices_guard_commission`) stops any other
role changing the column by the ordinary update path a dentist still has on
a draft.

It is its own form with its own Save, not part of Record payment: payments
are append-only, and commission is one figure per invoice that may need
correcting. 0006's audit trigger already records every change to it.

**Later changes that build on this — read them before changing commission:**
- **It belongs to a day: the invoice's `created_at`, in Manila.** Closing
  that day locks it for everyone, admin included — the check is in
  `invoices_guard_commission` (0020), and the invoice screen shows the box
  as locked. A commission not entered before its day closes cannot be
  entered at all. See "Daily close (0020)".
- **It is attributed to a dentist through the invoice's visit**, not stored
  against one: the appointment's dentist, else the visit's `staff_id` if
  that person is a dentist, else "No dentist recorded" (0021). That split is
  frozen into the end-of-day report at closing (0022).
- **It is not a condition of Paid** on the payment queue — see "Awaiting
  payment queue (0019)".

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
does not, and gets the chart instead. A dentist does not warm the schedule
either — their nav does not offer it and the route refuses them.

It skips entirely when `navigator.connection.saveData` is set: these
tablets sometimes fall back to a phone hotspot, and speculatively pulling
half a megabyte of someone's mobile data is not a trade to make for them.

`requestIdleCallback` has a `setTimeout` fallback that is **not
theoretical** — Safari on iPad only gained it in 16.4, so on an older clinic
tablet the fallback is the live path. Both are tested.

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

## Formatting

Prettier, config in `.prettierrc.json`. The settings were read off the
existing code rather than chosen from defaults — no semicolons, single
quotes, double quotes in JSX — so adopting it did not also impose a style
change nobody asked for.

**Run the verification as its own command, and read the output, before
committing.** Chaining `npm run build && git commit` in one shell line does
not stop the commit — the commit runs whatever the build printed, and a red
build reaches `main`. That happened three times in one session before it was
written down here. `npm test` does not typecheck; only `npm run build` does.

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
