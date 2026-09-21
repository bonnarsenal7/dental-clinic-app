import { describe, expect, it } from 'vitest'
import {
  formatShiftRange,
  formatTime,
  groupByDate,
  isInMonth,
  monthGrid,
  startOfWeek,
  toTimeValue,
  weekDates,
} from './calendarWeek'
import type { DentistShift } from './types'

function shift(partial: Partial<DentistShift> = {}): DentistShift {
  return {
    id: 's-1',
    dentist_id: 'd-1',
    dentist_name: 'Dr. Santos',
    shift_date: '2026-09-21',
    starts_at: '08:00:00',
    ends_at: '12:30:00',
    note: null,
    ...partial,
  }
}

describe('startOfWeek', () => {
  it('goes back to Monday', () => {
    // Wednesday 23 Sept 2026.
    expect(startOfWeek(new Date(2026, 8, 23))).toEqual(new Date(2026, 8, 21))
  })

  // The case a naive `date - getDay()` gets wrong: JS numbers Sunday 0, so
  // subtracting it leaves Sunday where it is and starts the week a day late.
  it('treats Sunday as the end of the week, not the start', () => {
    expect(startOfWeek(new Date(2026, 8, 27))).toEqual(new Date(2026, 8, 21))
  })

  it('leaves a Monday alone', () => {
    expect(startOfWeek(new Date(2026, 8, 21))).toEqual(new Date(2026, 8, 21))
  })
})

describe('weekDates', () => {
  it('runs Monday to Sunday', () => {
    expect(weekDates(new Date(2026, 8, 21))).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ])
  })

  // The clinic is at UTC+8, so a week built through toISOString() would start
  // a day early for every local time before 08:00.
  it('is built from local dates, not UTC ones', () => {
    // 01:00 local on the 21st is still the 20th in UTC.
    expect(weekDates(startOfWeek(new Date(2026, 8, 21, 1, 0)))[0]).toBe('2026-09-21')
  })
})

describe('monthGrid', () => {
  const grid = monthGrid(new Date(2026, 8, 15))

  it('is always six weeks, so the calendar does not change height', () => {
    expect(grid).toHaveLength(42)
  })

  it('starts on the Monday on or before the 1st', () => {
    // 1 Sept 2026 is a Tuesday, so the grid opens on 31 August.
    expect(grid[0]).toBe('2026-08-31')
  })

  it('covers the whole month', () => {
    expect(grid).toContain('2026-09-01')
    expect(grid).toContain('2026-09-30')
  })

  it('knows which cells are the month being shown', () => {
    expect(isInMonth('2026-09-01', new Date(2026, 8, 15))).toBe(true)
    expect(isInMonth('2026-08-31', new Date(2026, 8, 15))).toBe(false)
  })
})

describe('formatTime', () => {
  it.each([
    ['08:00:00', '8:00 AM'],
    ['13:05:00', '1:05 PM'],
    // Noon and midnight are where a naive `h % 12` prints "0:00".
    ['12:00:00', '12:00 PM'],
    ['00:30:00', '12:30 AM'],
  ])('reads %s as %s', (stored, shown) => {
    expect(formatTime(stored)).toBe(shown)
  })

  it('shows a shift as a range', () => {
    expect(formatShiftRange(shift())).toBe('8:00 AM – 12:30 PM')
  })

  it('trims seconds off for a time input', () => {
    expect(toTimeValue('08:00:00')).toBe('08:00')
  })
})

describe('groupByDate', () => {
  it('keeps each day together in the order given', () => {
    const grouped = groupByDate([
      shift({ id: 'a', starts_at: '08:00:00' }),
      shift({ id: 'b', shift_date: '2026-09-22' }),
      shift({ id: 'c', starts_at: '13:00:00', ends_at: '17:00:00' }),
    ])
    expect(grouped['2026-09-21'].map((s) => s.id)).toEqual(['a', 'c'])
    expect(grouped['2026-09-22'].map((s) => s.id)).toEqual(['b'])
  })

  it('leaves a day with nobody on it absent rather than empty', () => {
    expect(groupByDate([])['2026-09-21']).toBeUndefined()
  })
})
