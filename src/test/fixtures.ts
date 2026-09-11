import type { Appointment } from '../features/scheduling/types'

/** Complete, valid domain objects for tests.
 *
 *  Spread and override the field under test. Building these inline meant
 *  partial objects cast with `as`, which typecheck by fiat — so a field
 *  added to the type never showed up as missing anywhere. */
export function anAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a-1',
    patient_id: 'p-1',
    dentist_id: 'd-1',
    scheduled_at: '2026-09-12T01:00:00.000Z',
    duration_minutes: 30,
    ends_at: '2026-09-12T01:30:00.000Z',
    reason: 'Cleaning',
    procedure_id: null,
    status: 'confirmed',
    arrived_at: null,
    seated_at: null,
    completed_at: null,
    visit_id: null,
    reception_notes: null,
    created_by: 's-1',
    created_at: '2026-09-11T02:00:00.000Z',
    updated_at: '2026-09-11T02:00:00.000Z',
    ...overrides,
  }
}
