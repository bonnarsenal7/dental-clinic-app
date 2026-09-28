# Patients — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

## Phase 2 — Patient Records Module (done)

### What's built
- `src/features/patients/PatientsPage.tsx` — list + debounced search by
  name/cell/phone (`ilike` across all three), a **Patient type** filter and a
  Type column (0023), and the dentist scope that narrows the whole list to
  their own patients.
- `src/features/patients/PatientForm.tsx` — shared patient type (0023) +
  demographics + medical history + dental history form (used for both
  registration and edit; `canChooseType` decides whether the type is
  offered).
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

The name is **prefilled with the patient's own** when they are signing for
themselves, which is the ordinary case and one the record already knows.
Asking a receptionist to retype a name that is on file is how one record
ends up with it spelled two ways.

It **clears** the moment anyone else is named as the signer. Leaving the
patient's name above a guardian's signature is worse than leaving it blank:
the record would assert that the wrong person agreed. Prefilled, not fixed —
the name on file is not always the one somebody signs with.

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

## The patient record: one way around it, and today first

Three changes from the design review, all placement rather than behaviour.

### Patient tabs live on the layout route, not on each screen
`PatientTabs` renders inside `AssignedPatientRoute`, which is the one thing
wrapping every `/patients/:id/…` screen. Profile · Dental chart · Billing,
plus `‹ Patients`. The Chart tab is dentist/admin only, mirroring the RLS on
`tooth_records` and the route guard — a tab that bounces is worse than no tab.

Each screen used to carry its own way out ("Dental chart", "Billing", "Back
to profile", "Patient profile"), so where you could go depended on which
screen you were on, and `/patients/:id/edit` offered nothing. Those links are
**deleted, not duplicated** — the profile keeps only Edit, which is an action
on that screen rather than a destination.

**The tabs are not rendered above the "isn't assigned to you" refusal.** A
dentist who may not open a record should not be handed tabs into the rest of
it.

`/invoices/:id` is outside this route — its URL names no patient — so it
keeps its own "Back to ledger".

Gold-100/900 for the active tab, not the 700 used for a primary action: this
bar also renders above the odontogram, where the gold guard applies.

### The profile opens on today, not on the intake form
Order is now: name and type · **medical alerts** · summary strip · *Patient
details* (folded) · histories · consent · scheduling · visits · files.

- **`MedicalAlerts` is on the profile**, which it was not: it was on the
  chart and the dashboard, so the screen reception checks somebody in on said
  nothing about an anaesthesia allergy. Same component, and the same lesson
  as the chart — cover the component *and* its presence on the screen.
- **The ten intake fields are behind a disclosure**, closed by default. They
  are read when somebody needs an address, and they were sitting between the
  name and everything clinical.

### The summary strip answers what used to need three screens
`PatientSummary` — age, balance, next appointment, last visit.

**Age is computed from the birthday**, not read from `patients.age`, which
was true the day somebody typed it. The column stays as the fallback for a
record with no birthday.

**It fetches its own three figures with `Promise.allSettled`**, so a failed
billing query costs that one number and says so, rather than taking the
profile with it — the same reasoning as visits and invoices being separate in
`VisitTimeline`. Balance is red only when something is owed; nothing owed is
ordinary, not an achievement, so it stays neutral rather than going green.

**Next appointment is the soonest still to come**, not the newest row:
`listPatientAppointments` returns newest first, and cancelled and completed
bookings are excluded. Mutation-checked — taking `[0]` fails a test.

## Billing lives in the patient's history, never in the chart

`VisitTimeline` on the patient profile renders two sections: **Current
visit** (the chairside panel, for any visit still open) and **Visit
History** (the table of every visit and what it came to). A tooth chart
records findings — what is there and what was done to it.
What anybody was charged is a different question, and the chart does not
raise it: **no section, no summary, no "view invoice" link, no import.**

`src/features/charting/noBilling.test.ts` holds that. It is a structural
test rather than a behavioural one because the thing being protected is an
*absence*, and an absence is exactly what a behavioural test cannot notice
coming back. It fails on an import from billing, on the words invoice /
billing / billable anywhere in the feature, and on an `/invoices/` path.

### Current visit: open is decided by the invoice, not the role
`isVisitOpen()` in `billing/visitHistory.ts`:

    no invoice, visit is today   open — the dentist's line-item entry
    a draft                      open — the same, still editable
    anything else                closed — the visit lives in the table only

Role only decides who may act, mirroring 0013: a dentist or admin gets the
panel; reception never does, and takes payment from the table instead.

**Line entry is offered only on a visit dated today.** Offering it on a
visit from six months ago would create a draft nothing can finish — "finish
treatment" exists only on an appointment that is in the chair.

**The panel waits for billing to load.** Until the invoices arrive an
existing draft reads as "no invoice", and the panel would offer entry
against a bill it cannot see — so it is not shown until they do.

### Visit History is one row per visit
Date / Treatment/Procedure / Amount / Paid / Balance, newest first, built by
`buildVisitHistory()` and drawn by `VisitHistoryTable`.

**Per visit, not per procedure, because payments are per invoice.** A
payment is recorded against a whole invoice, never a line, so a per-line
Paid or Balance does not exist to show. The visit's procedures share its
Treatment cell, with the tooth where one was charted.

- **Balance = Amount − Paid**, derived, never stored.
- **A draft shows no money** — "still being billed", and no invoice link. A
  total that may still move is not presented as what is owed, and reception
  must not take money against it.
- **A voided bill owes nothing** and says "voided". Where a visit has both,
  the live invoice speaks for it, not a newer void (`invoicesByVisit()`).
- **Never billed** reads "Nothing billed" with blank money, not ₱0.00 owed.

Ten rows a page; **List all** grows the same table in place — no page, no
modal — and folds back. Paging only appears past ten rows, and the page is
clamped at render so a refresh that shortens the history cannot strand it.

**The note is one tap away, not inline.** Tapping a row's date opens it: the
dentist's note, Open invoice, and — for reception on a bill still owing —
Accept payment. Five columns have no room for a note, and dropping past
notes from the profile was not an option.

**Visits and invoices are fetched separately, and must stay that way.**
They were briefly loaded with one `Promise.all`, which meant a failed
invoice query hid every clinical note the dentist had written. The table
still lists every visit, and opens onto its note, when billing fails — it
says the amounts could not be loaded. A test covers exactly that.

### `refresh` must be a stable callback
`ChairsideBilling` reports its total from an effect that depends on
`onTotalChange`, and that report refreshes `VisitTimeline`. The old
`onChanged={() => void refresh()}` was a new function every render, so the
effect re-ran every render: refresh, re-render, refresh — **a refetch loop
for as long as a visit was open**, over clinic Wi-Fi. `refresh` is now a
`useCallback` passed as-is.

**The test for it has to return a fresh array per call.** With
`mockResolvedValue`, every fetch resolved to the same array, React skipped
the identical state update, and the loop never started — the test passed
with the inline callback put back. It uses `mockImplementation` now, which
is what a real network does, and fails when the callback is inlined.

## Patient type: regular and orthodontic (0023)

`patients.patient_type` — `regular` | `orthodontic`, default `regular`,
CHECK-constrained. **A categorisation, plus one word.** Both kinds use the
same record, the same histories, the same chart, the same invoices, the same
recalls. It is a label to find people by. If a real difference ever appears,
this column is what it hangs off.

### The one difference: Contract, not Consent
At the clinic's request, an orthodontic patient's signed agreement is called
a **Contract**; everyone else's stays **Consent**. `agreementTerm(type)` in
`types.ts` is the single place that decides, used by the signature panel
(`ConsentCapture`'s `patientType` prop), the profile's history section,
reception's registration, and the intake review (following the type chosen
there).

**A word only.** The row is still in `consents`, the text signed is the same
`CONSENT_TEXT`, and nothing else behaves differently. A real orthodontic
contract — fees, duration, retention terms — would be its own wording, its
own `CONSENT_TEXT_VERSION`, and its own legal review.

The patient's own intake form always says Consent: the type is reception's
to choose, after the patient has signed. An unknown type reads as Consent,
which is what every patient signed before the distinction existed.

Every patient that existed before it is `regular` — that is how they have
been treated — and the default keeps the pilot seed working untouched.

### Set at registration, changed only by an admin
Reception registers patients (0015 territory: the front desk knows which the
patient is), so the type is a field on the registration form like any other.
**Moving a patient between categories afterwards is an admin's.**

RLS cannot express that: a policy grants the whole row, and reception must
keep the rest of it to edit a phone number. So `patients_guard_type`, a
BEFORE UPDATE trigger, refuses a *changed* `patient_type` from anyone but an
admin — the same shape as 0013/0015/0020. An update that leaves the type
alone passes, which is what lets reception go on saving the same form.

`PatientForm` takes `canChooseType`: true at registration, and on the edit
page only for an admin. The form always submits the value and
`updatePatientHistory` always sends it; unchanged, the trigger allows it.
Don't "optimise" that by dropping the field from the payload for
non-admins — the trigger is the rule, the form only mirrors it.

### Finding them
The patients list has a **Patient type** filter (All / Regular /
Orthodontic) beside the search box, and a **Type** column.
`searchPatients(query, dentistId, patientType)` adds `eq('patient_type', …)`
only when a type is chosen; All means no filter, not a default category. It
composes with the dentist scope, so a dentist filtering by type still sees
only their own patients.

### What deliberately did not change
Visit history, billing, recalls, the chart, the dashboards and the end-of-day
report all behave identically for both types, and none of them reads the
column. The profile reads it for the badge and for Contract/Consent, nothing
more.

**Where it is shown**: the patients list (Type column and filter), the
registration review, and a neutral badge beside the name on the profile —
the clinic asked for that one after it was first left off. Neutral on
purpose: a category is not a record state (red/green) and not the brand
(gold). Showing it is all any of these do; nothing behaves differently.

**`patientTypeIsOnlyALabel.test.ts` holds that**: a structural test that
fails if any file outside the patients feature so much as mentions
`patient_type`. Same shape, and same reason, as charting's
`noBilling.test.ts` — the thing being protected is an absence, which a
behavioural test cannot notice coming back. If the clinic ever asks for a
real difference, delete that test in the commit that introduces it, on
purpose rather than by accident.

**The registration review does show it.** That screen is what the patient
reads before signing, so everything about to be saved belongs on it —
including the category. `RegistrationReview.test.tsx` covers it, and is that
component's first test: it had none, at 0% coverage, until then.

Mutation-checked: offering the type to a non-admin on the edit page,
ignoring the filter in the search, dropping the chosen type at registration,
naming `patient_type` in another feature, and dropping the type row from the
review each fail a test.

## Patient self-intake (0026)

A new patient types their own registration on the clinic tablet. Reception
taps **Patient fills in form** on the patients list; a new tab opens the
form, the staff tab locks, and the patient's answers wait for reception to
review before they become a record.

`src/features/patients/intake/` — `api.ts`, `IntakeApp.tsx` (the whole app
on the intake address), `IntakePage.tsx` (form → review → sign → send),
`StartIntakeButton.tsx`, `IntakeQueue.tsx` (on the patients list),
`IntakeReviewPage.tsx` (`/intakes/:id`, reception/admin). `src/core/`
`intakeHost.ts` and `intakeLock.ts`; `src/features/auth/IntakeLockScreen.tsx`.

### The patient's tab has no staff login, because it is another address
The same build is served at `toothco-intake.vercel.app` (a second domain on
the same Vercel project). Browsers keep sign-ins per address, so that tab has
**no session at all** and talks to Supabase as `anon`. `main.tsx` renders
only `IntakeApp` there — no router, no login screen — whatever path is typed.

**Don't serve the intake from a path on the main address.** A tab on the
same address shares reception's login: the patient could type `/patients`
and be in. That is the whole reason for the second domain, and why a
"kiosk mode" that only hides the nav was rejected.

`anon` can call exactly two functions, neither of which reads anything back:
`intake_status(code)` and `submit_intake(code, …)`. The code is one-time,
144 random bits, valid two hours, and only its sha256 is stored.

**The code travels in the URL fragment** (`/#<code>`), never the path or
query: a fragment is not sent to the server, so it is not in Vercel's logs,
and the page needs no SPA rewrite — which matters because the project has
none (deep links on the main site 404 on reload).

### The staff tab locks
`intakeLock.ts` stores a flag in localStorage; `ProtectedRoute` renders
`IntakeLockScreen` instead of **any** staff route while it is set, including
`/change-password`. A reload or a URL typed into that tab still meets the
lock, and every staff tab on the device locks together. Unlocking re-checks
the signed-in staff member's password with Supabase — not a PIN, which a
patient can watch someone type. **Signing out clears it**, so the idle
timeout firing mid-intake leaves the login screen, not a lock.

The lock hides; it does not enforce. What enforces is that the tab the
patient types in has no session. Suggest iPad **Guided Access** to stop the
patient switching tabs at all.

The new tab is opened **before** the code is fetched — Safari blocks a tab
opened after an await as a pop-up. If it is blocked anyway, the button
offers a link, which is a fresh tap.

### Staging, then review
`submit_intake` writes `intake_submissions`, not `patients`. Reception sees
"N patient forms waiting for review" on the patients list, checks the
answers against **possible duplicates** (same name or cell number), chooses
the patient type (0023 — the patient never does), and accepts or discards.

`accept_intake` is **SECURITY INVOKER** — reception's own RLS applies — and
creates the patient, both histories and the consent in **one transaction**,
which the by-hand `registerPatient` does not. Its column mapping mirrors
`registerPatient`: **keep the two in step** when a field is added.

- `patient_id` is reserved on the submission, so the signature uploads to
  `signatures/<patient_id>/intake-<id>.png` before the patient exists, and a
  retried accept finds it already there.
- The consent's `signed_at` is when the patient signed; `staff_id` is the
  reviewer, since no staff member was beside the patient.
- **Once reviewed, the payload and signature are erased** by the guard
  trigger — a second copy of a medical history is a breach surface. The
  audit trigger records that the intake happened, under the patient's id.
- Nothing the patient typed is editable in staging; corrections are made on
  the record after acceptance, as ordinary audited edits.

### Not verified
**0026 is applied to the live project.** Checked there with the anon key,
the way the patient's tab calls it: `intake_status` answers `unknown` for a
made-up code, `start_intake` is refused, both tables read back empty, and
`submit_intake` refuses a bad code with its own wording.

Not exercised yet: a real code end to end, spending a code under two
simultaneous submits, `accept_intake` under reception's RLS, and Safari's
pop-up behaviour on an iPad. The unit tests mock Supabase.

The patient signs the same unreviewed draft consent wording as at the desk
(`docs/COMPLIANCE.md`), now without staff beside them.
