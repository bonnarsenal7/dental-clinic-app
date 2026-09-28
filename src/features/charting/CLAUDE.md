# Charting — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules and points here.

## Phase 3 — Dental Charting (Odontogram) (done)

### Where it lives
`src/features/charting/` — `chartVocabulary.ts` (FDI layout, surfaces,
condition palette), `chartState.ts` (the fold), `types.ts`, `api.ts`,
`ToothGlyph.tsx`, `Odontogram.tsx`, `ChartLegend.tsx`,
`ToothDetailPanel.tsx`, `PatientChartPage.tsx`, `ChartingPage.tsx`.

Routes: `/patients/:id/chart` (the chart) is wrapped in
`ProtectedRoute allow={['dentist','admin']}` to match the RLS boundary on
`tooth_records` — a receptionist never sees the profile button or the route.
`/charting` (the every-patient picker) is **admin-only**: a dentist opens a
chart from their own patient's record instead (see "The dentist's view").

### The chart is an append-only log, not a current-state table
`tooth_records` is never updated in place: re-charting a tooth writes a new
row that supersedes the earlier one, so the history per tooth stays intact.
`deriveChart()` folds the log in order into the state shown on screen.

**`0004_charting.sql` adds a `seq bigserial` column, and the fold reads
that — not `created_at`.** `created_at` defaults to `now()`, which is
*transaction* time, so every row written in one save shares a timestamp;
ordering by it would make "decayed, then sound" and "sound, then decayed"
indistinguishable after a reload. `seq` is a total order over the log.

How each condition folds (`kind` in `TOOTH_CONDITIONS`):
- `sound` (`reset`) — clears every finding on the tooth
- `decayed`, `filled` (`surface`) — apply to one named surface
- `missing`, `crown` (`whole`) — apply to the tooth and clear its surfaces
  (a missing tooth has no surfaces; a crown covers all of them)
- `planned` (`plan`) — an **overlay**, drawn as a dashed ring around the
  tooth. It does not erase existing findings, because planned work sits on
  top of what is already charted. Clearing a plan means marking the tooth
  `sound`, which clears the rest too.

The vocabulary is constrained in the database as well as in TypeScript
(`tooth_records_condition_check` / `_surface_check` / `_surface_scope_check`,
plus `_fdi_number_check` for valid FDI numbers). Extending the palette
therefore needs a migration alongside the `chartVocabulary.ts` edit — that
coupling is deliberate: these values are what the chart means.

### Surfaces
Stored under five canonical names — `mesial`, `distal`, `buccal`,
`lingual`, `occlusal` — and displayed with the term that fits the tooth
(`surfaceLabel()`): incisal on anteriors, labial on anterior faces, palatal
on the upper arch. Which edge of a tooth's square is which surface flips by
quadrant and arch (`surfacesForTooth()`), because the chart is drawn as if
facing the patient: their right is on the viewer's left.

### The chart is reached by accessible name, not by `<title>`
Every pickable zone and every tooth carries `role="button"` and an
`aria-label` — the same wording as its tooltip. An SVG `<title>` nested in
a `<g>` is announced inconsistently by screen readers **and** is invisible
to testing-library's `ByTitle`, which only matches `svg > title` as a
direct child. That is why the chart had no coverage of what a tap actually
hits until roles were added.

There is deliberately **no `tabIndex`**. Making 260 zones tab-stops would be
worse than none; keyboard charting needs arrow-key navigation, which is not
built. That remains an open gap.

The click handler sits on the zone's `<g>`, not on the `<path>` inside it,
so the shape and the tooltip naming it are one target.

### Medical alerts on the chart
`src/features/patients/MedicalAlerts.tsx` renders above the odontogram, so
nobody starts marking teeth without having passed the allergy they are
about to inject around. The chart screen previously showed no medical
information at all — the profile warned about an anaesthesia allergy, the
screen the dentist actually works on chairside did not.

`CONDITION_ALERTS` in `historyOptions.ts` decides what is worth surfacing
and how urgently. Not every ticked intake box changes what a dentist does,
so most don't appear; the ones that do carry a `why` ("angina — cardiac
risk, limit epinephrine"), because a condition name alone doesn't tell a
hurried clinician what to do differently.

**Both empty cases say something.** A clear history renders "no medical
alerts — history reviewed", and a missing one renders a warning. A blank
space would be ambiguous between "nothing to worry about" and "it never
loaded", and a clinician shouldn't have to guess which.

If you add this to another clinical screen, add a test that it's *on* that
screen. Deleting the banner from the chart page passed all 56 tests in the
suite — the component was covered, its wiring wasn't.

### Chairside interaction
- The legend **is** the tool picker; `Inspect` is the default, so tapping a
  tooth opens its history without marking anything.
- The selected condition sets the click target: whole-tooth conditions take
  the whole 44px square, surface conditions make the five zones live.
  The detail panel also offers full-width surface buttons, since a 13px
  zone is a poor fingertip target on a tablet.
- **Marks are staged, not written on tap.** They accumulate with an amber
  dot on the tooth and a sticky bar showing the count, and only reach the
  database on `Save to chart`, so a mis-tap chairside is undone with a tap.
  A `beforeunload` guard warns if the tab is closed with marks unsaved.

### Linking chart entries to visits
Every saved mark carries a `visit_id`. The chart page has a "Recording
against visit" selector that defaults to today's visit if one exists, with
`+ Start a visit for today` when it doesn't; saving is blocked until one is
chosen. The tooth detail panel shows each entry's visit date and the
dentist's note for that visit inline, which is the link back.

### Per-tooth images
A saved `tooth_record` can carry one image (`image_path`/`image_name`),
uploaded from the tooth detail panel. Records only ever *gain* an image
they don't have — replacing one would orphan the old object, which only an
admin could clear up.

Images go in the same private `patient-files` bucket as Phase 2, under
`tooth/<patient_id>/<tooth_number>/…`. **`0004_charting.sql` replaces
0003's bucket-wide front-desk storage policies** so they exclude the
`tooth/` prefix, and adds dentist/admin-only policies for it — otherwise
the dentist/admin-only boundary on `tooth_records` would leak through
Storage, since `storage.objects` policies are permissive (OR'd) and a broad
one can't be narrowed by adding another.

### Applying this migration
Already applied — `supabase db push` was run from the session that wrote
it, and remote history lists 0004.

The new CHECK constraints validate existing rows, so if this ever gets
replayed against a database with `tooth_records` data using conditions
outside the vocabulary, that data has to be cleared first. It applied
clean here, so there was none.
