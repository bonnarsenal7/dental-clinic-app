import type { AppointmentStatus } from './types'

// The front desk's day, encoded once. Which moves are legal, what each
// state is called, and how it looks — so the day sheet, the queue and the
// patient profile can't drift from one another.

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: 'Booked',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  in_chair: 'In chair',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
}

export const STATUS_STYLES: Record<AppointmentStatus, string> = {
  booked: 'bg-slate-100 text-slate-600 border-slate-200',
  confirmed: 'bg-sky-50 text-sky-700 border-sky-200',
  arrived: 'bg-amber-50 text-amber-800 border-amber-200',
  in_chair: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  completed: 'bg-slate-100 text-slate-500 border-slate-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
  no_show: 'bg-red-50 text-red-700 border-red-200',
}

/** A day only runs forwards. Allowing any status from any other turns the
 *  queue into a guess — "arrived" after "completed" would mean nothing. */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ['confirmed', 'arrived', 'cancelled', 'no_show'],
  confirmed: ['arrived', 'cancelled', 'no_show'],
  arrived: ['in_chair', 'cancelled', 'no_show'],
  in_chair: ['completed'],
  completed: [],
  cancelled: ['booked'],
  no_show: ['booked'],
}

export function nextStatuses(from: AppointmentStatus): AppointmentStatus[] {
  return TRANSITIONS[from] ?? []
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return nextStatuses(from).includes(to)
}

/** In the clinic right now — waiting or being treated. This is the queue;
 *  there is no queue table, because where a patient is *is* their status. */
export const QUEUE_STATUSES: AppointmentStatus[] = ['arrived', 'in_chair']

export function isInQueue(status: AppointmentStatus): boolean {
  return QUEUE_STATUSES.includes(status)
}

/** Still expected today — hasn't arrived, hasn't been written off. */
export function isPending(status: AppointmentStatus): boolean {
  return status === 'booked' || status === 'confirmed'
}

/** How long someone has been waiting, in whole minutes. The number reception
 *  is asked about most often. */
export function waitingMinutes(arrivedAt: string | null, now: Date = new Date()): number | null {
  if (!arrivedAt) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(arrivedAt).getTime()) / 60000))
}

export type WaitSeverity = 'settled' | 'noticeable' | 'overdue'

/** Thresholds in minutes. A clinic that habitually runs ten minutes behind
 *  should not be shouted at for it, so "noticeable" starts at 15 and the
 *  red line at 25 — past that, someone is owed an explanation. */
export const WAIT_NOTICEABLE = 15
export const WAIT_OVERDUE = 25

export function waitSeverity(minutes: number): WaitSeverity {
  if (minutes >= WAIT_OVERDUE) return 'overdue'
  if (minutes >= WAIT_NOTICEABLE) return 'noticeable'
  return 'settled'
}
