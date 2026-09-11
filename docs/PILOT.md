# Phase 7 — staff testing & pilot

Phase 7's exit criteria is *"a full clinic day runs through the app with no
data-loss incidents, and staff sign off to go live."* Most of this phase is
work only the clinic can do. This document is the part that can be prepared:
the dataset, a scripted day that actually exercises the exit criteria, and
somewhere to record what breaks.

---

## 1. Before the pilot can start

### 1.1 There is no active receptionist account — BLOCKING

Both receptionist accounts are `active = false`. Since
`current_staff_role()` returns null for an inactive staff member, a
receptionist logging in today sees **nothing at all**.

Half the point of the pilot is the role boundary — that reception can run
the front desk but cannot read the dentist's clinical notes or the tooth
chart. That cannot be tested without a working receptionist login.

**Fix:** an admin creates or reactivates one at `/admin/staff`. Use a real
person's account, not a shared one — the audit log attributes every write
to whoever was signed in, and a shared login makes it useless.

### 1.2 Blockers inherited from Phase 5

`docs/COMPLIANCE.md` §1 still lists three, and **1.1 and 1.3 there matter
for a pilot even with fixture data**:

- **No automated backups.** A shadow-run generates real entries the clinic
  will not want to re-key. Take a manual backup at the end of each pilot
  day: `./scripts/backup.sh ~/clinic-backups`.
- **Public signup is enabled.** Close it before staff start using the app
  in anger: `supabase config push`.
- **Consent text is an unreviewed draft.** If the pilot captures signatures
  from *real* patients — including during a shadow-run — those signatures
  are against wording no lawyer has approved. Either get §1.3 signed off
  first, or capture consent on paper for the duration of the pilot.

---

## 2. What is loaded

```bash
psql "$SUPABASE_DB_URL" -f scripts/seed-price-list.sql       # real config
psql "$SUPABASE_DB_URL" -f scripts/seed-pilot-patients.sql   # fixtures
```

**21 procedures** — a starter price list at plausible Philippine rates.
This is *real configuration*, not fixture data: it survives the purge, and
**the clinic must review every fee** at `/billing/prices` before billing
anyone. They are a starting point so the screens can be exercised, not
prices anyone agreed to.

**10 fixture patients** with medical and dental histories, 9 visits with
clinical notes, 15 tooth records, 5 invoices and 4 payments. Deliberately
varied so the pilot meets the awkward cases, not just the happy path:

| Patient | What it exercises |
|---|---|
| Maria Clara Santos | Two visits; tooth 16 charted decayed *then* filled — the append-only history |
| Jose Miguel Reyes | Penicillin allergy + hypertension; a `planned` treatment on 26; a **part-paid** invoice |
| Ricardo Bautista | Anaesthesia allergy, angina; a missing tooth and a crown |
| Kristine Joy Aquino | **No signed consent on file** — exercises the unsigned path |
| Lorna Villanueva | Diabetic, sulfa allergy; an **unpaid** invoice |
| Nathaniel Ocampo | Paediatric — **primary teeth** (75, 85) in FDI numbering |
| Fernando Castillo | Two missing teeth, partial denture |

Every fixture patient's `remarks` opens with `[PILOT DATA — not a real
patient]`, and every id begins `5eed`.

---

## 3. The scripted day

Run these in order, as the role named. Each maps to something the exit
criteria claims. Record anything surprising in §4 — **including things that
merely felt slow or confusing.** Those are the findings that matter; a
crash reports itself.

### Reception

1. **Find a patient by partial name.** Search `dela` → Angelica Dela Cruz.
2. **Find a patient by phone.** Search `0927` → Ricardo Bautista.
3. **Register a walk-in end-to-end** — demographics, medical history, dental
   history, then the signature. Use a fictional name and tick a few
   conditions. *Does the form match the paper intake sheet, field for
   field? Anything missing, in the wrong order, or asked twice?*
4. **Open Kristine Joy Aquino** → "No signed consent on file yet". Capture
   consent from the profile.
5. **Confirm the clinical boundary.** Open Jose Miguel Reyes' visit
   timeline. You should see visit **dates** but a message in place of the
   notes, and **no Charting or Dental chart link anywhere**. If you can read
   a clinical note, stop and report it — that is a serious finding.

### Dentist

6. **Open a chart.** Maria Clara Santos → Dental chart. Tooth 16 should read
   as filled, not decayed — the later entry wins.
7. **Chart a new finding.** Mark a surface decayed, a tooth crowned, and a
   tooth as planned treatment. Save. *Were the tooth surfaces tappable with
   a fingertip, or did you need a stylus?*
8. **Reopen the chart** after navigating away. Everything should still be
   there. This is Phase 3's exit criteria.
9. **Check a tooth's history.** Tap tooth 16 → both entries, oldest at the
   bottom, each linked to its visit note.
10. **Write a visit note** on today's visit.
11. **Build an invoice from the chart.** New invoice → pick today's visit →
    the procedures you charted appear → add them. *Did the fee match what
    the clinic actually charges?*

### Reception

12. **Take a partial payment** on that invoice. Confirm the status becomes
    `partial` and the balance is right.
13. **Download the receipt.** *Does it print legibly on the clinic's
    printer? Is anything missing that a patient would ask for?*
14. **Open the ledger** for Jose Miguel Reyes. Charges and payments in date
    order with a running balance — compare against the paper ledger.

### The drill that matters most

15. **Wi-Fi drop mid-entry.** Start registering a patient, fill in several
    fields, then turn off the tablet's Wi-Fi and press Save.

    Expected: an amber bar reading *"You're offline…"*, an error on the
    form, and **every field still filled in**. Turn Wi-Fi back on and save
    again — it should go through.

    **If any typed data disappears, that is a data-loss incident and the
    pilot fails.** Record exactly what was lost.

### Admin

16. **Read the audit log** at `/admin/audit`. Filter to today. Every write
    from the steps above should be there, attributed to whoever did it.
17. **Export the CSV** and open it in Excel.
18. **Back up the day**: `./scripts/backup.sh ~/clinic-backups`.

---

## 4. Friction log

One row per observation. Keep the trivial ones — a field in the wrong order
costs a receptionist seconds forty times a day.

| # | Date | Who (role) | Screen | What happened / what was expected | Severity | Status |
|---|---|---|---|---|---|---|
| 1 | | | | | blocker / annoying / cosmetic | open |

**Severity means:**
- **blocker** — data lost, wrong data shown, a role saw something it must
  not, or the task could not be completed at all
- **annoying** — the task was completed, but slower or more confusingly
  than on paper
- **cosmetic** — looks wrong, reads badly, no effect on the work

Any **blocker** stops the go-live decision until it is fixed and retested.

---

## 5. Shadow-run log

One row per day run alongside the existing paper/Excel process. The app and
the paper should agree at close of business; where they disagree, the
disagreement is the finding.

| Date | Patients seen | Entered in app | Discrepancies vs paper | Data-loss incidents | Notes |
|---|---|---|---|---|---|
| | | | | | |

---

## 6. Before go-live

- [ ] Every **blocker** in §4 fixed and retested
- [ ] `docs/COMPLIANCE.md` §1 cleared — backups, signup, legal review
- [ ] Price list reviewed line by line against the clinic's actual fees
- [ ] **Fixture patients purged**: `psql "$SUPABASE_DB_URL" -f scripts/purge-pilot-patients.sql`
- [ ] Confirmed purged: patient search for `PILOT DATA` returns nothing
- [ ] A backup taken *after* the purge, verified per `docs/COMPLIANCE.md` §3
- [ ] Any real consent captured during the pilot re-taken against the
      legally reviewed wording, with `CONSENT_TEXT_VERSION` bumped

---

## 7. Sign-off

Phase 7 is complete when a full clinic day has run through the app with no
data-loss incidents **and** the people below have signed.

| Role | Name | Ran a full day? | Blockers outstanding? | Signature | Date |
|---|---|---|---|---|---|
| Receptionist | | | | | |
| Dentist | | | | | |
| Admin / owner | | | | | |
