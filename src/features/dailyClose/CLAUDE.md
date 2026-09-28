# Daily close — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

## Daily close (0020)

The front desk records the day's expenses and salary; at close of business
**Close Clinic** freezes the day's figures into a report, downloads it as a
PDF, and locks the day.

`src/features/dailyClose/` — `DailyClosePanel` (two sections — Daily
expenses, and Daily salary & commission — then the Close Clinic button),
`DailyEntryList` (rows, with admin edit/delete), `api.ts`,
`reportSections.ts` (per-dentist pay merge, the PDF's pay table, the shared
commission label, money for the PDF), `eodReportPdf.ts`.

### What had to be built, because none of it existed
- **No salary, expense or payroll data anywhere.** `staff` has no pay field.
  `salary_entries` is new, and **a dentist's salary record is their rows
  there** — a log of what was paid per day rather than a rate on the staff
  row, because staffing and pay vary daily.
- **No closed-day concept.** `clinic_days` is new: one row per closed day,
  its existence the lock, its `report` jsonb the frozen figures.
- **Commission had no date.** It is one number on the invoice. The clinic
  chose to count it toward **the day of the visit — the invoice's
  `created_at` in Manila**. So no column was added.

### The dentist dropdown is `bookable_dentists()`
Reception cannot read `staff` (0002 — own row only). The salary form uses
the same function the booking and seating dialogs do (0011): active dentists
and admins who treat, id and name only. A salary row for a dentist later
deactivated still resolves by name in the report, which is built with the
close function's own rights.

### The day is decided by the database
`daily_entries_guard` sets `business_date`, `created_by` and `created_at` on
insert and refuses to change them on update. **A client never sends a
date** — that is what stops an entry being backdated onto a closed day.
"Today" is `clinic_today()`, Asia/Manila.

### Who may do what, and the lock that overrides it
    receptionist   read, add            never edit or delete
    admin          read, add, edit, delete — until the day is closed
    dentist        nothing

RLS gives the roles; **the trigger gives the lock, for every role, admin
included.** That is stricter than anywhere else in the app on purpose:
elsewhere an admin overrides and the audit log records it, but a closed day
is the reconciliation, and a figure an admin could still move would make the
printed report a draft.

**There is no reopen in the app.** A day closed by mistake can only be
reopened by deleting its `clinic_days` row from the SQL editor — which the
audit trigger on `clinic_days` records. Don't add a reopen button without
the clinic asking; it would undo what the lock is for.

`DailyEntryList`'s `canManage` mirrors the rules so the screen does not
offer what the database refuses.

### Commission is locked with its day
The check lives in 0017's `invoices_guard_commission`, which every path to
the column passes through, `set_invoice_commission()` included. **Known
consequence, accepted:** a commission not entered before its day was closed
cannot be entered at all. The invoice screen reads `clinic_days` for the
invoice's day and shows the box as locked, so it does not offer a save the
database will refuse.

### Close Clinic
`close_clinic_day()` — SECURITY DEFINER, reception or admin.

- **The arithmetic is in SQL** (`clinic_day_totals()`), as with the
  dashboard view: revenue is payments on the day (refunds negative),
  commission is the day's non-void invoices.
- **Net = revenue − expenses − salary**, as specified. Commission is shown
  but not subtracted.
- **It locks the three tables in SHARE mode first.** Without that, an expense
  or a commission saved in the same instant could land after the figures
  were read and before the lock row was visible — locked, and missing from
  the report. Writers wait a moment and then meet the lock.
- **It cannot close a day twice**, including two receptionists pressing at
  once (the unique `business_date` is caught and reworded).
- **The report is frozen.** Payments are still taken after close — a late
  patient must be able to pay — and they show in the dashboard's "Collected
  today", but the report and every re-download are rebuilt from the saved
  `report`, never recomputed. The PDF says figures are as at closing.

The dashboard's confirmation shows the live totals and says plainly that
nobody, admin included, can change the day afterwards.

### The PDF
jsPDF, as for receipts, loaded **on demand** — it is the heaviest thing in
the app and needed once a day. `doc.save()`, for the same tablet reasons.
If the close succeeds and only the download fails, the panel says so and
**Download report** stays available; the close is not repeated.

**Amounts are written `P 1,234.00`, not with the peso sign** —
`pdfMoney()`, not `formatMoney()`. jsPDF's built-in Helvetica cannot encode
U+20B1 and draws stray characters in its place. `pdfMoney` lives in
`billing/ledger.ts` beside `formatMoney` and is used by **both** PDFs —
receipts had the bug until they were switched over too. **Any new PDF uses
`pdfMoney`**; `receiptPdf.test.ts` fails if a peso sign reaches `text()`.

### The report is the clinic's EOD sheet (0027)
`eodReportPdf.ts` lays the PDF out as the grid reception keeps by hand —
**four equal columns**, cells wrapping within their column — in this order:

1. **Today's patients** — name, procedure, method, amount; one row per
   payment taken that day (a refund is a negative row)
2. **Expenses**
3. **Salary & commission** — the per-dentist table (0021/0022)
4. **Overall summary**, ending in **TODAY'S COH** in red

`buildReportPatientTable()` and `buildReportSummary()` in
`reportSections.ts` turn the frozen report into the text to draw, so what the
sheet says is tested even though jsPDF's layout is not.

**Cash on hand is the clinic's formula, and it differs from net:**

    COH = revenue − bank & digital − expenses − (salary + commission)
    net = revenue − expenses − salary                      (0020, unchanged)

COH is the cash that should be in the drawer, so it takes out everything
that did not arrive as cash and everything paid out, commission included.
Net stays as 0020 defined it. **Don't "reconcile" the two** — they answer
different questions, and the sheet prints both.

**0027 freezes what these need into the report at closing**, for the same
reason as the per-dentist commission (0022) — every re-download is rebuilt
from what was saved, never recomputed:

- `report.payments` — the day's payments with patient name, the invoice's
  lines joined as `procedure`, `method` and `amount`. The same rows
  `clinic_day_totals()` sums as revenue, so the table adds up to the total.
- `report.non_cash_total` — every method but cash (card, bank transfer,
  other — GCash and the like).

`close_clinic_day()` also takes `payments` and `invoice_items` into its SHARE
locks, so a payment landing in the same instant cannot be in the total and
missing from the list. Everything else in the function is 0022's.

**Days closed before 0027 have neither key, and they are not backfilled.**
Both builders return null and the PDF says the list and COH were not
recorded — unknown must not print as a figure. **0027 is applied to the live
project** (after its code had been deployed for a while, so any day closed
in that window lacks both sections for good). None of it has been exercised
by a real close yet: the first Close Clinic after 0027 is the check, and the
layout has not been looked at on paper.

### Today's summary (0024)
After the per-dentist table, four figures the front desk reads out at close
of business: **Patients serviced, Collected, Dentist salary, Dentist
commission**. Nothing new is computed in the browser — the money is the same
`figures` the sections above use, so it freezes when the day closes.

**Patients serviced is the one new number**, and it is deliberately **not
frozen**: `clinic_day_totals()` counts *distinct patients with a visit
today*, and a closed day's visits are already over. A visit row is written
when a patient is seated, and by the chart when a dentist starts one without
a booking — so it counts people treated, not people booked, and two visits in
one day is one patient.

`ClinicDayReport` therefore **omits** `patients_served`
(`Omit<ClinicDayTotals, …>`): closing does not save it, and a type claiming
otherwise would have the screen reading `undefined`.

0024 **drops and recreates** `clinic_day_totals` rather than replacing it —
a function's return type cannot be changed in place. `close_clinic_day()`
selects it into a record, which adapts.

### Commission per dentist (0021)
Salary and commission are **one section, "Daily salary & commission"**: a
table with a row per dentist — Dentist / Salary / Commission / Total — and a
totals row, and the add-salary form below. **The individual salary entries
are not listed** (clinic's choice): reception sees only the table. An admin
gets an "Edit salary entries" toggle that opens the list to correct or
delete one — only until the day is closed, since after that nobody can. The
toggle is the only way to fix a mistyped salary in the app, so don't remove
it without giving admins another. `buildPayByDentist()` merges the
two sources: a dentist with only salary, or only commission, still gets a
row; unattributed commission is its own row, last; and if the breakdown did
not load, commission and total show "—" rather than 0, with the column's
total still taken from the day's figures. The Total column is salary +
commission per dentist; the report's net is unchanged (revenue − expenses −
salary). **The PDF prints the same table**, as one "Salary & commission"
section: a row per dentist and the column totals — no itemised salary
entries, matching the dashboard. `buildReportPayTable()` turns the frozen report into the text to
draw, so what the report says is tested even though jsPDF's layout is not;
it writes "-" for unknown commission (a day closed before 0022), since
jsPDF's built-in font cannot be relied on for the em dash or the peso sign.

The per-dentist commission comes from `clinic_day_commission_by_dentist()`. Commission is one number on an
invoice and names nobody, so the dentist is found through the visit it
bills:

1. **the appointment for that visit** — its `dentist_id` is reassigned at
   seating, so it names who actually treated the patient;
2. **else the visit's `staff_id`**, for a visit started from the chart with
   no appointment — **only if that person is a dentist or admin.** Seating
   an unassigned booking records `treating ?? staffId` (scheduling
   `api.ts`), which is often the receptionist who seated them;
3. **else nobody** — listed as "No dentist recorded", not dropped, so the
   rows always add up to the total above them.

Same day rule as the total (the invoice's day). SECURITY DEFINER because
reception cannot read `staff`; it returns nothing but to reception or an
admin, and only a name, like `bookable_dentists()`.

Fetched separately from the rest of the panel: a failed breakdown says so
on that line and leaves expenses, salary and Close Clinic working.

**Frozen into the report, and printed (0022).** `close_clinic_day()` saves
the breakdown as `report.commission_by_dentist`, from the same function the
dashboard uses, and the PDF's "Salary & commission" table prints it per
dentist.
It has to be frozen: reception can still reassign a finished appointment's
dentist (0015), which would move a share between names on a report already
printed. 0022 adds `appointments` to the SHARE locks for the same reason the
other tables are there — a reassignment in the same instant must not split
the printed rows from the saved total.

A closed day's panel shows the frozen breakdown, so screen and paper agree.

**Days closed before 0022 have no breakdown frozen, and it is not
backfilled** — those reports are what was closed. `normaliseReport` keeps
the key absent rather than inventing `[]` (which would read as "nobody
earned commission"); the PDF says "not recorded for this day"; the panel
falls back to the live list. `commissionLabel()` words a row the same way in
both places.

### Mutation-checked
Letting an admin edit a closed day, offering reception edit or delete,
sending a date from the client, leaving commission editable on a closed
day, and showing live figures on a closed day each fail a test.

The last one passed at first for the wrong reason: the closed-day fixture
used the same commission for the live totals and the frozen report, and the
expense row repeated the figure the section total should have supplied. It
now gives the live totals a different commission and asserts the frozen one
wins — worth copying for any "shows X rather than Y" test.

### Not verified
**0020, 0021 and 0022 are applied to the live project** and applied
cleanly — which proves the SQL parses and the objects exist, nothing more.
No session has database credentials to execute it beforehand, so a dry run
was the only check before each push.

**None of the behaviour has been exercised against real data:** the
closed-day lock refusing an admin, the SHARE-mode race guard, a second close
being refused, the per-dentist attribution, and the frozen breakdown on the
PDF. The unit tests mock the database. Test them on the live project with
two tablets before relying on them — and close a real day only when it is
really over, because nothing in the app reopens one.

The PDF's layout, including the peso-sign workaround, has not been looked
at on paper either.
