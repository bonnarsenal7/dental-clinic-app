import { describe, expect, it } from 'vitest'
import { toLocalDateString } from './localDate'

describe('toLocalDateString', () => {
  // The whole point: the tests run in Asia/Manila (see package.json), where
  // any local time before 08:00 is still the previous day in UTC.
  it('returns the local date, not the UTC one, just after midnight', () => {
    expect(toLocalDateString(new Date('2026-09-30T00:30:00'))).toBe('2026-09-30')
  })

  it('returns the local date late in the evening', () => {
    expect(toLocalDateString(new Date('2026-09-30T23:45:00'))).toBe('2026-09-30')
  })

  it('pads single-digit months and days, so it sorts and compares as a date', () => {
    expect(toLocalDateString(new Date('2026-01-05T12:00:00'))).toBe('2026-01-05')
  })

  it('disagrees with toISOString when the two dates differ', () => {
    const d = new Date('2026-09-30T00:30:00')
    expect(toLocalDateString(d)).not.toBe(d.toISOString().slice(0, 10))
  })
})
