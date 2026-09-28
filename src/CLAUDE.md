# Design system — working notes

Moved out of the root CLAUDE.md so it loads only when working under `src/`.
`src/index.css` is the design system; these are the rules and the measured
contrast figures behind it.

## Brand palette & logo (added post-Phase 7)

The clinic supplied their real logo — a gold gradient tooth mark and
"ToothCo Dental Clinic" wordmark on a marble background — and asked for the
app's theme to be based on it. Two things came out of that: a gold color
scale, and the logo itself in two header spots.

### The gold scale was sampled from the logo, not eyeballed
`gold-50` through `gold-900` in `src/index.css`'s `@theme` block were picked
by sampling actual pixels from the logo with PIL (filtering by HSV
saturation/hue to isolate the gold gradient from the white/marble
background), then adjusting for contrast rather than trusting the raw
sample. The logo's midtone gold is roughly `#D9A441`, which is only about
3.1:1 against white — fine for a large logo mark, not fine for button text
or focus rings. `gold-700` (`#8A6524`, ~5.3:1) and `gold-800` (`#6E4F1C`,
~7.5:1) are the darkened, WCAG-checked shades actually used for interactive
surfaces; the lighter steps exist for backgrounds/borders/highlights where
contrast against white isn't the constraint.

### gold-* is the brand/primary-action color, not a status color
Before this change, `bg-slate-800` / `hover:bg-slate-700` /
`border-slate-800` / `focus:ring-slate-400` were the de facto "primary
action / active nav state" convention across the app (checked
`ChartLegend.tsx`, `AppShell.tsx`, and `AuditLogPage.tsx` specifically to
confirm slate-800 never doubled as a semantic/status color anywhere). That
made it a mechanical, safe find-and-replace across all 28 files that used
it:
- `bg-slate-800` → `bg-gold-700`
- `hover:bg-slate-700` → `hover:bg-gold-800`
- `border-slate-800` → `border-gold-700`
- `focus:ring-slate-400` → `focus:ring-gold-500`

**Keep using `gold-*` only for brand/primary-action UI** (nav active state,
primary buttons, focus rings) — never repurpose it for success/warning/error
states. Those already have their own red/amber/green treatment elsewhere
(chart alerts, form errors, audit log) and should stay off the brand scale
so the two meanings never collide.

### The logo file
`src/assets/toothco-logo.png` is a processed copy of the clinic's upload:
background removed (thresholded on HSV saturation so the white/marble
background goes transparent while the gold gradient survives), then
cropped to the mark's bounding box. The original, unprocessed upload isn't
committed — regenerate from a fresh export if the clinic sends a new logo,
rather than editing this file directly.

It's used in two places:
- `LoginPage.tsx` — shown large and centered above the sign-in form. The
  `<h1>{CLINIC_NAME}</h1>` that used to be the visible heading is now
  `sr-only`: the logo image carries `alt={CLINIC_NAME}` for meaning, and the
  hidden heading exists only so `LoginPage.test.tsx`'s
  `getByRole('heading').toHaveTextContent(CLINIC_NAME)` still has something
  to find. Don't delete the hidden heading without updating that test.
- `AppShell.tsx` — shown small in the header, and it is the **only** thing
  naming the clinic there. The name is not repeated beside it, because the
  logo is a wordmark that already reads "ToothCo Dental Clinic" and printing
  the same words next to it is duplication.

  **That makes the alt text load-bearing**: the image carries
  `alt={clinicName || CLINIC_NAME}`, not `alt=""`. The two are coupled — the
  moment the text beside it goes, the image stops being decorative. Removing
  the text *and* leaving `alt=""` left the header naming the clinic to
  nobody on a screen reader, and nothing in the suite noticed until a test
  was added for it. It is also what keeps a rename in `clinic_settings`
  meaningful in the header at all.

The logo is a static asset for the "ToothCo" brand mark specifically, while
the text next to it in `AppShell` stays driven by `clinic_settings.clinic_name`
so an admin can still rename the clinic without a redeploy — only the
image is fixed to this brand.

## Design tokens

**`src/index.css` is the design system.** Tailwind v4 declares its theme in
CSS rather than a JS config, so the `@theme static` block there is the
single source for colour and radius. `src/core/theme/` stays empty on
purpose — a second place to look is a second place to drift.

`static` matters: by default Tailwind emits only theme variables it sees a
utility using, which left the chart and state tokens out of the bundle
entirely and emitted an arbitrary three of the eight golds. A token nobody
consumes yet still has to be inspectable in devtools.

### The neutral scale overrides `slate-*`
Not a new name — an override, so all 638 existing `slate-*` usages re-skin
with no component edits. The hue moves warm; **the lightness does not**.
Each step was solved to match the luminance of the Tailwind slate it
replaces, so every contrast ratio the app already relied on survives: body
text on a card stays 14.6:1, muted text 4.76:1. If you change a step, hold
its luminance or you will silently regress contrast somewhere you are not
looking.

### The rule the palette rests on
**Colour is scoped by where it may appear, not only by what it means.**

- **Gold is the clinic** — navigation, primary actions, links, focus,
  selected rows. The furniture.
- **The five chart colours never leave the chart** — inside a tooth, its
  legend, its badges, and nowhere else.
- **Record state is red, green or neutral** — never amber, because amber
  now belongs to both the chart and the brand.

A dental chart already uses saturated colour to mean something precise. If
the primary button is also a strong colour, the chart stops being scannable
at a glance — the eye has to decide what is a finding and what is
furniture. That is why the brand sits low in chroma.

| Colour            | Belongs on                                              | Never on                      |
| ----------------- | ------------------------------------------------------- | ----------------------------- |
| `gold-900/800`    | Nav, headers, and any gold on the charting screen        | —                             |
| `gold-700/600`    | Primary buttons, links, hover — away from the chart      | Beside a tooth glyph          |
| `gold-500`        | Focus rings, small accents                               | Text on white                 |
| `gold-100`        | Selected rows, subtle tints                              | Page background               |
| The five chart colours | Inside a tooth, the legend, tooth badges            | Buttons, tiles, chrome, pills |
| `state-attention` | Offline, unpaid, overdue, long waits, destructive confirm | Decoration                   |
| `state-settled`   | Paid, settled, "no medical alerts"                       | Decoration                    |
| Neutral           | Everything else, including part-paid                     | —                             |

### The gold scale, with the numbers behind it
Contrast against white text, or against ink where the tone is too light to
carry white. These were measured, not picked by eye.

| Token      | Hex       | Use                                        | Contrast     |
| ---------- | --------- | ------------------------------------------ | ------------ |
| `gold-900` | `#4A3611` | Nav bar; **any gold near the chart**       | 11.5:1 white |
| `gold-800` | `#6B4E18` | Headers, pressed states                    | 7.7:1 white  |
| `gold-700` | `#8A661F` | Primary buttons                            | 5.3:1 white  |
| `gold-600` | `#A57C26` | Hover                                      | 4.6:1 ink    |
| `gold-500` | `#C29A3D` | Focus ring, accents                        | 6.6:1 ink    |
| `gold-300` | `#E3C87E` | Borders on gold surfaces                   | 10.6:1 ink   |
| `gold-100` | `#F6ECD2` | Selected rows, tints                       | 14.8:1 ink   |
| `gold-50`  | `#FBF6E9` | Lightest tint                              | —            |

**Keep the page background near-white.** A gold brand tempts a cream
ground; tinting it makes gold stop reading as gold and washes the app out
under clinic lighting. Gold should be the only warm thing carrying weight.

### A swatch can never sit on a dark saturated ground
Sharper than the guard below, and the reason the chart legend's selected
state is a light tint rather than a solid gold button. On `gold-700` the
five chart colours measure **1.02:1 to 2.05:1** — they disappear. On
`gold-100` they run 2.18:1 to 4.39:1, and the gold border still carries
"selected" at 4.46:1. Asserted in `theme.test.ts`.

### The gold guard
Gold is the clinic's colour, applied from Phase C. It is deliberately low in
chroma so it never competes with a tooth, and one rule is load-bearing:

**`gold-700` and lighter must never sit beside a tooth glyph.** Against the
chart's crown amber it measures **1.65:1** — the same colour at a glance.
`gold-900` measures **3.61:1**. So on the charting screen gold drops to 900;
everywhere else 700 is the primary. `src/core/theme.test.ts` asserts both
numbers, so editing either value fails the build rather than quietly
breaking the chart.

### Chart colours exist twice, for now
`--color-chart-*` in CSS and hex literals in `chartVocabulary.ts`, which
needs real values for SVG fills. The test pins them together so they cannot
drift. A later phase collapses them into one source — at which point the
`"node"` entry in `tsconfig.app.json`'s types (there only so that test can
read the stylesheet) can go too.

### No amber in record state
Amber is the chart's crown and the brand's hue. A third meaning would make
all three ambiguous, so paid/unpaid/waiting are red, green or neutral —
asserted by hue in the token test. Anything merely informational (a
part-paid invoice, a short wait) takes a neutral, not a warning colour.
