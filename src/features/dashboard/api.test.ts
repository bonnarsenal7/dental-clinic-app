import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabaseMock'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const api = await import('./api')
const db = () => sb.current!

describe('dashboard api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // The arithmetic lives in the daily_dashboard view (0009), which is
  // security_invoker so a receptionist's totals respect their own policies.
  it('reads the view rather than totalling the ledger in the browser', async () => {
    db().queue('daily_dashboard', { data: { appointments_today: 4 } })
    await api.getDailySummary()
    expect(db().query('daily_dashboard')).toBeDefined()
    expect(db().queries.map((q) => q.table)).toEqual(['daily_dashboard'])
  })

  // Same rule as the day sheet: the clinic's day, not UTC's.
  it("asks for the clinic's local day", async () => {
    db().queue('appointments', { data: [] })
    await api.listTodaysPatients()
    const q = db().query('appointments')!
    const start = new Date(q.arg('gte', 1) as string)
    const end = new Date(q.arg('lt', 1) as string)
    expect(start.getHours()).toBe(0)
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  // PostgREST returns a to-one embed as an object, but a nested one can
  // arrive as an array depending on how it infers the relationship — the
  // shape the alerts panel reads must not depend on which.
  it('accepts the medical history as an object', async () => {
    db().queue('appointments', {
      data: [
        {
          id: 'a-1',
          patient_id: 'p-1',
          scheduled_at: 'x',
          status: 'booked',
          reason: null,
          patients: { name: 'Maria', medical_histories: { allergic_to_anesthesia: true } },
        },
      ],
    })
    const [row] = await api.listTodaysPatients()
    expect(row.medical).toEqual({ allergic_to_anesthesia: true })
    expect(row.name).toBe('Maria')
  })

  it('accepts the medical history as a one-element array', async () => {
    db().queue('appointments', {
      data: [
        {
          id: 'a-1',
          patient_id: 'p-1',
          scheduled_at: 'x',
          status: 'booked',
          reason: null,
          patients: { name: 'Maria', medical_histories: [{ allergic_to_anesthesia: true }] },
        },
      ],
    })
    const [row] = await api.listTodaysPatients()
    expect(row.medical).toEqual({ allergic_to_anesthesia: true })
  })

  // A patient with no history yet must not crash the dashboard — and must
  // not silently read as "no alerts", which the panel distinguishes.
  it('reports a missing history as null rather than throwing', async () => {
    db().queue('appointments', {
      data: [
        {
          id: 'a-1',
          patient_id: 'p-1',
          scheduled_at: 'x',
          status: 'booked',
          reason: null,
          patients: { name: 'Maria', medical_histories: [] },
        },
      ],
    })
    const [row] = await api.listTodaysPatients()
    expect(row.medical).toBeNull()
  })

  it('names a patient it could not resolve rather than rendering blank', async () => {
    db().queue('appointments', {
      data: [
        { id: 'a-1', patient_id: 'p-1', scheduled_at: 'x', status: 'booked', reason: null, patients: null },
      ],
    })
    const [row] = await api.listTodaysPatients()
    expect(row.name).toBe('Unknown patient')
  })
})
