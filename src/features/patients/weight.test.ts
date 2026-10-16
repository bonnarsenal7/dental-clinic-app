import { describe, expect, it } from 'vitest'
import { WEIGHT_OPTIONS, formatWeight } from './weight'

describe('weight', () => {
  it('offers 20 to 100 kg in one-kilogram steps', () => {
    expect(WEIGHT_OPTIONS[0]).toEqual({ value: '20', label: '20 kg' })
    expect(WEIGHT_OPTIONS.at(-1)).toEqual({ value: '100', label: '100 kg' })
    expect(WEIGHT_OPTIONS).toHaveLength(81)
  })

  it('matches a stored whole-kilogram value as the edit page passes it', () => {
    expect(WEIGHT_OPTIONS.some((o) => o.value === String(52))).toBe(true)
  })

  it('formats a stored weight, and nothing as a dash', () => {
    expect(formatWeight(52)).toBe('52 kg')
    expect(formatWeight(null)).toBe('—')
  })
})
