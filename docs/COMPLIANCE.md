# Compliance, security & backup checklist

Phase 5 of the build roadmap. This is the written checklist its exit
criteria calls for.

**Status: NOT READY for real patient data.** Three items below are blocking,
and one of them (backups) means data loss today would be permanent. The
audit logging and RLS work is done and verified; the operational and legal
work is not.

Last reviewed: 2026-09-11, against migrations 0001–0006.

---

## 1. Blocking items

### 1.1 There are no restorable backups — BLOCKING

`supabase backups list` on project `xzpheuvthmsucvhytdjh` returns:

```json
{"region":"ap-northeast-2","walg_enabled":true,"pitr_enabled":false,"backups":[]}
```

An **empty backup set** and **point-in-time recovery disabled**. If the
database were lost or corrupted right now, there is nothing to restore
from. `scripts/backup.sh` is currently the only protection, and it is
manual — nobody has run it on a schedule.

**To fix, pick one (or both):**
- Upgrade the project to a paid Supabase plan, which enables daily
  automated backups (and PITR on higher tiers). This is the real fix — it
  is the only option that survives someone forgetting.
- Run `./scripts/backup.sh` on a schedule, to encrypted off-site storage.
  Acceptable only as a stopgap, and only if the restore in §3 has actually
  been rehearsed.

Do not put real patient records in this system until one of those is true.

### 1.2 Public signup is enabled — BLOCKING

`GET /auth/v1/settings` reports `disable_signup: false`, so anyone on the
internet can create an auth user against this project.

**Impact is limited but real.** A self-signed-up user gets no `staff` row,
so `current_staff_role()` returns null and every RLS policy denies them —
**no patient data is reachable**. What they can do is create junk accounts
and make the project send confirmation emails, which contradicts the design
(accounts are supposed to be admin-created through the `manage-staff` Edge
Function) and is a needless abuse surface for a clinic system.

**To fix — two routes, both one step:**

1. Supabase Dashboard → Authentication → Sign In / Providers → Email →
   turn off "Allow new users to sign up".
2. Or from the repo, `supabase/config.toml` already declares
   `auth.enable_signup = false`; run `supabase config push`.

Route 2 has been verified safe: `supabase config diff` reports
`{"update": 1, "local_only": 0}`, and the only entry with
`"declared": true` is `auth.enable_signup`. The other 13 differences are
`"declared": false` — CLI built-in defaults that the config file does not
declare, and which `config push` therefore leaves alone. That distinction
matters, because several of them would be harmful if pushed: it would
disable email confirmations, disable TOTP MFA, and change `site_url`.

**Never run `supabase init` in this repo.** It overwrites `config.toml`
with a full template of those defaults, at which point they all become
`declared: true` and the next push applies them.

Verify afterwards:
```bash
curl -s "$VITE_SUPABASE_URL/auth/v1/settings" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['disable_signup'])"
# expect: True
```

### 1.3 The consent and privacy notice has not had legal review — BLOCKING

`CONSENT_TEXT` in `src/features/patients/historyOptions.ts` (version
`v2-draft`) is a full draft covering the Data Privacy Act of 2012 (RA
10173) disclosures, replacing Phase 2's one-paragraph placeholder. **It was
written by a developer, not a lawyer.**

It also contains bracketed placeholders the clinic must fill in before it
means anything:
- `[RETENTION PERIOD]` — how long records are kept after a patient's last
  visit
- `[CLINIC CONTACT / DATA PROTECTION OFFICER]` and `[CONTACT DETAILS]` —
  who a patient contacts to exercise their rights

**A review needs to confirm at minimum:**
- that consent is the right lawful basis here, or whether the clinic should
  rely on the RA 10173 provisions for medical treatment instead
- whether the clinic must register a Data Protection Officer with the
  National Privacy Commission, and whether it meets the thresholds for
  registration as a personal information controller
- the retention period, against both DPA and professional record-keeping
  obligations
- whether the notice adequately covers the hosting provider as a personal
  information processor located outside the Philippines

Until sign-off, leave the draft warning visible in `ConsentCapture.tsx`.
When it is signed off, bump `CONSENT_TEXT_VERSION` — old signatures stay
attached to the wording that was actually on screen when they were given.

---

## 2. Done and verified

### 2.1 Audit logging — ACTIVE

Implemented in `0006_audit.sql`.

**Writes are logged by database triggers, not by the app.** An `AFTER
INSERT OR UPDATE OR DELETE` trigger fires on every one of: `patients`,
`medical_histories`, `dental_histories`, `consents`, `visits`,
`visit_notes`, `tooth_records`, `patient_files`, `invoices`,
`invoice_items`, `payments`, `staff`, `procedures`. This matters: a
client-written audit log is worthless, because the client that skips the
entry is exactly the client you need the log for. The trigger fires no
matter what wrote the row — this app, a future app, the SQL editor, psql.

The trigger is `SECURITY DEFINER` so the log write cannot be refused by the
acting user's own policies — **nobody can opt out of being logged** — and
it deliberately does not swallow errors: if the log cannot be written, the
transaction fails, because an unaudited write to a health record is worse
than a failed one.

`audit_log` is **append-only**. There is no update or delete policy for any
role, admin included. Editing it means dropping to the service role, which
is itself a deliberate, traceable act.

**Field names are recorded, never values.** `changed_fields` lists which
columns changed. Storing before/after values would turn the audit log into
a second copy of every medical history ever written — a larger breach
surface in the name of protecting one. "Which fields changed, by whom,
when", plus a restorable backup, covers the forensic need.

`patient_id` and `staff_id` are plain uuids, **not** foreign keys, so an
entry outlives its subject. A foreign key would have made patients
undeletable (the `AFTER DELETE` trigger names the row it just deleted) and
a cascade would have erased the evidence of the deletion.

**Known limitation — reads are weaker than writes.** PostgreSQL has no
SELECT trigger, so "who looked at this record" can only come from the
client (`src/core/auditView.ts`, wired into the patient profile, chart, and
ledger screens). A modified client could omit them, and the insert policy
lets a client write a view entry naming any patient. The `operation` column
keeps view entries distinguishable from trigger-written ones so the two are
never confused. Writes carry a hard guarantee; views are best-effort.

Readable and exportable at `/admin/audit` (admin only), filterable by
operation, table and date, with CSV export of everything matching the
filters rather than just the page on screen.

### 2.2 Row-level security — REVIEWED

Reviewed against role scenarios. Confirmed by reading migrations 0002–0006.

| Scenario | Expected | Enforced by |
|---|---|---|
| Receptionist reads dentist's clinical notes | denied | no `visit_notes` policy at all (0002) |
| Receptionist reads a tooth chart | denied | no `tooth_records` policy at all (0002) |
| Receptionist opens a per-tooth X-ray | denied | `tooth/` prefix policies (0004) |
| Receptionist reads the audit log | denied | admin-only select (0002) |
| Receptionist deletes any record | denied | every delete policy is admin-only |
| Anyone edits a signed consent | denied | no update policy on `consents` (0002) |
| Anyone edits a recorded payment | denied | no update policy on `payments` (0002) |
| Anyone edits or deletes an audit entry | denied | no update/delete policy at all (0006) |
| Deactivated staff member uses a still-valid token | denied | `current_staff_role()` checks `active`; plus GoTrue ban (Phase 1) |
| Signed-up stranger with no staff row | denied everywhere | `current_staff_role()` returns null |
| Receptionist forges an audit 'update' entry | denied | insert policy restricts clients to `operation = 'view'` (0006) |
| Non-admin changes a procedure's price | denied | admin-only write on `procedures` (0005) |

**Open question for the clinic — not a bug, a decision.** Files uploaded
through the patient profile's Attachments section (`attachments/` prefix)
are readable by **reception**, while per-tooth images attached in the chart
(`tooth/` prefix) are not. So the same X-ray is reception-visible or not
depending on which screen uploaded it. That inconsistency was inherited
from Phase 2 and has been left rather than silently changed, because the
answer depends on whether reception legitimately handles X-rays (insurance,
referrals). Decide, then make both prefixes match.

### 2.3 Credentials in the repo — CHECKED, CLEAN

`supabase/.temp/` was tracked in git. Checked: `pooler-url` contains a
username and host only, **no password**, and the project ref it exposes is
already written in CLAUDE.md. Nothing was leaked. The directory is now
gitignored and untracked anyway — it is machine-local CLI churn and the
wrong place for a secret to land later.

`.env.local` is gitignored and has never been tracked. `backups/` is now
gitignored so a dump cannot be committed by accident.

---

## 3. Restore procedure — DOCUMENTED, NOT YET TESTED

**This procedure has not been rehearsed.** Writing it down is not the same
as knowing it works; §1.1 stays blocking until someone has restored into a
scratch project and logged in against it.

### Taking a backup

```bash
# Preferred: direct pg_dump (no Docker needed)
brew install libpq
export PATH="$(brew --prefix libpq)/bin:$PATH"
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<pw>@<host>:5432/postgres'
./scripts/backup.sh ~/clinic-backups

# Alternative: via the Supabase CLI, which runs pg_dump in a container
# and therefore needs Docker Desktop or Podman running
./scripts/backup.sh ~/clinic-backups
```

Produces `<stamp>-roles.sql`, `<stamp>-schema.sql`, `<stamp>-data.sql`.

### Rehearsing the restore

1. Create a **new, empty** Supabase project. Never rehearse into the live
   one.
2. Restore in order — roles, then schema, then data. Order matters: data
   won't load without the tables, and policies reference roles.
   ```bash
   psql "$SCRATCH_DB_URL" -f <stamp>-roles.sql
   psql "$SCRATCH_DB_URL" -f <stamp>-schema.sql
   psql "$SCRATCH_DB_URL" -f <stamp>-data.sql
   ```
3. Point a local build at the scratch project (`.env.local`) and confirm,
   as an actual test rather than a glance:
   - a staff member can log in
   - a patient's medical history, chart, and ledger all render
   - a **receptionist** login still cannot see clinical notes — restoring
     the rows without the policies would be the dangerous failure here
   - `select count(*) from audit_log` is non-zero
4. Record the date of the rehearsal in §5 below, and delete the scratch
   project.

### Known gap: Storage is not backed up

`scripts/backup.sh` dumps the **database only**. Consent signatures,
X-rays, ID scans, and per-tooth images live in the `patient-files` storage
bucket and are **not** in any of the three files.

A restore from these dumps therefore produces a database whose
`consents.signature_image_url` and `patient_files.storage_path` rows point
at objects that no longer exist — signed consent would be unprovable. This
is an open task, not a solved one. The bucket needs its own sync (the
Supabase CLI has no storage-dump command; `rclone` or the Storage API are
the usual routes).

---

## 4. Monitoring cadence

Not yet established — Phase 8 owns it. The intended cadence:

- **Monthly:** confirm the automated backup set is non-empty; run a manual
  export; skim the audit log for unexpected access.
- **Quarterly:** re-run the RLS scenario table above against a real
  receptionist login, not just by reading policies.
- **Annually:** rehearse a full restore; re-check the privacy notice
  against any change in clinic practice.

---

## 5. Sign-off

| Item | Status | Signed off by | Date |
|---|---|---|---|
| RLS reviewed against role scenarios | done (by reading policies) | — | 2026-09-11 |
| RLS verified against live logins | **not done** | — | — |
| Audit logging active | done | — | 2026-09-11 |
| Automated backups confirmed | **FAILED — none exist** | — | 2026-09-11 |
| Manual export routine | script written, **dump path untested** | — | — |
| Restore rehearsed | **not done** | — | — |
| Storage backup | **not solved** | — | — |
| Public signup disabled | **not done** | — | — |
| Consent + privacy notice legal review | **not done** | — | — |

This phase is not complete until every row above has a name and a date in
it. The exit criteria asks for review by someone versed in the Data Privacy
Act; that person has not yet seen it.
