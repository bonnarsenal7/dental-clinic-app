import { describe, expect, it } from 'vitest'
import {
  ARCH_ROWS,
  CONDITION_BY_KEY,
  TOOTH_CONDITIONS,
  isAnterior,
  isPatientRight,
  isPrimary,
  isUpper,
  surfaceLabel,
  surfacesForTooth,
  toothName,
} from './chartVocabulary'

describe('FDI layout', () => {
  it('covers all 32 permanent and all 20 primary teeth, once each', () => {
    const all = ARCH_ROWS.flatMap((r) => [...r.left, ...r.right])
    expect(all).toHaveLength(52)
    expect(new Set(all).size).toBe(52)
    expect(all.filter((n) => n < 50)).toHaveLength(32)
    expect(all.filter((n) => n >= 50)).toHaveLength(20)
  })

  it('uses only valid FDI numbers', () => {
    const valid = (n: number) => {
      const q = Math.floor(n / 10),
        p = n % 10
      return (q >= 1 && q <= 4 && p >= 1 && p <= 8) || (q >= 5 && q <= 8 && p >= 1 && p <= 5)
    }
    for (const n of ARCH_ROWS.flatMap((r) => [...r.left, ...r.right])) {
      expect(valid(n), `tooth ${n}`).toBe(true)
    }
  })

  // The chart is read facing the patient, so their right is the viewer's
  // left. Getting this backwards mirrors the entire chart.
  it("puts the patient's right on the viewer's left", () => {
    for (const row of ARCH_ROWS) {
      for (const n of row.left) expect(isPatientRight(n), `tooth ${n}`).toBe(true)
      for (const n of row.right) expect(isPatientRight(n), `tooth ${n}`).toBe(false)
    }
  })

  it('runs each half from distal in to the midline', () => {
    for (const row of ARCH_ROWS) {
      expect(row.left.at(-1)! % 10).toBe(1) // ends at the midline
      expect(row.right[0] % 10).toBe(1) // starts at the midline
    }
  })
})

describe('surface mapping', () => {
  // Mesial means "toward the midline", so which edge of the square that is
  // flips between the two halves of the chart. Charting a filling on the
  // distal when it was mesial is a wrong clinical record.
  it('flips mesial and distal between the halves', () => {
    expect(surfacesForTooth(16).right).toBe('mesial') // upper right, midline is to the right
    expect(surfacesForTooth(16).left).toBe('distal')
    expect(surfacesForTooth(26).left).toBe('mesial') // upper left, midline is to the left
    expect(surfacesForTooth(26).right).toBe('distal')
  })

  // Likewise buccal/lingual flip between the arches, because the lower row
  // is drawn below the occlusal plane.
  it('flips buccal and lingual between the arches', () => {
    expect(surfacesForTooth(16).top).toBe('buccal')
    expect(surfacesForTooth(16).bottom).toBe('lingual')
    expect(surfacesForTooth(46).top).toBe('lingual')
    expect(surfacesForTooth(46).bottom).toBe('buccal')
  })

  it('always has the occlusal table in the middle', () => {
    for (const n of [11, 18, 28, 31, 48, 55, 85]) {
      expect(surfacesForTooth(n).center).toBe('occlusal')
    }
  })

  it('gives every tooth five distinct surfaces', () => {
    for (const row of ARCH_ROWS) {
      for (const n of [...row.left, ...row.right]) {
        const s = surfacesForTooth(n)
        expect(new Set(Object.values(s)).size, `tooth ${n}`).toBe(5)
      }
    }
  })

  // Stored names stay canonical; only the wording a dentist reads adapts.
  it('reads incisal and labial on a front tooth, occlusal and buccal on a molar', () => {
    expect(surfaceLabel('occlusal', 11)).toBe('Incisal')
    expect(surfaceLabel('buccal', 11)).toBe('Labial')
    expect(surfaceLabel('occlusal', 16)).toBe('Occlusal')
    expect(surfaceLabel('buccal', 16)).toBe('Buccal')
  })

  it('reads palatal on the upper arch and lingual on the lower', () => {
    expect(surfaceLabel('lingual', 16)).toBe('Palatal')
    expect(surfaceLabel('lingual', 46)).toBe('Lingual')
  })
})

describe('tooth naming', () => {
  it.each([
    [11, 'Upper right central incisor'],
    [26, 'Upper left first molar'],
    [48, 'Lower right third molar'],
    [31, 'Lower left central incisor'],
    [65, 'Upper left second molar (primary)'],
  ])('names %i', (tooth, expected) => {
    expect(toothName(tooth)).toBe(expected)
  })

  it('classifies arches, sides and dentitions', () => {
    expect(isUpper(16)).toBe(true)
    expect(isUpper(46)).toBe(false)
    expect(isPrimary(55)).toBe(true)
    expect(isPrimary(15)).toBe(false)
    expect(isAnterior(13)).toBe(true)
    expect(isAnterior(14)).toBe(false)
  })
})

describe('condition vocabulary', () => {
  // The database constrains these values too (0004_charting.sql), so the
  // two must not drift.
  it('matches the keys the database allows', () => {
    expect(TOOTH_CONDITIONS.map((c) => c.key).sort()).toEqual([
      'crown',
      'decayed',
      'filled',
      'missing',
      'planned',
      'sound',
    ])
  })

  // Only these two carry a surface; the schema enforces the same rule with
  // tooth_records_surface_scope_check.
  it('marks exactly decayed and filled as surface-scoped', () => {
    const surfaceScoped = TOOTH_CONDITIONS.filter((c) => c.kind === 'surface').map((c) => c.key)
    expect(surfaceScoped.sort()).toEqual(['decayed', 'filled'])
  })

  it('gives every condition a colour and a hint', () => {
    for (const c of TOOTH_CONDITIONS) {
      expect(c.color, c.key).toMatch(/^#[0-9a-f]{6}$/i)
      expect(c.hint.length, c.key).toBeGreaterThan(10)
      expect(CONDITION_BY_KEY[c.key]).toBe(c)
    }
  })
})
