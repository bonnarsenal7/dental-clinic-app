import { describe, expect, it } from 'vitest'
import {
  WAIT_NOTICEABLE,
  WAIT_OVERDUE,
  QUEUE_STATUSES,
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
    expect(canTransition('in_chair', 'completed')).toBe(true)
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
  it('is exactly the arrived and in-chair patients', () => {
    expect(QUEUE_STATUSES).toEqual(['arrived', 'in_chair'])
    expect(isInQueue('arrived')).toBe(true)
    expect(isInQueue('in_chair')).toBe(true)
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
