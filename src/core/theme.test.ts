import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOTH_CONDITIONS } from '../features/charting/chartVocabulary'

// Read from disk rather than importing the stylesheet. Two other routes
// look cleaner and neither works: `new URL(..., import.meta.url)` is not a
// file:// URL under happy-dom, and Vite's `?raw` returns an empty string
// because the Tailwind plugin claims .css imports before the raw loader
// sees them.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

function token(name: string): string | null {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))
  return m ? m[1].toUpperCase() : null
}

describe('design tokens', () => {
  // chartVocabulary.ts needs real hex values because they are SVG fills, and
  // the stylesheet needs them so the fencing rule is greppable. Two sources
  // of truth is a drift risk until a later phase collapses them — this is
  // what stops them drifting in the meantime.
  it('keeps the chart tokens identical to the charting vocabulary', () => {
    for (const condition of TOOTH_CONDITIONS) {
      if (condition.key === 'sound') continue // no fill of its own
      const declared = token(`color-chart-${condition.key}`)
      expect(declared, `--color-chart-${condition.key} is missing from index.css`).not.toBeNull()
      expect(declared, `chart token for "${condition.key}" has drifted`).toBe(condition.color.toUpperCase())
    }
  })

  // The guard the whole gold palette rests on.
  it('keeps deep gold distinguishable from the crown amber', () => {
    const crown = token('color-chart-crown')!
    expect(contrast(token('color-gold-900')!, crown)).toBeGreaterThan(3)
    // Documents *why* the guard exists rather than only asserting the fix.
    expect(contrast(token('color-gold-700')!, crown)).toBeLessThan(2)
  })

  // Sharper than the guard above, and the reason the chart legend's selected
  // state is a light tint rather than a solid gold button: a chart swatch is
  // information, and on a dark saturated ground it stops being readable.
  // Every one of the five measures under 2.1:1 on gold-700.
  it('keeps every chart swatch legible on the tint the legend selects with', () => {
    const tint = token('color-gold-100')!
    const solid = token('color-gold-700')!
    for (const condition of TOOTH_CONDITIONS) {
      if (condition.key === 'sound') continue
      const c = condition.color
      expect(contrast(c, tint), `${condition.key} on gold-100`).toBeGreaterThan(2.5)
      expect(contrast(c, solid), `${condition.key} would vanish on gold-700`).toBeLessThan(2.5)
    }
  })

  it('carries the full gold scale', () => {
    for (const step of [50, 100, 300, 500, 600, 700, 800, 900]) {
      expect(token(`color-gold-${step}`), `gold-${step}`).not.toBeNull()
    }
  })

  // Overriding slate is what re-skins 638 existing usages without touching a
  // component. Each step was solved to match the luminance of the Tailwind
  // slate it replaces, so the app's existing contrast ratios survive.
  it.each([
    ['800', '#FFFFFF', 14.0],
    ['600', '#FFFFFF', 7.0],
    ['500', '#FFFFFF', 4.5],
  ])('keeps slate-%s legible on white (>= %s:1)', (step, bg, min) => {
    const value = token(`color-slate-${step}`)!
    expect(contrast(value, bg)).toBeGreaterThanOrEqual(min)
  })

  // The odontogram gives every tooth and surface role="button". A print
  // rule that hid everything with that role would print a blank chart —
  // the one document most worth printing — and nobody would notice until a
  // sheet came out of the printer empty.
  it('does not hide the chart when printing', () => {
    // Comments stripped first: the block carries an explanatory note that
    // mentions role="button" precisely because this is the trap, and a
    // naive match finds the comment rather than a rule.
    const print = stripComments(css.slice(css.indexOf('@media print')))
    expect(print).toContain('button,')
    expect(print).not.toMatch(/\[role="button"\]/)
  })

  // Red decay and a blue filling have to stay distinguishable on paper.
  it('keeps the chart in colour when printing', () => {
    const print = stripComments(css.slice(css.indexOf('@media print')))
    expect(print).toMatch(/print-color-adjust:\s*exact/)
  })

  // A clipped table on screen scrolls; on paper it is a lost record.
  it('unclips scroll containers when printing', () => {
    const print = stripComments(css.slice(css.indexOf('@media print')))
    expect(print).toContain('.overflow-x-auto')
    expect(print).toMatch(/overflow:\s*visible/)
  })

  // Amber is the chart's crown and the brand's hue. A third meaning would
  // make all three ambiguous, so record state is red, green or neutral.
  it('keeps amber out of the record-state tokens', () => {
    const AMBER_BAND = [25, 55] as const
    for (const name of ['state-attention', 'state-settled']) {
      const h = hue(token(`color-${name}`)!)
      const isAmber = h >= AMBER_BAND[0] && h <= AMBER_BAND[1]
      expect(isAmber, `${name} sits at ${Math.round(h)}deg, inside the amber band`).toBe(false)
    }
  })
})

function stripComments(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

function channels(h: string) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}
function luminance(h: string) {
  const [r, g, b] = channels(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** Hue in degrees, 0-360. Amber sits around 35-45. */
function hue(h: string) {
  const [r, g, b] = channels(h)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const deg = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (((deg * 60) % 360) + 360) % 360
}
