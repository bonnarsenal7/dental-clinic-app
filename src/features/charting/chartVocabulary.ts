// The chart's vocabulary and layout, kept as data so the odontogram, the
// legend, and the tooth detail panel all read from one place.
//
// Tooth numbering is FDI (two-digit), matching the clinic's paper chart:
// the first digit is the quadrant, the second the position from the
// midline outward. Quadrants 1-4 are permanent teeth (positions 1-8),
// quadrants 5-8 are primary teeth (positions 1-5).
//
//        upper right | upper left           upper right | upper left
//   permanent   1    |    2           primary     5     |     6
//   ------------------------          ------------------------------
//   permanent   4    |    3           primary     8     |     7
//        lower right | lower left           lower right | lower left
//
// The condition keys here must stay in step with the check constraint in
// supabase/migrations/0004_charting.sql.

export type ToothConditionKey = 'sound' | 'decayed' | 'filled' | 'missing' | 'crown' | 'planned'

export type ToothSurface = 'mesial' | 'distal' | 'buccal' | 'lingual' | 'occlusal'

/** How a condition folds into a tooth's current state:
 *  - `reset`   clears every finding on the tooth (back to healthy)
 *  - `surface` applies to one named surface
 *  - `whole`   applies to the entire tooth and supersedes surface findings
 *  - `plan`    is an overlay — planned treatment on top of whatever is
 *              already charted, so it does not erase existing findings */
export type ConditionKind = 'reset' | 'surface' | 'whole' | 'plan'

export interface ToothCondition {
  key: ToothConditionKey
  label: string
  /** Literal hex, not a Tailwind class — these are SVG fills. */
  color: string
  kind: ConditionKind
  hint: string
}

export const TOOTH_CONDITIONS: ToothCondition[] = [
  {
    key: 'decayed',
    label: 'Decayed',
    color: '#dc2626',
    kind: 'surface',
    hint: 'Tap the affected surface of a tooth.',
  },
  {
    key: 'filled',
    label: 'Filled',
    color: '#2563eb',
    kind: 'surface',
    hint: 'Tap the restored surface of a tooth.',
  },
  {
    key: 'missing',
    label: 'Missing',
    color: '#64748b',
    kind: 'whole',
    hint: 'Tap a tooth to mark it missing — this clears its surface findings.',
  },
  {
    key: 'crown',
    label: 'Crown',
    color: '#d97706',
    kind: 'whole',
    hint: 'Tap a tooth to crown it — a crown covers every surface.',
  },
  {
    key: 'planned',
    label: 'Planned treatment',
    color: '#059669',
    kind: 'plan',
    hint: 'Tap a tooth to flag planned work. Existing findings stay as charted.',
  },
  {
    key: 'sound',
    label: 'Sound (clear tooth)',
    color: '#94a3b8',
    kind: 'reset',
    hint: 'Tap a tooth to record it as healthy, clearing its current findings.',
  },
]

export const CONDITION_BY_KEY: Record<ToothConditionKey, ToothCondition> = Object.fromEntries(
  TOOTH_CONDITIONS.map((c) => [c.key, c]),
) as Record<ToothConditionKey, ToothCondition>

// --- Arch layout ---------------------------------------------------------

export interface ArchRow {
  id: string
  label: string
  arch: 'upper' | 'lower'
  dentition: 'permanent' | 'primary'
  /** Patient's right side. Drawn on the viewer's left (the chart is read
   *  as if facing the patient), running distal → midline. */
  left: number[]
  /** Patient's left side, drawn on the viewer's right, midline → distal. */
  right: number[]
}

export const ARCH_ROWS: ArchRow[] = [
  {
    id: 'upper-permanent',
    label: 'Upper permanent',
    arch: 'upper',
    dentition: 'permanent',
    left: [18, 17, 16, 15, 14, 13, 12, 11],
    right: [21, 22, 23, 24, 25, 26, 27, 28],
  },
  {
    id: 'upper-primary',
    label: 'Upper primary',
    arch: 'upper',
    dentition: 'primary',
    left: [55, 54, 53, 52, 51],
    right: [61, 62, 63, 64, 65],
  },
  {
    id: 'lower-primary',
    label: 'Lower primary',
    arch: 'lower',
    dentition: 'primary',
    left: [85, 84, 83, 82, 81],
    right: [71, 72, 73, 74, 75],
  },
  {
    id: 'lower-permanent',
    label: 'Lower permanent',
    arch: 'lower',
    dentition: 'permanent',
    left: [48, 47, 46, 45, 44, 43, 42, 41],
    right: [31, 32, 33, 34, 35, 36, 37, 38],
  },
]

export function quadrantOf(toothNumber: number): number {
  return Math.floor(toothNumber / 10)
}

export function positionOf(toothNumber: number): number {
  return toothNumber % 10
}

export function isUpper(toothNumber: number): boolean {
  return [1, 2, 5, 6].includes(quadrantOf(toothNumber))
}

/** True for quadrants drawn on the viewer's left — the patient's right. */
export function isPatientRight(toothNumber: number): boolean {
  return [1, 4, 5, 8].includes(quadrantOf(toothNumber))
}

export function isPrimary(toothNumber: number): boolean {
  return quadrantOf(toothNumber) >= 5
}

/** Incisors and canines — they have an incisal edge rather than an
 *  occlusal table, and a labial rather than buccal face. */
export function isAnterior(toothNumber: number): boolean {
  return positionOf(toothNumber) <= 3
}

const PERMANENT_POSITION_NAMES = [
  'central incisor',
  'lateral incisor',
  'canine',
  'first premolar',
  'second premolar',
  'first molar',
  'second molar',
  'third molar',
]

const PRIMARY_POSITION_NAMES = ['central incisor', 'lateral incisor', 'canine', 'first molar', 'second molar']

/** e.g. 16 → "Upper right first molar", 65 → "Upper left second primary molar". */
export function toothName(toothNumber: number): string {
  const arch = isUpper(toothNumber) ? 'Upper' : 'Lower'
  const side = isPatientRight(toothNumber) ? 'right' : 'left'
  const names = isPrimary(toothNumber) ? PRIMARY_POSITION_NAMES : PERMANENT_POSITION_NAMES
  const name = names[positionOf(toothNumber) - 1] ?? 'tooth'
  return isPrimary(toothNumber) ? `${arch} ${side} ${name} (primary)` : `${arch} ${side} ${name}`
}

// --- Surfaces ------------------------------------------------------------

/** Which surface each edge of a tooth's square represents. Mesial is the
 *  edge nearer the midline, so it flips between the two halves of the
 *  chart; buccal/lingual flip between the arches, because the chart is
 *  drawn looking at the patient from the front. */
export function surfacesForTooth(toothNumber: number): {
  top: ToothSurface
  right: ToothSurface
  bottom: ToothSurface
  left: ToothSurface
  center: ToothSurface
} {
  const upper = isUpper(toothNumber)
  const patientRight = isPatientRight(toothNumber)
  return {
    top: upper ? 'buccal' : 'lingual',
    bottom: upper ? 'lingual' : 'buccal',
    right: patientRight ? 'mesial' : 'distal',
    left: patientRight ? 'distal' : 'mesial',
    center: 'occlusal',
  }
}

export const SURFACE_ORDER: ToothSurface[] = ['mesial', 'distal', 'buccal', 'lingual', 'occlusal']

/** Surfaces are stored under five canonical names, but a dentist reads
 *  them by the term that fits the tooth: an incisor has an incisal edge
 *  and a labial face, an upper tooth has a palatal face. */
export function surfaceLabel(surface: ToothSurface, toothNumber: number): string {
  switch (surface) {
    case 'occlusal':
      return isAnterior(toothNumber) ? 'Incisal' : 'Occlusal'
    case 'buccal':
      return isAnterior(toothNumber) ? 'Labial' : 'Buccal'
    case 'lingual':
      return isUpper(toothNumber) ? 'Palatal' : 'Lingual'
    case 'mesial':
      return 'Mesial'
    case 'distal':
      return 'Distal'
  }
}
