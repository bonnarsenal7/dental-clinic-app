import { toLocalDateString } from '../../core/localDate'
import type { DentistShift } from './types'

/** The Monday of the week containing `d`.
 *
 *  Built from local date parts, never from an ISO string: the clinic is at
 *  UTC+8, so a week derived from toISOString() would start on Sunday for
 *  every local time before 08:00. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // Sunday is 0 in JS; the clinic's week starts on Monday.
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + days)
  return out
}

/** The seven local dates of the week `start` begins. */
export function weekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toLocalDateString(addDays(start, i)))
}

/** Six weeks of dates covering `anchor`'s month, Monday first.
 *
 *  Always 42 cells, so the grid does not change height as the month changes
 *  — a calendar that reflows under the finger is one you mis-tap. */
export function monthGrid(anchor: Date): string[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => toLocalDateString(addDays(start, i)))
}

export function isInMonth(date: string, anchor: Date): boolean {
  const [year, month] = date.split('-').map(Number)
  return year === anchor.getFullYear() && month === anchor.getMonth() + 1
}

/** Shifts by date, in the order the database returned them (by time, then
 *  name). A day with nobody on it is simply absent. */
export function groupByDate(shifts: DentistShift[]): Record<string, DentistShift[]> {
  const out: Record<string, DentistShift[]> = {}
  for (const shift of shifts) {
    ;(out[shift.shift_date] ??= []).push(shift)
  }
  return out
}

/** "08:00:00" → "8:00 AM". Parsed by hand rather than through a Date, which
 *  would need a date and a zone to answer a question that involves neither. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function formatShiftRange(shift: Pick<DentistShift, 'starts_at' | 'ends_at'>): string {
  return `${formatTime(shift.starts_at)} – ${formatTime(shift.ends_at)}`
}

/** What an <input type="time"> wants: "08:00:00" → "08:00". */
export function toTimeValue(time: string): string {
  return time.slice(0, 5)
}

export function formatDayLong(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' })
}
