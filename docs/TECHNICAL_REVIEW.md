# Technical review — findings and remediation tracker

Senior engineering/analyst review of the system at revision `246b4cf`,
12 September 2026.

**The full review, with the reasoning behind each finding, is published at:**
https://claude.ai/code/artifact/c8d9e26a-556c-4e52-910f-b93c53b609ff

**This file and that document are deliberately not the same thing.** The
published review is a point-in-time assessment and does not change. This
file is the working tracker: finding IDs, evidence, the concrete action,
and its status. Tick things off here. Don't copy the narrative across —
this codebase has already been bitten once by the same helper existing in
two places (see `toLocalDateString` in CLAUDE.md).

Related: `COMPLIANCE.md` holds the Phase 5 checklist and overlaps with
F-1 to F-3 below. Where they disagree, the more recent verification wins —
and both should be re-run rather than believed.

---

## Status

| Severity | Count | Open | Closed |
| -------- | ----- | ---- | ------ |
| Blocker  | 4     | 3    | 1      |
| High     | 3     | 2    | 1      |
| Medium   | 3     | 3    | 0      |
| Low      | 4     | 4    | 0      |

**Verdict: not ready for real patient data.** The gaps are operational and
compliance, not structural.

Changes since the 2026-09-12 review:

- **F-1 closed** 2026-09-12 — public signup disabled on the live project and
  verified from the auth endpoint; no orphaned accounts were created while
  it was open.
- **F-14 added and closed** 2026-09-12 — found while diffing the auth config
  for F-1: production password reset emailed a `localhost` link. `site_url`
  and the redirect allowlist now point at the deployed app, verified by
  generating a recovery link rather than by reading config.

---

## Verification commands

Re-run these rather than trusting the status column. Each one is how the
corresponding finding was established.

```sh
# F-1 — is public signup actually closed on the live project?
#        Reads the file, not the repo config. This is the whole point.
URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2- | tr -d '"'"'"' ')
KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2- | tr -d '"'"'"' ')
curl -s "$URL/auth/v1/settings" -H "apikey: $KEY" \
  | python3 -c "import json,sys; print('disable_signup:', json.load(sys.stdin).get('disable_signup'))"
# want: disable_signup: True      got on 2026-09-12: False

# F-3 — does the platform hold any recoverable copy?
supabase backups list
# got on 2026-09-12: {"backups":[], "pitr_enabled":false, ...}

# F-5 — is the odontogram keyboard reachable?
grep -rn "tabIndex\|onKeyDown" src/features/charting/
# want: a roving tabindex and a key handler. got: neither.

# F-7 — coverage by area.
#        The excludes matter: without them this reports ~74% because it
#        counts type-only files and the test helpers themselves. The table
#        below was produced with exactly this command.
npm test -- --coverage --coverage.reporter=text \
  --coverage.include='src/**' \
  --coverage.exclude='src/**/*.test.*' \
  --coverage.exclude='src/test/**' \
  --coverage.exclude='src/**/types.ts'

# F-14 — does a recovery link actually point at production?
#         generate_link returns the link instead of emailing it, so this
#         verifies the real behaviour without mailing a staff member.
#         Never print the key or the full link: the link carries a token.
SRK=$(supabase projects api-keys --project-ref xzpheuvthmsucvhytdjh \
  | python3 -c "import json,sys; print(next(k['api_key'] for k in json.load(sys.stdin)['keys'] if k['id']=='service_role'))")
curl -s "$VITE_SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H "Content-Type: application/json" \
  -d '{"type":"recovery","email":"<an admin address>","redirect_to":"https://dental-clinic-app-lilac.vercel.app/reset-password"}' \
  | python3 -c "import json,sys,urllib.parse as u; print(u.parse_qs(u.urlparse(json.load(sys.stdin)['action_link']).query)['redirect_to'][0])"
# want: https://dental-clinic-app-lilac.vercel.app/reset-password
# Repeat with an unlisted origin; it must fall back, not echo what you asked for.

# Any auth user without a staff row? (needs SUPABASE_DB_URL from
# .env.backup.local; read-only)
psql "$SUPABASE_DB_URL" -At -c \
  "select count(*) from auth.users u
     left join public.staff s on s.id = u.id where s.id is null;"
# got on 2026-09-12: 0

# F-8 — the N+1
grep -n "findInvoiceForVisit" src/features/scheduling/SchedulePage.tsx

# migrations in sync?
supabase migration list
```

---

## Blockers — must close before any real patient record

### F-1 Public signup is enabled on the live project — CLOSED 2026-09-12

`supabase/config.toml` sets `enable_signup = false` and explains why. It
was never pushed. The live auth settings endpoint returned
`"disable_signup": false`.

RLS contains the damage: a self-registered user has no `staff` row, so
`current_staff_role()` returns null and every table denies them. **No
patient data is reachable.** What is exposed is unbounded `auth.users`
growth, an outbound mailer a stranger can drive, and a pool of accounts an
admin must tell apart from real staff.

The process lesson is the larger one: a control that exists in the repo and
not in production is not a control.

- [x] `supabase config diff` reviewed first — 1 declared change
      (`auth.enable_signup`), 13 undeclared remote properties left alone
- [x] `supabase config push` — `1 property pushed`
- [x] Re-ran the F-1 verification command: `disable_signup: True`, and
      `supabase config diff` now reports zero *declared* drift
- [x] Audited `auth.users`: 5 users, 5 staff rows, **0 orphaned** — nobody
      self-registered while it was open

**Diff before push mattered and should be the standing practice.** The CLI
warns that a non-interactive run auto-proceeds through its confirmation
prompt. The 13 undeclared properties were places the CLI's *defaults*
differ from real remote settings — pushing them would have disabled email
confirmation, cut the mail rate limit from `1m0s` to `1s`, and turned off
TOTP and Twilio. `config push` left them alone, as the comment in
`config.toml` predicts, but never rely on that without diffing.

Incidental confirmation from the account audit: the two deactivated
receptionists are `active = false` **and** login-banned in GoTrue, so the
two-layer deactivation works in production, not only under test.

Supersedes `COMPLIANCE.md` §1.2, which should now be marked resolved.

### F-2 Consent wording has never had legal review — OPEN

`CONSENT_TEXT_VERSION` is still `v2-draft` and the text still contains
bracketed placeholders. The signature screen carries a visible draft
warning, which is correct handling.

Because consent is stored per signing event with its version attached,
re-consenting later is cheap — but every signature gathered before review
has to be gathered again.

- [ ] Practitioner familiar with RA 10173 reviews the text
- [ ] Fill the bracketed placeholders
- [ ] Bump `CONSENT_TEXT_VERSION`, remove the draft notice in
      `ConsentCapture.tsx`
- [ ] Until then: capture consent on paper

Owner: **the clinic**. This is the only finding the development team cannot
close. Same as `COMPLIANCE.md` §1.3.

### F-3 Backups are unencrypted, unautomated, and exclude all files — OPEN

`supabase backups list` still returns an empty set with `pitr_enabled:
false`. Manual dumps exist in `~/clinic-backups/` — plaintext, on a laptop,
containing complete patient records.

A restore rehearsal has been done, and it earned its keep: it caught the
`search_path` defect that silently discarded every `invoice_items` and
`payments` row while `psql` exited 0 (fixed in `0007`).

Three gaps remain:

1. Nothing is automated — every backup depends on someone remembering.
2. The dumps are unencrypted at rest, a larger breach surface than the
   database itself, which is at least access-controlled.
3. **Storage objects are not backed up at all.** A restore reproduces every
   `consents` row pointing at a signature image that no longer exists. The
   database looks healthy; the evidence is gone.

- [ ] Confirm the platform's own backup/PITR state and retention
- [ ] Encrypt local dumps at rest; move them off the laptop
- [ ] Extend `scripts/backup.sh` to the `patient-files` bucket
- [ ] Rehearse a restore that ends with *opening a restored signature*, not
      a row count

Same as `COMPLIANCE.md` §1.1.

### F-4 A database credential was exposed in tooling — ROTATED, practice open

A production database password was pasted into a command recorded in a
session transcript. It was treated as compromised and rotated, and
confirmed dead by an auth failure on the old value. Immediate risk closed.

Listed as blocking because the practice that produced it is not. Secrets
for a system holding health records reach a tool through a gitignored file,
never a command line or a chat window.

- [ ] Confirm the old credential is dead
- [ ] Confirm no dump, log or tracked file contains it
- [ ] Standing rule: secrets only in `.env.local` / `.env.backup.local`
- [ ] Review platform access logs for the exposure window, if available

---

## High

### F-5 The tooth chart cannot be operated without a pointer — OPEN

Every tooth and surface carries `role="button"` and a label, but there is
no `tabIndex` and no key handler anywhere in `src/features/charting/`.
Assistive technology announces ~260 buttons that cannot be focused or
activated — worse than an unlabelled chart.

WCAG 2.1 SC 2.1.1 (Keyboard), Level A, on the screen the system exists to
provide. `ToothGlyph.tsx:68` documents this as a reasoned deferral, and the
reasoning is sound — 260 tab stops would be worse. The work is still undone.

- [ ] Roving `tabindex`: one tab stop for the chart, arrows within it
- [ ] Enter/Space applies the selected condition
- [ ] Interim, if the above is not scheduled: drop `role="button"` so
      screen readers stop advertising unreachable controls

### F-14 Password reset sent a `localhost` link — CLOSED 2026-09-12

Found while diffing the auth config for F-1. The live project had:

```
auth.site_url:                 http://localhost:3000   (CLI default)
auth.additional_redirect_urls: []
```

`ForgotPasswordPage.tsx:20` sends
`redirectTo: ${window.location.origin}/reset-password`. Supabase honours a
`redirectTo` only when it matches `site_url` or appears in the allowlist.
From the deployed origin it matched neither, so it fell back to
`site_url` — and the staff member received a reset link pointing at
`http://localhost:3000/reset-password`.

**There is no second recovery path.** `manage-staff` implements only
`create`, `deactivate` and `reactivate` — no admin-initiated password
reset. And `StaffManagementPage.tsx:198` tells an admin restoring an
account that the user "can reset it from the login screen", which is
precisely the flow in question. A staff member who forgot their password
mid-clinic-day would have needed someone in the Supabase dashboard.

Severity is High rather than blocking because it locks people out rather
than exposing anything.

- [x] Declared `site_url` and `additional_redirect_urls` in `config.toml`,
      diffed (2 declared changes, 11 undeclared left alone), pushed
- [x] Verified end to end **without sending mail to anyone**: the admin API's
      `generate_link` returns the link instead of emailing it, so the
      `redirect_to` it produces can be inspected directly

```
asked for https://dental-clinic-app-lilac.vercel.app/reset-password
  -> https://dental-clinic-app-lilac.vercel.app/reset-password   (honoured)

asked for https://attacker.example.com/steal
  -> https://dental-clinic-app-lilac.vercel.app                  (refused)
```

The second probe is the one worth keeping. It shows the allowlist actually
refuses an unlisted origin rather than trusting `redirect_to`, and that the
fallback is now the production app instead of localhost. A recovery token
travels in that URL, so an over-broad allowlist would be a way to hand
somebody a working session — which is why the entries are exact paths and
not `…vercel.app/**`.

Vercel **preview** deployments are deliberately not allowlisted: reset from
a preview build will fall back to production. Add the origin if that ever
matters.

Still open, and deliberately not done here — it is a feature, not the fix:

- [ ] Consider a `reset` action on `manage-staff`, so an admin can recover a
      locked-out staff member without going to the Supabase dashboard.
      `StaffManagementPage.tsx:198` tells admins the user "can reset it from
      the login screen", which now works — but only if the staff member can
      still receive mail at the address on file.

### F-6 No clinic day has been run through the system — OPEN

`docs/PILOT.md` has the script, the seed data and the sign-off sheet. The
friction log is empty. Every ergonomic decision — touch targets, the
escalating wait time, dashboard order, one-handed use — is an informed
guess by the people who built it, as CLAUDE.md itself says.

- [ ] Run the scripted day alongside paper, with F-1 to F-4 closed
- [ ] Fill the friction log — that is the deliverable
- [ ] Staff sign-off before cutover

---

## Medium

### F-7 Billing is least covered; receipt generation effectively untested — OPEN

Coverage by area, 2026-09-12:

| Area       | Statements | Covered |
| ---------- | ---------- | ------- |
| Dashboard  | 54 / 61    | 88.5%   |
| Auth       | 121 / 144  | 84.0%   |
| Patients   | 251 / 316  | 79.4%   |
| Core       | 132 / 170  | 77.6%   |
| Scheduling | 230 / 300  | 76.7%   |
| Admin      | 128 / 167  | 76.6%   |
| Charting   | 214 / 289  | 74.0%   |
| Billing    | 237 / 410  | 57.8%   |
| **Total**  | 1367 /1877 | 72.8%   |

`receiptPdf.ts` sits at ~5%. The reason is legitimate — jsPDF draws to a
canvas and there is little to assert in happy-dom — but a receipt is the
document a patient carries away.

- [ ] Extract the receipt's data assembly (line order, totals, receipt
      number) and test it apart from the drawing
- [ ] Add "print a real receipt" to the pilot checklist

### F-8 The schedule issues one query per completed appointment — OPEN

`SchedulePage.tsx:46-51` loops completed appointments asking whether each has
been invoiced. Twenty finished appointments is twenty-one round trips, over
the flaky Wi-Fi the app is explicitly built to tolerate.

- [ ] Replace with one query: invoices where `visit_id in (…)` and status
      not void; index client-side

### F-9 Crash reporting may be inert in production — OPEN

Sentry is configured with care — PII off, request bodies dropped from
breadcrumbs, network errors filtered. It initialises only when
`VITE_SENTRY_DSN` is set. Whether it is set in Vercel could not be verified
from the repository.

- [ ] Confirm the DSN is present in the hosting environment
- [ ] Trigger one deliberate production error and confirm it arrives

An unverified monitoring pipeline should be assumed broken.

---

## Low

### F-10 Shared UI primitives exist but adoption is partial — OPEN

24 files hand-roll the primary button's class string instead of using
`Button`; 9 hand-rolled label wrappers remain in the auth screens and audit
log. This is the pattern that produced the header misalignment fixed on
2026-09-11: a hand-styled control drifts from what the shared stylesheet
knows about.

- [ ] Convert opportunistically when touching a file
- [ ] Consider a lint rule forbidding new occurrences

### F-11 The documented colour rule contradicts the code — OPEN

CLAUDE.md states record state is "red, green or neutral — never amber". In
practice amber signals attention in 18 places: offline banner, partial
payments, unsaved chart marks, non-critical medical alerts. `theme.test.ts`
only guards the `--color-state-*` tokens, so the contradiction passes CI.

The practice is coherent; the documentation is not. A future contributor
will eventually "fix" working code to match the rule as written.

- [ ] Decide which is true; make the other match. Likely: allow amber for
      transient attention, restrict the prohibition to persistent record
      status

### F-12 Duplicated invoice status styling — OPEN

The same status colour map is defined twice: `InvoiceDetailPage.tsx:24` and
`PatientLedgerPage.tsx:16`.

- [ ] Lift into one exported constant beside the billing types

### F-13 No guard against recording an overpayment — OPEN

Payments are append-only and negative amounts are the refund mechanism.
Nothing prevents a payment larger than the balance; the invoice goes
`paid` and the ledger shows a negative balance. Arguably correct as a
credit, but a typo and a genuine credit look identical.

- [ ] Warn when the amount exceeds the outstanding balance; require
      confirmation. Do not block it — credits are real

---

## What this review did not cover

Stated so the confidence attached to each finding is legible.

- **Nothing was run in a real browser.** happy-dom has no layout engine, so
  no claim here about spacing, touch targets, portrait behaviour, the
  signature pad or printed output is backed by observation. F-5 is from
  code structure, not a screen-reader session.
- **RLS was reviewed as written, not exercised per role against live
  data.** The policies read correctly. That is not the same as signing in
  as a receptionist and confirming the denials.
- **No load or concurrency testing.** The double-booking exclusion
  constraint is the right mechanism but was not tested under simultaneous
  writes.
- **The `manage-staff` Edge Function was read, not invoked.** Its admin
  check looks correct and is not proven.
- **Coverage is a map of what has been looked at, not evidence anything
  works.** The mutation-tested subset is evidence; the rest is an indicator.

---

## What is strong, and should not be traded away

Recorded because a tracker that lists only problems invites someone to
"simplify" the parts that are carrying the system.

- **Authorization is in the database, not the UI.** RLS on all 17 tables,
  zero `using (true)` policies, and reception's zero access to
  `visit_notes` / `tooth_records` enforced by having no policy at all.
- **Clinical and financial history is append-only.** Chart, consent,
  payments and audit are logs; a correction is a new row. The chart folds
  by `seq`, not `created_at`, because a batch shares a transaction time.
- **The audit log cannot be edited by anyone,** admin included, and records
  column names rather than values so it does not become a second copy of
  every medical history.
- **Key tests are mutation-verified** — confirmed to fail when the
  behaviour they name is removed. That is the difference between coverage
  and evidence.
