# Dashboard — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

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
  and admin. Not the dentist. **Their own commission is the exception**: a
  dentist's tiles are In the clinic, Completed and **Commission** — what
  they earned today, added up from their own Today's Patient rows. The
  clinic's takings stay off their screen.
- **Still to come** and **No-shows** — reception and admin only. They were
  dropped from the dentist's tiles (clinic's choice): both are questions
  about a diary a dentist can no longer open, and the commission figure took
  their place.
- **Clinical alerts for today's patients** — dentist and admin. Not
  reception, whose job is flow rather than clinical judgement.
- Queue (In the clinic), Completed, and recalls — everyone. Those two tiles
  stay **clinic-wide** for a dentist (the view is not per-dentist); only
  their Commission tile is their own figure. For a dentist the tiles are
  plain figures, not links: the schedule and recalls routes refuse them, so
  a link would bounce them straight back to `/`.
- **Open schedule** button — reception and admin. Hidden from a dentist.
- **Awaiting payment** queue — reception and admin, first on the page, live.
  See "Awaiting payment queue (0019)".
- **End of day** — daily expenses, daily salary & commission (one section)
  and Close Clinic — reception and admin, last on the page. Not the dentist:
  colleagues' pay is not theirs to read. See "Daily close (0020)".

This is a presentation split, not a security boundary: RLS already governs
what each role can fetch. It is still tested, and mutation-tested — making
`seesMoney` always true fails "does not show takings to the dentist".

### A dentist's list is their own day
Reception and admin see "Today's list" — the whole clinic, with status
pills. A dentist sees **"Today's Patient"** instead: `listDentistDay()`
filters today's appointments by `dentist_id`, in **every** status (finished
and cancelled included — it is their record of the day, not a queue), as a
table of Time, Patient Name, Treatment, Amount, Commission.

- **Treatment** is the booked procedure's name, else the booking's reason.
- **Amount** is the visit's invoice total, void excluded, fetched in one
  second query rather than one per row. `—` until an invoice exists.
- **Commission** is `invoices.commission_amount`, read-only here and `0`
  until reception enters it (see "The dentist's view").

The medical alerts panel reads the same list, so a dentist is warned about
**their own** patients only. A dentist covering for a colleague will not
see that colleague's patients flagged here.

The dentist filter is a presentation scope — a dentist can still read every
appointment (0015: they must see the whole diary to tell who is waiting).
Removing the `dentist_id` filter fails a test; that was mutation-checked.

### The alerts panel repeats the chart's warning on purpose
The chart warns the dentist who is already treating someone. The dashboard
warns them while the day can still be rearranged. Cancelled and no-show
patients are excluded — warning about someone who isn't coming is noise
that makes the real warnings easier to skip past.

Numeric columns are coerced with `Number()` everywhere: PostgREST returns
Postgres `numeric` as a string often enough that naive arithmetic would
render `NaN` or concatenate two totals.

## Awaiting payment queue (0019)

A dentist finishing treatment puts the patient on every receptionist's
dashboard at once; tapping the entry opens that visit's invoice, where
payment and commission are taken; **once the bill is settled the entry
leaves the list.** Nothing is routed to one receptionist — every front-desk
dashboard shows the same list.

`src/features/dashboard/` — `paymentQueueState.ts` (the rules),
`PaymentQueue.tsx` (the list), `listPaymentQueue()` in `api.ts`.
`src/core/useRealtimeRefresh.ts` (the subscription).

**The status was already there.** Finish treatment has set
`appointments.status = 'pending_payment'` since 0013, and the app already
labelled it "Awaiting payment". Nothing new was stored.

### The first real-time sync in the app
Before this every screen fetched on load and polled. 0019 adds
`appointments`, `invoices` and `payments` to Supabase's `supabase_realtime`
publication, and the dashboard subscribes to postgres changes on them.

- **An event means "refetch", never "here is the data".** The list is
  always rebuilt from its normal query, so a missed or duplicated event makes
  it late, never wrong — and RLS decides what the refetch returns, as on
  first load. Realtime itself only delivers rows the subscriber's SELECT
  policy admits, so the publication widens nobody's access.
- **Debounced.** One payment is three row changes; they become one refetch.
- **A reconnect refetches.** Events during a Wi-Fi drop are not replayed, so
  the second `SUBSCRIBED` catches up. The first does not — the page just
  loaded.
- **The minute poll stays** as the floor for a channel that fails outright.
- **Only the front desk subscribes.** A dentist's dashboard opens no
  channel.

It observes and refetches; nothing is queued or retried, per the project
constraint. Use `useRealtimeRefresh` for any future live screen rather than
opening channels ad hoc, and add the table to the publication in a
migration.

### What shows (`buildPaymentQueue`)
    awaiting    finished, not paid           until paid, whatever day
    owing       checked out, money still owed  until paid

**The list is who still has to pay, and nothing else.** A bill paid in full,
or a visit with nothing billed that has been checked out, leaves the list at
once. It used to stay greyed as "Paid" / "No charge" for the rest of the
day; the clinic asked for it removed instead — a to-do, not a record of the
day. The day's record is the ledger, the dashboard's "Collected today", and
the end-of-day report.

**An unpaid bill carries forward.** "Only today" would have dropped a patient
who left without paying off the list overnight while the money was still
owed; the clinic chose to keep it until paid. A carried entry shows its day.

**Settled is decided by the bill, not the appointment.** Settling also checks
the patient out, but if that second write failed the money is still in, and
the entry must not go on asking for it. A bill totalling nothing is treated
as nothing billed — it cannot be paid, only checked out.

The query asks for every `pending_payment` plus `completed` since local
midnight. The completed ones are needed only for **owing** — checked out on
the schedule with money still owed; anything completed and settled is
dropped by the rules.

### Settling a bill checks the patient out
When a payment brings the balance to zero, `InvoiceDetailPage` calls
`completeAwaitingForVisit()`, so reception does not also have to press
Complete on the schedule. It is **client-side, not a trigger**, on purpose:
0002 lets a dentist insert a payment too, and 0015's guard refuses a dentist
the `pending_payment → completed` move — a trigger firing as the dentist
would have failed the payment itself. Only reception or admin makes the
call. If it fails, the screen says the payment went through and the checkout
did not.

The amount box is **pre-filled with the balance**, and left empty — not
zero — on a settled bill.

### Nothing billed: Check out
A dentist can finish a visit with no bill (`FinishTreatmentButton` moves it
to `pending_payment` regardless). There is no invoice to open, so the entry
offers **Check out**, confirmed first, which completes the appointment and
takes it off the list. `checkOutWithoutCharge` only moves a row still
`pending_payment`, so two receptionists tapping it change nothing twice.

### Commission is not a condition of Paid
Commission defaults to 0, so "entered as 0" and "never entered" look the
same; requiring it would have needed a new column. Paid means the bill is
settled; commission is entered on the same screen, before or after.

### Deploy order: either
0019 is additive. Without it the subscription receives nothing and the list
still updates on the minute poll; with it, within about a second.

### Don't name two files apart only by case
The rules module was first `paymentQueue.ts` beside the component
`PaymentQueue.tsx`. macOS's filesystem is case-insensitive, so
`import PaymentQueue from './PaymentQueue'` resolved to the rules module:
`tsc` failed and every dashboard test broke with nothing rendered. It is
`paymentQueueState.ts` now. On Linux CI the two names are distinct and the
import would have worked — so the break shows only on a Mac, which is the
worst place for a bug to be invisible from.

Mutation-checked: deciding settled by the appointment, keeping a settled
entry on the list, checking out before the balance is zero, dropping the
reconnect refetch, and subscribing for a dentist each fail a test.
