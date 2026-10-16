import { describe, expect, it } from 'vitest'
import { WEIGHT_OPTIONS, formatWeight } from './weight'

describe('weight', () => {
  it('offers 10 to 100 kg in half-kilogram steps', () => {
    expect(WEIGHT_OPTIONS.slice(0, 3)).toEqual([
      { value: '10', label: '10 kg' },
      { value: '10.5', label: '10.5 kg' },
      { value: '11', label: '11 kg' },
    ])
    expect(WEIGHT_OPTIONS.at(-1)).toEqual({ value: '100', label: '100 kg' })
    expect(WEIGHT_OPTIONS).toHaveLength(181)
  })

  it('matches a stored value as the edit page passes it', () => {
    expect(WEIGHT_OPTIONS.some((o) => o.value === String(52))).toBe(true)
    expect(WEIGHT_OPTIONS.some((o) => o.value === String(52.5))).toBe(true)
  })

  it('formats a stored weight, and nothing as a dash', () => {
    expect(formatWeight(52)).toBe('52 kg')
    expect(formatWeight(null)).toBe('—')
  })
})
