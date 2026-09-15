# Process flow — booking to receipt

How a patient moves through the clinic and through the system: who does
each step, what carries forward on its own, and what the database enforces
whether anyone remembers to or not.

Nothing in this chain is re-typed from the step before it. That is the
point of it: a booking becomes a visit, a visit becomes a chart, a chart
becomes an invoice.

```
Book → Arrive → Seat → Chart → Complete → Invoice → Pay → Receipt → Recall ↩
```

---

## 1. The day, step by step

Each step names the role that performs it. **Automatic** marks something
the system does on its own — those are where the chain carries itself, and
the reason nothing needs re-entering.

### 1. Register the patient — *reception*
Demographics, the medical history checklist and the dental history
checklist, in the same order as the clinic's paper intake sheet. History is
a checklist rather than a free-text box, so an allergy can be found later.

→ Patients → Register patient

### 2. Take consent — *reception*
The patient signs on the tablet. Registration flows straight into this so
the two happen as one motion, with a "skip for now" escape hatch.

**Automatic:** consent is a log, not a flag. Every signing is its own row,
stamped with the wording that was on screen at the time, so re-signing at a
later visit never overwrites what was agreed before.

### 3. Book the appointment — *reception*
Patient, dentist, time, procedure. Choosing a procedure fills in the reason
and carries its fee forward to step 8.

**Automatic:** a slot overlapping another appointment for the same dentist
is refused by the database, not by the screen. Cancelled and no-show
bookings release their slot.

→ Schedule → Book appointment

### 4. Check the patient in — *reception*
Marking someone **Arrived** puts them in the queue on the Schedule and the
Dashboard, with a wait time that grows and reddens past 15 and 25 minutes.

**Automatic:** there is no separate waiting list to keep in step. Who is in
the clinic *is* their appointment status, so the queue cannot drift from
the book.

### 5. Seat them in the chair — *reception or dentist*
Marking someone **In chair** is the moment clinical work starts.

**Automatic:** the visit record is opened and tied to the appointment.
Nobody presses "start a visit" — the chart and the invoice both hang off
this.

### 6. Chart and write up — *dentist*
The chart opens with the patient's medical alerts across the top, so an
anaesthesia allergy is read before anything is injected rather than found
afterwards. Mark findings on the tooth map in FDI numbering (11–48
permanent, 51–85 primary), then save. Marks stage first, so a mis-tap
chairside is undone with a tap rather than a database correction.

**Automatic:** re-charting never overwrites. Marking tooth 16 occlusal as
decayed and later as filled leaves both entries in place, each tied to the
visit it happened at.

→ Schedule → Chart, or Patients → Dental chart

### 7. Finish treatment — *reception or dentist*
Marking the appointment **Completed** is what puts it in front of whoever
is billing. A completed booking offers **Create invoice** on the same card.

### 8. Raise the invoice — *dentist or admin; reception for manual lines*
The first line is already filled in from the booked procedure, with its fee
from the price list. Procedures charted at the visit can be pulled in
alongside it. Every amount stays editable — what was booked is not always
what was done.

**Automatic:** a charted procedure can only be billed once, and a visit
that already has an invoice says so rather than quietly raising a second.

> **Reception cannot pull from the chart.** That is not a screen choice —
> the chart is invisible to them at the database level. In practice the
> dentist raises the invoice at the chair and reception takes payment.

### 9. Take payment — *reception*
Cash, card, bank transfer or other, with an optional reference for the
official receipt number. Part payments are normal; the balance carries on
the patient's ledger.

**Automatic:** the invoice total and its paid / part-paid / unpaid state
are computed by the database from the lines and the payments. No screen
writes them, so they cannot drift.

### 10. Print the receipt — *reception*
A PDF with the clinic's name and hours, the procedures and teeth treated,
the total, what has been paid, and the balance outstanding.

### 11. Set the recall — *reception or dentist*
Pick the next due date on the calendar before the patient leaves — the only
moment anyone reliably remembers. Six months out for a hygiene recall, or
whichever day the root canal should be finished. Only days after today can
be picked, and the database refuses anything else. A patient can carry more
than one at a time.

**Automatic:** recalls surface on the Recalls list and the Dashboard once
due. Booking from there returns to step 3 with the patient already chosen,
which is how next month's book gets filled.

→ Patients → Appointments & recalls

---

## 2. How an appointment moves

The day only runs forwards. A booking can be written off before the patient
is seated, and rebooked afterwards — but once treatment has started it can
only be completed.

```
  Booked ─→ Confirmed ─→ Arrived ─→ In chair ─→ Completed
     │          │           │
     └──────────┴───────────┴──→ Cancelled · No show ──┐
                                                        │
     ◄──────────────── rebook ───────────────────────────┘

                    └── Arrived + In chair = the queue ──┘
```

`completed` is terminal. Allowing the day to run backwards would make the
queue meaningless — "arrived" after "completed" would put a treated patient
back in the waiting room. The UI only ever offers legal transitions, so the
buttons and the rules cannot diverge.

Defined in `src/features/scheduling/appointmentStatus.ts`.

---

## 3. Who can do what

Enforced by row-level security, not by the screens. A role that cannot see
something cannot reach it by any route — this app, a future app, or a
direct database connection.

| Can they…                                | Reception | Dentist | Admin |
| ---------------------------------------- | :-------: | :-----: | :---: |
| Register and edit patients               |    yes    |   yes   |  yes  |
| See medical & dental history             |    yes    |   yes   |  yes  |
| Book, queue and complete appointments    |    yes    |   yes   |  yes  |
| Read the dentist's clinical notes        |  **no**   |   yes   |  yes  |
| Open the tooth chart                     |  **no**   |   yes   |  yes  |
| Open a per-tooth X-ray                   |  **no**   |   yes   |  yes  |
| Raise invoices and take payment          |    yes    |   yes   |  yes  |
| Set the procedure price list             |     —     |    —    |  yes  |
| Create and deactivate logins             |     —     |    —    |  yes  |
| Read the audit log                       |     —     |    —    |  yes  |
| Delete anything at all                   |     —     |    —    |  yes  |

Defined in `supabase/migrations/0002_rls.sql` and extended by each later
migration. Verified by impersonation during the restore rehearsal — see
`docs/COMPLIANCE.md` §3.3.

---

## 4. What holds without anyone remembering

Each of these is guaranteed by the database rather than by a screen, so it
also holds for imports, for fixes run by hand, and for anything built
against this data later.

| Guarantee | Where |
| --- | --- |
| A dentist cannot be double-booked; cancelled and no-show bookings free the slot | `0008_scheduling.sql` |
| Invoice totals and paid/part-paid/unpaid state are computed, never typed | `0005_billing.sql` |
| Signed consent and recorded payments are never edited — a correction is a new row, a refund is a negative payment | `0002_rls.sql` |
| The chart is a history: every finding stays, tied to the visit it was recorded at | `0004_charting.sql` |
| Every write is logged with who made it; the log cannot be edited or deleted by anyone | `0006_audit.sql` |
| A deactivated login stops working immediately — both data access and sign-in | `0002_rls.sql`, `manage-staff` |
| Only valid FDI tooth numbers, and only a surface-level finding may name a surface | `0004_charting.sql` |

Views are reported by the app and carry a weaker guarantee than writes —
PostgreSQL has no SELECT trigger. The `operation` column keeps the two
distinguishable.

---

## 5. Where the flow stalls today

Honest gaps, not future ideas. Each blocks part of the chain above.

| Blocks | What |
| --- | --- |
| Steps 1–11 | **No active receptionist login.** Both accounts are switched off, so the front-desk half of every step cannot be performed or tested. Fix at `/admin/staff`. |
| Step 8 | **The price list may be empty or unreviewed.** The invoice builder can only offer procedures that exist, at fees someone has checked. A procedure also needs a charted condition set before it can be pulled from the chart. |
| Step 2 | **The consent wording has not had legal review.** It is a full Data Privacy Act draft with fields still to fill in. Until sign-off, take consent from real patients on paper. |
| Everything | **There are no automated backups.** Manual exports are the only copy, and stored files — signatures and X-rays — are not in them. A restore today would produce consent records pointing at images that no longer exist. |

Full detail in `docs/COMPLIANCE.md`.

---

*Roles: reception · dentist · admin · Tooth numbering: FDI · Currency: PHP*
