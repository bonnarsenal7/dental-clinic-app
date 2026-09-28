# Billing — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

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

### Finishing treatment lives on the patient's record
`FinishTreatmentButton` (`src/features/scheduling/`) renders **directly
beside Add to bill** in the Current visit panel, whenever that visit's
appointment is `in_chair` and the role may finish it. `ChairsideBilling`
takes it as a `finishAction` slot, so billing does not import scheduling.
Beside a routine action it is one tap from a mis-tap, so it is styled
`secondary` against Add to bill's primary and confirms before anything
locks. It sits inside the line-entry form and is `type="button"`, so it
never submits a line. It exists because dentists no longer see the
schedule, which was the only place the action lived — and 0015 lets a
dentist make **exactly one move**, `in_chair → pending_payment`. Without it
a dentist could bill a visit and never lock it, and reception could never
take the money. It confirms first, because it locks the bill and the note.

**An unbilled visit goes to `pending_payment`, not `completed`.**
`finishTreatment()` sends a visit with no draft straight to `completed`,
which 0015 refuses a dentist. The button takes the one move they have, and
reception checks the patient out from the counter. The schedule's own
handler still calls `finishTreatment()` and so still has that bug; only an
admin reaches it now, and an admin is allowed the move.

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
six-month hygiene recall *and* the second half of a root canal. Set from the
patient profile at the end of an appointment, which is the only moment
anyone reliably remembers to.

**A recall is a date, picked on a calendar (0018).** The profile used to
ask "in how many months" and store both the computed `due_on` and
`interval_months`. Nothing ever read the interval back, so it was a second
copy of a decision that could only drift from the date; 0018 dropped the
column at the clinic's request. Lost knowingly: whether an old recall was a
repeating check-up or a one-off. No due date changed.

**Only a day after today.** Three layers, each with a job:
- the native `<input type="date" min={tomorrow}>` greys out today and the
  past in the OS calendar — the better touch target on a tablet;
- the form rule refuses a date typed past the calendar;
- `recalls_future_due_on` refuses it in the database, for anything that is
  not the form. Today is Asia/Manila's today.

**A trigger, not a CHECK.** A check would be re-evaluated on every update,
and overdue recalls are exactly the ones reception is working through —
marking one `scheduled` or `completed` must not fail because its date has
passed. The trigger only fires on an insert or a changed `due_on`.

`scripts/seed-pilot-patients.sql` inserts overdue recalls on purpose, so it
disables that trigger for its one insert, inside its transaction.

**Deploy order: code before migration.** The previous build writes
`interval_months` when a recall is saved; dropping the column under it
breaks recall saving until the new code is live. The new code never writes
it, so it works against the table either side of 0018.

### Dates are local, never UTC
Day bounds and booking times are built from local date/time fields. Using
`toISOString().slice(0,10)` would push the clinic's evening appointments
onto the following day.
