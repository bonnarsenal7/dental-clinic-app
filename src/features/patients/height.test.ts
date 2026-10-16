import { describe, expect, it } from 'vitest'
import { HEIGHT_OPTIONS, formatHeight, toHeightOption } from './height'

describe('height', () => {
  it('offers 3\'0" to 7\'10" in one-inch steps', () => {
    expect(HEIGHT_OPTIONS[0].label).toBe(`3'0"`)
    expect(HEIGHT_OPTIONS.at(-1)?.label).toBe(`7'10"`)
    expect(HEIGHT_OPTIONS).toHaveLength(59)
  })

  it('stores centimetres that read back as the same height', () => {
    for (const o of HEIGHT_OPTIONS) expect(formatHeight(o.value)).toBe(o.label)
  })

  it('snaps a pre-dropdown centimetre value onto its option', () => {
    expect(toHeightOption('162')).toBe('162.6')
    expect(formatHeight(162)).toBe(`5'4"`)
  })

  it('leaves blank and out-of-range values alone', () => {
    expect(toHeightOption('')).toBe('')
    expect(toHeightOption('60')).toBe('60')
    expect(formatHeight(null)).toBe('—')
  })
})
