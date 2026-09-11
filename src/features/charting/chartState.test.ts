import { describe, expect, it } from 'vitest'
import { deriveChart, hasFindings, toothStateOf } from './chartState'
import type { ToothConditionKey, ToothSurface } from './chartVocabulary'

function mark(tooth: number, condition: ToothConditionKey, surface: ToothSurface | null = null) {
  return { tooth_number: tooth, surface, condition }
}

describe('deriveChart', () => {
  it('applies surface findings to the named surface only', () => {
    const chart = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'filled', 'mesial')])
    expect(toothStateOf(chart, 16).surfaces).toEqual({ occlusal: 'decayed', mesial: 'filled' })
  })

  // The property the whole append-only design rests on: order decides
  // meaning, and later entries supersede earlier ones.
  it('lets a later entry supersede an earlier one on the same surface', () => {
    const chart = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'filled', 'occlusal')])
    expect(toothStateOf(chart, 16).surfaces.occlusal).toBe('filled')
  })

  it('is order-sensitive: the reverse sequence gives the opposite result', () => {
    const forward = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'sound')])
    const reverse = deriveChart([mark(16, 'sound'), mark(16, 'decayed', 'occlusal')])
    expect(hasFindings(toothStateOf(forward, 16))).toBe(false)
    expect(toothStateOf(reverse, 16).surfaces.occlusal).toBe('decayed')
  })

  it('clears surface findings when a tooth goes missing', () => {
    const chart = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'missing')])
    expect(toothStateOf(chart, 16)).toMatchObject({ condition: 'missing', surfaces: {} })
  })

  it('clears surface findings when a crown covers the tooth', () => {
    const chart = deriveChart([mark(16, 'filled', 'mesial'), mark(16, 'crown')])
    expect(toothStateOf(chart, 16)).toMatchObject({ condition: 'crown', surfaces: {} })
  })

  // planned is an overlay, not a state — it must not erase what is charted.
  it('keeps existing findings when planned treatment is added', () => {
    const chart = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'planned')])
    expect(toothStateOf(chart, 16)).toMatchObject({
      planned: true,
      surfaces: { occlusal: 'decayed' },
    })
  })

  it('resets everything on sound, including a plan', () => {
    const chart = deriveChart([mark(16, 'decayed', 'occlusal'), mark(16, 'planned'), mark(16, 'sound')])
    expect(hasFindings(toothStateOf(chart, 16))).toBe(false)
  })

  it('keeps teeth independent of one another', () => {
    const chart = deriveChart([mark(16, 'missing'), mark(26, 'decayed', 'distal')])
    expect(toothStateOf(chart, 16).condition).toBe('missing')
    expect(toothStateOf(chart, 26).condition).toBeNull()
  })

  it('returns a clean state for a tooth never charted', () => {
    expect(hasFindings(toothStateOf(deriveChart([]), 48))).toBe(false)
  })

  it('skips an unrecognised condition rather than crashing', () => {
    const chart = deriveChart([
      mark(16, 'decayed', 'occlusal'),
      mark(16, 'implant' as ToothConditionKey),
    ])
    expect(toothStateOf(chart, 16).surfaces.occlusal).toBe('decayed')
  })
})
