# Dentist calendar — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

## Dentist calendar (0025)

Who is in the clinic, and for which part of which day. An admin taps a date
on a month calendar and assigns dentists to hours; everyone reads the current
week from the top of their dashboard.

**"Calendar" is who is *in*; "Schedule" is who is *booked*.** Two nav items,
two different questions, and they are easy to conflate — the Calendar never
touches `appointments`, and the Schedule never reads `dentist_shifts`.

`src/features/calendar/` — `types.ts`, `api.ts`, `calendarWeek.ts` (the pure
date and time helpers), `CalendarPage.tsx` (the admin month, `/admin/calendar`,
admin-only in `App.tsx` and in the nav) and `WeekCalendar.tsx` (the read-only
week on the dashboard).

**The database still says roster**: `dentist_shifts`, `roster_for_range()`,
and `api.ts`'s `listRoster`/`rosterMessage`, which are named for the SQL they
wrap. The rename was the clinic's word for the screen, and renaming shipped
database objects to follow it would have cost a migration for nothing. If you
add to the data layer, match the SQL; if you add to a screen, say calendar.

### The day opens over the calendar, not under it
Tapping a date opens a `Dialog` (`size="lg"`, added for this — a dialog
somebody *works* in rather than answers). It was a panel below the calendar
first, which on a tablet put the form off-screen after a tap near the bottom
of the month: you tapped a day and nothing appeared to happen.

**It stays open after each add.** A day usually needs more than one dentist,
and closing after each would make assigning three of them three trips through
the calendar. The dentist field clears and the hours stay, because the second
dentist usually covers the same session. Removing a shift opens a
confirmation *over* the day dialog — two stacked Radix modals, which is why
the test addresses each by its accessible name rather than `getByRole('dialog')`.

### The week is first on the dashboard, for every role
The clinic asked for it there. It therefore sits **above the medical alerts
and above the front desk's payment queue**, both of which are act-now items —
a deliberate trade, not an oversight: knowing who is in this week is what
they want to open onto. Tests pin it above both, so moving either back is a
decision rather than an accident. **If the pilot finds alerts being missed,
this is the first thing to move back down.**

### It records cover; it does not govern booking
**Nothing in scheduling consults `dentist_shifts`**, at the clinic's choice.
An appointment can still be booked with any dentist at any time. A walk-in, a
last-minute swap and a dentist covering a colleague all have to stay possible,
and a calendar that refused them would be worked around inside a week. If that
changes, it starts as a *warning* on the booking form, in its own migration —
not as a refusal. The remove-shift dialog says this out loud, because
"remove from the calendar" otherwise reads like "cancel their appointments".

### A shift is wall-clock time on a calendar date
`shift_date date`, `starts_at time`, `ends_at time` — no timestamptz anywhere,
because a rota is read off a wall. That also makes the overlap constraint
simple: `during` is a **generated** `tsrange` over `shift_date + starts_at`,
which is legal here precisely where `appointments.ends_at` needed a trigger —
`date + time` is IMMUTABLE, while `timestamptz + interval` is only STABLE.

`dentist_shifts_no_overlap` is **per dentist**, not per clinic: two dentists
covering the same hours is what a clinic with two chairs looks like. The same
dentist twice over the same minutes is the mistake worth refusing, and
`api.ts` turns the constraint name into words an admin can act on.

### Reads are open, writes are the admin's
RLS: select for any active staff, insert/update/delete for `admin` only. The
guard trigger sets `created_by`/`created_at` and refuses a shift for anyone
who is not an active dentist or admin — the same shape as 0020's
`daily_entries_guard`. 0006's audit trigger covers the table.

Reception and dentists can read the shifts but **not `staff`** (0002 — own row
only), so names come from `roster_for_range(p_from, p_to)`, SECURITY DEFINER,
returning the name and nothing else. Same reason and same shape as
`bookable_dentists()` (0011) — but it joins `staff` rather than calling it, so
a dentist since deactivated still resolves by name on last month's calendar.

### The dentist's week is a screen scope, like everything else theirs
`WeekCalendar` takes an optional `dentistId` and filters; the database would
happily return the whole clinic's week. Their own week shows **hours without
names** — it is theirs, so repeating the name in every cell is noise. That is
why the test for the scope asserts on a colleague's *hours* being absent: with
the name suppressed, asserting on the name passes even with the filter gone.
Mutation-checked, and it caught exactly that.

It fetches on its own rather than through the dashboard's refresh, so a
calendar that fails to load costs that panel and not the day's figures —
the same reasoning as visits and invoices being fetched separately.

### Not verified
**0025 is applied to the live project** and applied cleanly — which proves the
SQL parses and the objects exist, nothing more. None of the behaviour has been
exercised against real data: the exclusion constraint refusing a double
booking of one dentist, the guard refusing a non-dentist, RLS refusing a
receptionist's write, and `roster_for_range` returning names to somebody who
cannot read `staff`. The unit tests mock the database. Check it on the live
project with an admin and a receptionist signed in.
