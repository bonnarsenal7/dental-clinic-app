# Scheduling — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

## Scheduling — appointments, queue, recalls (added after Phase 7)

The largest functional gap in the roadmap, and the thing the v2 backlog's
"appointment reminders" actually depends on: until `0008_scheduling.sql`,
`visits` recorded what had already happened and nothing recorded what was
going to.

`src/features/scheduling/` — `types.ts`, `appointmentStatus.ts` (the state
machine), `api.ts`, `SchedulePage` (day sheet + live queue),
`BookAppointmentForm`, `RecallsPage`, `PatientScheduling` (profile panel),
`AppointmentCard`. Routes: `/schedule`, `/recalls`.

### The queue is derived, never stored
"Who is in the clinic right now" is today's appointments with status
`arrived` or `in_chair`. **Don't add a queue table** — where a patient is
*is* their status, and a second copy would drift from it within a day.
`isInQueue` / `isPending` in `appointmentStatus.ts` are the whole
definition, and a test asserts every status lands in at most one section of
the day sheet so nothing can vanish from the screen.

### The day only runs forwards
`TRANSITIONS` allows `booked → confirmed → arrived → in_chair → completed`,
plus writing a booking off as cancelled/no-show **before** it is seated, and
rebooking from either. `completed` is terminal. Letting a day run backwards
would make the queue meaningless — "arrived" after "completed" puts a
treated patient back in the waiting room. The UI only ever offers
`nextStatuses()`, so the buttons and the rules can't diverge.

### Seating asks who is actually treating the patient
Moving someone to `in_chair` opens a dialog naming the treating dentist,
defaulting to whoever the booking says. Whoever was pencilled in days ago is
often not who is free when the patient finally sits down, and the visit is
attributed to whoever is named here — so it asks rather than assuming. An
unassigned booking says so, which is the case where asking earns its keep.

Changing it also moves `appointments.dentist_id`, so the schedule shows
reality rather than the original guess. That reassignment goes through the
same exclusion constraint as a new booking, so it can be refused if that
dentist is already with someone — translated into words and shown inside
the dialog.

### Reception reads dentists through a function, not the staff table
`staff` lets a non-admin read **only their own row** (0002_rls.sql), so a
direct select returned nothing for a receptionist: the Dentist dropdown
offered only "unassigned", the role that does most of the booking could not
attach a booking to anyone, and the double-booking constraint never engaged
because it excludes null-dentist rows.

`bookable_dentists()` (0011) is `SECURITY DEFINER` and returns **id and name
only**. A policy would have been the obvious fix and is the wrong one: RLS is
row-level, so letting reception read those rows also hands them colleagues'
email addresses. The function does its own authorization —
`current_staff_role()` is null for anyone not active staff, so an anonymous
caller gets an empty set.

**This was invisible to the unit tests**, which all mock `listDentists`. It
only appeared when the booking flow was exercised as a signed-in
receptionist against the live database. Worth remembering before trusting a
green suite on anything RLS-shaped.

### Seating a patient creates the visit
Moving to `in_chair` inserts the `visits` row and stores `visit_id` on the
appointment, so the dentist charts against the booking instead of pressing
"Start a visit for today" by hand. Same no-re-entry thread that already runs
chart → invoice.

### A finished appointment frees the chair (0014)
The exclusion constraint excludes `cancelled`, `no_show`, **`completed` and
`pending_payment`**. The last two were added after a bug report: seating a
patient and choosing a dentist failed with "That dentist is already with
another patient at this time" when the dentist was plainly free.

Excluding only cancelled and no-show meant every completed appointment
reserved its slot for ever. Because a clinic's slots repeat, the day filled
with phantom conflicts as it went on — four dentists each had a finished
09:00, so every option in the dropdown was refused.

What the constraint is for is stopping a dentist being committed to two
patients at once, and commitment ends when treatment does. `pending_payment`
frees the chair for the same reason `completed` does: the dentist has
finished and the patient is at the counter. Holding the slot until the bill
is settled would make the front desk's speed a constraint on the dentist's
diary.

**The reproduction is worth keeping in mind**: a loop trying every
(appointment, dentist) pair inside a transaction that rolls back. The
signature of the bug was that one appointment failed against *every*
dentist, including ones with nothing booked — which is what said the
conflict was not real.

### Double-booking is refused by the database
A GiST exclusion constraint over `(dentist_id, tstzrange(scheduled_at,
ends_at))` — not a UI check, since the UI is not the only thing that will
ever write here. Cancelled and no-show rows are excluded from it, so they
free the slot. `ends_at` is maintained by a trigger rather than being a
generated column because `timestamptz + interval` is only STABLE (it depends
on the session time zone) and generated columns require immutability.
`api.ts` translates the constraint name into something a receptionist can
act on.

### Forms set `noValidate` and let react-hook-form validate
Every form with validation rules carries `noValidate`, and renders the
message itself — via `<FieldError>` from `core/components/states.tsx`, or
inline next to the field.

**Check for this by searching `required:`, not `required: true`.** Half the
forms pass a message string (`required: 'Name is required'`), and a
narrower grep missed two of them — the staff form's `type="email"` and the
intake form's `type="number"`, both of which would have had the browser
validating instead.

Without it the browser validates first, which means: messages differ per
browser and can't be styled, native bubbles sit awkwardly on a tablet, and
**the form's own guards become unreachable** — native validation stops the
submit handler ever running, so code like "Enter a payment amount" never
fires. Both layers now have a job: the field rule catches empty, the
handler catches what a `required` rule can't (a zero payment, a
non-numeric amount).

It also makes the forms testable. happy-dom computes `500 % 0.01 !== 0` in
floating point and reports `stepMismatch` on any `step="0.01"` money field,
so a native-validating form silently never submits under test — the
symptom is a test that times out with nothing rendered. Real browsers
compare with decimal scaling per spec and accept it, so this was a test-only
failure hiding behind a production-shaped smell.

### The patient chooser is a visible result list, not a dropdown
Search results render as clickable rows. This replaced a native `<select>`,
and the two sections below are kept because they record how it got here —
`size` listbox, then plain dropdown, then this.

The root problem a dropdown could not solve: **a closed `<select>` hides its
own contents**, so narrowing the search changed nothing anybody could see.
Every fix for that was a workaround for the control being wrong — a match
count beside the field, auto-selecting a single result. Both are gone; the
results are simply on screen.

**The chosen patient is held as the whole `Patient`, not an id.** That is
what removes the old bug class rather than patching it: the form cannot book
somebody who is not on screen, because what it books *is* what is on screen.
The earlier version kept an id in react-hook-form, and a `<select>` whose
chosen `<option>` had been filtered away silently fell back to its
placeholder while the id stayed — booking a patient nobody could see.

Once chosen, the chooser gives way to a "Booking for" banner with a Change
button, and the search stops running. Reception books with the patient's
name in their ear; losing it behind a collapsed control while the rest of
the form is filled in is how the wrong person gets booked.

Rows are real `<button>` elements, so the `pointer: coarse` rule gives them
a 44px target without any extra class. Both of a patient's numbers show
beside the name — the search matches either, and seeing which one you
recognised is how you tell two people with the same name apart.

**A test here must outlast the 250ms debounce.** An assertion made straight
after a click passes even if the selection is cleared a moment later; a
mutation that did exactly that survived the whole suite until a test waited
the debounce out.

### Don't use a `size` listbox for a chooser
The patient picker was `<select size={4}>`. On a tablet — which is where
this app is used — a multi-row select renders as an inline list instead of
opening the native picker: fiddly to tap and easy to read as inert, which
is exactly how it was reported ("not clickable"). Plain single-select with
a placeholder option.

Its `<label htmlFor>` also pointed at the search box above it, leaving the
control a user actually picks with unlabelled — invisible to a screen
reader, and the reason `getByLabelText('Patient')` returned the wrong
element. Label the control, not its neighbour.

### A search box that filters a `<select>` owes three things
Reported as "search in the schedule is not working or wired in the patient
drop down". The wiring was fine — the debounce fired, the options narrowed.
Three separate things around it were not:

1. **Clear the form value when the chosen option disappears.** A `<select>`
   whose selected `<option>` is removed silently falls back to displaying
   the placeholder, but react-hook-form still holds the old id. The form
   showed "— choose a patient —" and booked a patient who was nowhere on
   screen. Reconcile the value against the new results on every search.
2. **Enter must not submit.** A search box inside a `<form>` gets the
   browser's implicit submission, so typing a name and pressing Enter fired
   the booking and answered "Choose a patient first." `preventDefault` on
   Enter.
3. **Say how many matched.** A closed `<select>` hides its options, so
   narrowing the list changes nothing a user can see — which is what "not
   wired" meant. A live count next to the field is the feedback; a single
   match is selected outright. Put the count *outside* the `Field`, since
   `Field`'s label wraps the control and anything inside it joins the
   select's accessible name.

Also: don't render "No patients match that search." before the first search
has resolved — an empty list at mount is "not loaded yet", not "no results",
and the form opened by declaring itself broken.

## The diary belongs to reception (0015)

    receptionist  books, reschedules, cancels, seats, accepts payment
    dentist       reads everything; the only write is finishing treatment
    admin         everything, and 0006's triggers record it

**The dentist keeps one update, and that is deliberate.** 0013 made
finishing treatment theirs — it locks the invoice and hands the patient to
the front desk — and that write lands on `appointments.status`. Taking
UPDATE away entirely would have broken it. "Cannot edit a booking" is about
who, when and with whom; advancing the day's status is not editing a
booking. So the policy still permits the row and the trigger permits exactly
one move, carrying no other changed field.

**Seating is reception's** because the seating dialog asks who is treating
the patient and writes `dentist_id` — booking management however it is
spelled.

**Recalls are untouched.** "Come back in six months" is a clinical
judgement and stays open to the dentist. Turning one into a booking is
reception's, and goes through `appointments` like any other booking — which
is why the Book link on the recalls list is hidden from a dentist while the
recall itself, and dismissing it, are not.

The trigger widened from `before update of status` to `before update`. A
dentist changing only the time never touched the status column, so the
narrower trigger did not fire at all and the change went straight through.

`canManageBookings()` and `canRoleTransition()` mirror this so the UI does
not offer a control the database will refuse. **If one changes, change
both.**
