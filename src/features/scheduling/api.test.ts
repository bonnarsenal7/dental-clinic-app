import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabaseMock'
import { anAppointment } from '../../test/fixtures'

const sb = vi.hoisted(() => {
  // Required: vi.mock is hoisted above imports, so the double has to exist
  // before the module factory runs.
  return { current: null as ReturnType<typeof import('../../test/supabaseMock').createSupabaseMock> | null }
})
vi.mock('../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const api = await import('./api')

function mock() {
  sb.current = createSupabaseMock()
  return sb.current
}

const APPOINTMENT = anAppointment()

describe('scheduling api', () => {
  beforeEach(() => {
    mock()
  })

  // --- The day's bounds ---------------------------------------------------

  // CLAUDE.md: "Dates are local, never UTC." The clinic is UTC+8, so a day
  // built from UTC bounds puts evening appointments on the following sheet.
  it("asks for the clinic's local day, not the UTC day", async () => {
    sb.current!.queue('appointments', { data: [] })
    // Mid-afternoon in Manila on the 12th.
    await api.listAppointmentsForDay(new Date('2026-09-12T15:30:00'))

    const q = sb.current!.query('appointments')!
    const start = new Date(q.arg('gte', 1) as string)
    const end = new Date(q.arg('lt', 1) as string)

    expect(q.arg('gte', 0)).toBe('scheduled_at')
    // Local midnight to local midnight, whatever the runner's zone.
    expect(start.getHours()).toBe(0)
    expect(start.getDate()).toBe(12)
    expect(end.getDate()).toBe(13)
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('orders the day forwards, so the sheet reads top to bottom', async () => {
    sb.current!.queue('appointments', { data: [] })
    await api.listAppointmentsForDay(new Date('2026-09-12T09:00:00'))
    expect(sb.current!.query('appointments')!.arg('order', 0)).toBe('scheduled_at')
    expect(sb.current!.query('appointments')!.arg('order', 1)).toEqual({ ascending: true })
  })

  // "Finish treatment" on the patient's record acts on this. An appointment
  // for the visit that is not in the chair must not be offered as finishable.
  it('finds the visit appointment only while it is in the chair', async () => {
    sb.current!.queue('appointments', { data: null })
    expect(await api.findInChairAppointmentForVisit('v-1')).toBeNull()
    const q = sb.current!.query('appointments')!
    expect(q.calls).toContainEqual({ method: 'eq', args: ['visit_id', 'v-1'] })
    expect(q.calls).toContainEqual({ method: 'eq', args: ['status', 'in_chair'] })
  })

  // Both only move an appointment still awaiting payment: a second tap from
  // another receptionist's tablet must change nothing.
  it('checks out a no-charge visit only while it is awaiting payment', async () => {
    sb.current!.queue('appointments', { data: null })
    await api.checkOutWithoutCharge('a-1')
    const q = sb.current!.query('appointments')!
    expect(q.payload).toMatchObject({ status: 'completed' })
    expect(q.calls).toContainEqual({ method: 'eq', args: ['id', 'a-1'] })
    expect(q.calls).toContainEqual({ method: 'eq', args: ['status', 'pending_payment'] })
  })

  it("completes the visit's awaiting appointment once its bill is settled", async () => {
    sb.current!.queue('appointments', { data: null })
    await api.completeAwaitingForVisit('v-1')
    const q = sb.current!.query('appointments')!
    expect(q.payload).toMatchObject({ status: 'completed' })
    expect((q.payload as { completed_at: string }).completed_at).toBeTruthy()
    expect(q.calls).toContainEqual({ method: 'eq', args: ['visit_id', 'v-1'] })
    expect(q.calls).toContainEqual({ method: 'eq', args: ['status', 'pending_payment'] })
  })

  // 0018 dropped interval_months. Writing it would fail against the live
  // table, so the insert must carry the date and nothing interval-shaped.
  it('saves a recall as its date alone', async () => {
    sb.current!.queue('recalls', { data: { id: 'r-1' } })
    await api.createRecall({ patientId: 'p-1', dueOn: '2027-03-01', reason: 'Check-up', staffId: 's-1' })
    expect(sb.current!.query('recalls')!.payload).toEqual({
      patient_id: 'p-1',
      due_on: '2027-03-01',
      reason: 'Check-up',
      created_by: 's-1',
    })
  })

  it('embeds the patient, or the day sheet shows uuids', async () => {
    sb.current!.queue('appointments', { data: [] })
    await api.listAppointmentsForDay(new Date('2026-09-12T09:00:00'))
    expect(sb.current!.query('appointments')!.arg('select')).toContain('patients(')
  })

  // --- Double-booking -----------------------------------------------------

  // The database refuses the overlap (0008_scheduling.sql). A receptionist
  // cannot act on a constraint name, so the refusal has to be translated.
  it('turns the double-booking constraint into instructions', async () => {
    sb.current!.queue('appointments', {
      error: {
        message: 'conflicting key value violates exclusion constraint "appointments_no_double_booking"',
      },
    })
    await expect(
      api.bookAppointment({
        patientId: 'p-1',
        dentistId: 'd-1',
        scheduledAt: '2026-09-12T01:00:00.000Z',
        durationMinutes: 30,
        reason: null,
        procedureId: null,
        receptionNotes: null,
        staffId: 's-1',
      }),
    ).rejects.toThrow(/already has an appointment overlapping this time/i)
  })

  it('passes other failures through with their own wording', async () => {
    sb.current!.queue('appointments', { error: { message: 'new row violates row-level security policy' } })
    await expect(
      api.bookAppointment({
        patientId: 'p-1',
        dentistId: null,
        scheduledAt: '2026-09-12T01:00:00.000Z',
        durationMinutes: 30,
        reason: null,
        procedureId: null,
        receptionNotes: null,
        staffId: 's-1',
      }),
    ).rejects.toThrow(/row-level security/i)
  })

  it('translates the same constraint when rescheduling, not only when booking', async () => {
    sb.current!.queue('appointments', {
      error: { message: 'violates exclusion constraint "appointments_no_double_booking"' },
    })
    await expect(api.rescheduleAppointment('a-1', '2026-09-12T02:00:00.000Z', 30)).rejects.toThrow(
      /already has an appointment overlapping this time/i,
    )
  })

  // --- Seating a patient --------------------------------------------------

  // The "no manual re-entry" thread: the dentist charts against the booking
  // instead of pressing "Start a visit for today".
  it('creates the visit when a patient is seated, and links it', async () => {
    sb.current!.queue('visits', { data: { id: 'v-9' } })
    sb.current!.queue('appointments', { data: anAppointment({ status: 'in_chair', visit_id: 'v-9' }) })

    await api.setAppointmentStatus({ appointment: APPOINTMENT, status: 'in_chair', staffId: 's-1' })

    expect(sb.current!.query('visits')!.payload).toMatchObject({
      patient_id: 'p-1',
      staff_id: 'd-1', // the treating dentist, not whoever pressed the button
    })
    expect(sb.current!.query('appointments')!.payload).toMatchObject({
      status: 'in_chair',
      visit_id: 'v-9',
    })
  })

  it('reuses an existing visit rather than creating a second one', async () => {
    sb.current!.queue('appointments', { data: APPOINTMENT })
    await api.setAppointmentStatus({
      appointment: anAppointment({ visit_id: 'v-already' }),
      status: 'in_chair',
      staffId: 's-1',
    })
    expect(sb.current!.query('visits')).toBeUndefined()
  })

  it('falls back to the acting staff member when no dentist is assigned', async () => {
    sb.current!.queue('visits', { data: { id: 'v-9' } })
    sb.current!.queue('appointments', { data: APPOINTMENT })
    await api.setAppointmentStatus({
      appointment: anAppointment({ dentist_id: null }),
      status: 'in_chair',
      staffId: 's-1',
    })
    expect(sb.current!.query('visits')!.payload).toMatchObject({ staff_id: 's-1' })
  })

  // A failed visit insert must not leave the appointment marked in_chair
  // with no visit behind it.
  it('does not seat the patient if the visit could not be created', async () => {
    sb.current!.queue('visits', { error: { message: 'permission denied for table visits' } })
    await expect(
      api.setAppointmentStatus({ appointment: APPOINTMENT, status: 'in_chair', staffId: 's-1' }),
    ).rejects.toThrow(/starting the visit/i)
    expect(sb.current!.query('appointments')).toBeUndefined()
  })

  it.each([
    ['arrived', 'arrived_at'],
    ['completed', 'completed_at'],
    ['in_chair', 'seated_at'],
  ] as const)('stamps %s with %s', async (status, column) => {
    if (status === 'in_chair') sb.current!.queue('visits', { data: { id: 'v-9' } })
    sb.current!.queue('appointments', { data: APPOINTMENT })
    await api.setAppointmentStatus({ appointment: APPOINTMENT, status, staffId: 's-1' })
    expect(sb.current!.query('appointments')!.payload).toHaveProperty(column)
  })

  it('does not stamp a time for a cancellation', async () => {
    sb.current!.queue('appointments', { data: APPOINTMENT })
    await api.setAppointmentStatus({ appointment: APPOINTMENT, status: 'cancelled', staffId: 's-1' })
    expect(sb.current!.query('appointments')!.payload).toEqual({ status: 'cancelled' })
  })

  // --- Dentist list -------------------------------------------------------

  // A direct select on `staff` returned nothing for a receptionist — they
  // may read only their own row — so the role that does most of the booking
  // could not attach a booking to any dentist. The filtering now lives in
  // bookable_dentists(), which is SECURITY DEFINER and returns id and name
  // only, so fixing that does not also expose colleagues' email addresses.
  it('asks the database for the bookable dentists rather than reading staff', async () => {
    sb.current!.queueRpc('bookable_dentists', {
      data: [{ id: 'd-1', name: 'Test Dentist' }],
    })
    await expect(api.listDentists()).resolves.toEqual([{ id: 'd-1', name: 'Test Dentist' }])
    expect(sb.current!.rpcCalls.map((c) => c.name)).toEqual(['bookable_dentists'])
    expect(sb.current!.query('staff')).toBeUndefined()
  })

  it('treats no bookable dentists as an empty list, not a crash', async () => {
    sb.current!.queueRpc('bookable_dentists', { data: null })
    await expect(api.listDentists()).resolves.toEqual([])
  })

  // --- Recalls ------------------------------------------------------------

  it('asks only for recalls still due', async () => {
    sb.current!.queue('recalls', { data: [] })
    await api.listDueRecalls(new Date('2026-09-30T12:00:00'))
    expect(sb.current!.query('recalls')!.calls.find((c) => c.method === 'eq')?.args).toEqual([
      'status',
      'due',
    ])
  })

  // Same rule as the day sheet: the horizon is a local calendar date. Built
  // from toISOString() it is the UTC date, which in Manila (UTC+8) is the
  // previous day for every local time before 08:00 — quietly dropping a
  // day's worth of patients from the list.
  it('uses the local calendar date for the horizon, not the UTC one', async () => {
    sb.current!.queue('recalls', { data: [] })
    // 00:30 local on the 30th — still the 29th in UTC.
    await api.listDueRecalls(new Date('2026-09-30T00:30:00'))
    expect(sb.current!.query('recalls')!.arg('lte', 1)).toBe('2026-09-30')
  })

  it('stamps completion when a recall is closed off', async () => {
    sb.current!.queue('recalls', { data: null })
    await api.setRecallStatus('r-1', 'completed', 'a-1')
    expect(sb.current!.query('recalls')!.payload).toMatchObject({
      status: 'completed',
      appointment_id: 'a-1',
    })
    expect(sb.current!.query('recalls')!.payload).toHaveProperty('completed_at')
  })

  it('does not stamp completion when a recall is merely dismissed', async () => {
    sb.current!.queue('recalls', { data: null })
    await api.setRecallStatus('r-1', 'dismissed')
    expect(sb.current!.query('recalls')!.payload).toEqual({ status: 'dismissed' })
  })
})
