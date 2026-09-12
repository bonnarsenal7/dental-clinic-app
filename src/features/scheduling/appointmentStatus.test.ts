import { describe, expect, it } from 'vitest'
import {
  WAIT_NOTICEABLE,
  WAIT_OVERDUE,
  QUEUE_STATUSES,
  canManageBookings,
  canRoleTransition,
  canTransition,
  isInQueue,
  isPending,
  nextStatuses,
  waitSeverity,
  waitingMinutes,
} from './appointmentStatus'
import type { AppointmentStatus } from './types'

describe('appointment status transitions', () => {
  it('walks the normal day forwards', () => {
    expect(canTransition('booked', 'confirmed')).toBe(true)
    expect(canTransition('confirmed', 'arrived')).toBe(true)
    expect(canTransition('arrived', 'in_chair')).toBe(true)
    // Finishing treatment raises the bill; it does not finish the visit.
    // The patient is not done with the clinic until they have paid.
    expect(canTransition('in_chair', 'pending_payment')).toBe(true)
    expect(canTransition('pending_payment', 'completed')).toBe(true)
  })

  it('will not let treatment complete without going past the bill', () => {
    expect(canTransition('in_chair', 'completed')).toBe(false)
  })

  // A day that can run backwards makes the queue meaningless: "arrived"
  // after "completed" would put a treated patient back in the waiting room.
  it('refuses to run backwards', () => {
    expect(canTransition('completed', 'arrived')).toBe(false)
    expect(canTransition('completed', 'in_chair')).toBe(false)
    expect(canTransition('in_chair', 'arrived')).toBe(false)
  })

  it('lets a booking be written off before the patient is seated', () => {
    expect(canTransition('booked', 'no_show')).toBe(true)
    expect(canTransition('arrived', 'cancelled')).toBe(true)
    // ...but not once treatment has started.
    expect(canTransition('in_chair', 'cancelled')).toBe(false)
    expect(canTransition('in_chair', 'no_show')).toBe(false)
  })

  it('lets a cancellation or no-show be rebooked', () => {
    expect(canTransition('cancelled', 'booked')).toBe(true)
    expect(canTransition('no_show', 'booked')).toBe(true)
  })

  it('treats completed as final', () => {
    expect(nextStatuses('completed')).toEqual([])
  })

  it('offers no transition that is not permitted', () => {
    const all: AppointmentStatus[] = [
      'booked',
      'confirmed',
      'arrived',
      'in_chair',
      'completed',
      'cancelled',
      'no_show',
    ]
    for (const from of all) {
      for (const to of nextStatuses(from)) {
        expect(canTransition(from, to)).toBe(true)
      }
    }
  })
})

describe('the queue', () => {
  // The queue is derived from status rather than stored, so these two
  // predicates are the entire definition of "who is in the clinic".
  // Someone owing money is still in the clinic — standing at the counter,
  // and reception's problem until they have paid and left.
  it('is the arrived, in-chair and awaiting-payment patients', () => {
    expect(QUEUE_STATUSES).toEqual(['arrived', 'in_chair', 'pending_payment'])
    expect(isInQueue('arrived')).toBe(true)
    expect(isInQueue('in_chair')).toBe(true)
    expect(isInQueue('pending_payment')).toBe(true)
  })

  it('excludes those not yet here and those already done', () => {
    expect(isInQueue('booked')).toBe(false)
    expect(isInQueue('confirmed')).toBe(false)
    expect(isInQueue('completed')).toBe(false)
    expect(isInQueue('cancelled')).toBe(false)
    expect(isInQueue('no_show')).toBe(false)
  })

  it('counts only the still-expected as pending', () => {
    expect(isPending('booked')).toBe(true)
    expect(isPending('confirmed')).toBe(true)
    expect(isPending('arrived')).toBe(false)
    expect(isPending('no_show')).toBe(false)
  })

  // Every appointment must land in exactly one bucket on the day sheet, or
  // it vanishes from the screen entirely.
  it('puts every status in exactly one section of the day sheet', () => {
    const all: AppointmentStatus[] = [
      'booked',
      'confirmed',
      'arrived',
      'in_chair',
      'completed',
      'cancelled',
      'no_show',
    ]
    for (const status of all) {
      const buckets = [isInQueue(status), isPending(status)].filter(Boolean).length
      expect(buckets).toBeLessThanOrEqual(1)
    }
  })
})

describe('waiting time', () => {
  it('reports whole minutes since arrival', () => {
    const now = new Date('2026-03-01T10:30:00Z')
    expect(waitingMinutes('2026-03-01T10:00:00Z', now)).toBe(30)
  })

  it('is null for someone who has not arrived', () => {
    expect(waitingMinutes(null)).toBeNull()
  })

  // Clock skew between the tablet and the server shouldn't produce
  // "waiting -3 min".
  it('never reports negative waiting', () => {
    const now = new Date('2026-03-01T10:00:00Z')
    expect(waitingMinutes('2026-03-01T10:05:00Z', now)).toBe(0)
  })
})

describe('how bad a wait is', () => {
  // Reception is asked "how long have they been waiting" more than anything
  // else on the schedule, so the answer has to escalate rather than sit at
  // one size and one colour.
  it.each([
    [0, 'settled'],
    [14, 'settled'],
    [15, 'noticeable'],
    [24, 'noticeable'],
    [25, 'overdue'],
    [60, 'overdue'],
  ])('%i minutes reads as %s', (minutes, expected) => {
    expect(waitSeverity(minutes)).toBe(expected)
  })

  // A clinic that habitually runs ten minutes behind should not be shouted
  // at for it, or the red stops meaning anything.
  it('does not raise an alarm over a normal short wait', () => {
    expect(waitSeverity(10)).toBe('settled')
    expect(WAIT_NOTICEABLE).toBeGreaterThan(10)
    expect(WAIT_OVERDUE).toBeGreaterThan(WAIT_NOTICEABLE)
  })
})

// Mirrors appointments_guard_transition() in 0013. The database refuses
// these moves too; this is what stops the UI offering a button that is
// going to be rejected.
describe('whose move it is', () => {
  it('lets only the dentist finish treatment', () => {
    expect(canRoleTransition('dentist', 'in_chair', 'pending_payment')).toBe(true)
    expect(canRoleTransition('receptionist', 'in_chair', 'pending_payment')).toBe(false)
  })

  it('lets only reception accept payment and check the patient out', () => {
    expect(canRoleTransition('receptionist', 'pending_payment', 'completed')).toBe(true)
    expect(canRoleTransition('dentist', 'pending_payment', 'completed')).toBe(false)
  })

  it('lets an admin make either move, to fix a mistake', () => {
    expect(canRoleTransition('admin', 'in_chair', 'pending_payment')).toBe(true)
    expect(canRoleTransition('admin', 'pending_payment', 'completed')).toBe(true)
  })

  // Role permission does not widen the state machine: an admin still cannot
  // move a patient somewhere the day does not go.
  it('does not let any role make an illegal move', () => {
    expect(canRoleTransition('admin', 'completed', 'in_chair')).toBe(false)
    expect(canRoleTransition('admin', 'in_chair', 'completed')).toBe(false)
  })

  // The diary is reception's (0015). Confirming, seating and cancelling are
  // all moves on a booking, and a dentist reads the booking rather than
  // writing to it. Seating in particular assigns the treating dentist,
  // which is booking management however it is spelled.
  it('leaves the rest of the day to reception and admin', () => {
    for (const role of ['receptionist', 'admin'] as const) {
      expect(canRoleTransition(role, 'booked', 'confirmed')).toBe(true)
      expect(canRoleTransition(role, 'arrived', 'in_chair')).toBe(true)
      expect(canRoleTransition(role, 'booked', 'cancelled')).toBe(true)
    }
  })

  it('gives a dentist no move on a booking but finishing treatment', () => {
    expect(canRoleTransition('dentist', 'booked', 'confirmed')).toBe(false)
    expect(canRoleTransition('dentist', 'arrived', 'in_chair')).toBe(false)
    expect(canRoleTransition('dentist', 'booked', 'cancelled')).toBe(false)
    expect(canRoleTransition('dentist', 'in_chair', 'pending_payment')).toBe(true)
  })

  it('says who may manage bookings at all', () => {
    expect(canManageBookings('receptionist')).toBe(true)
    expect(canManageBookings('admin')).toBe(true)
    expect(canManageBookings('dentist')).toBe(false)
  })
})
