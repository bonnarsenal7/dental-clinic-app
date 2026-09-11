import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../test/supabaseMock'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('./supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const { logPatientView } = await import('./auditView')
const db = () => sb.current!

describe('logPatientView', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // PostgreSQL has no SELECT trigger, so view logging is the one half of the
  // audit trail that comes from the client. 0006 narrowed the insert policy
  // to operation = 'view', so a write entry cannot be forged from here.
  it('records the view as an insert marked operation = view', async () => {
    db().queue('audit_log', { data: null })
    logPatientView('p-1', 's-1', 'patients')
    await Promise.resolve()

    expect(db().methods('audit_log')).toContain('insert')
    expect(db().query('audit_log')!.payload).toMatchObject({
      staff_id: 's-1',
      patient_id: 'p-1',
      table_name: 'patients',
      operation: 'view',
    })
  })

  // Fire-and-forget on purpose: failing to log a view must never stop a
  // clinician opening a record mid-appointment. The hard guarantee lives on
  // the write path, where database triggers cannot be skipped.
  it('does not throw, or return a promise a caller could await by mistake', () => {
    db().queue('audit_log', { error: { message: 'permission denied' } })
    expect(() => logPatientView('p-1', 's-1', 'patients')).not.toThrow()
    expect(logPatientView('p-1', 's-1', 'patients')).toBeUndefined()
  })

  it('warns to the console when the log is refused, rather than failing silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db().queue('audit_log', { error: { message: 'permission denied' } })
    logPatientView('p-1', 's-1', 'patients')
    await Promise.resolve()
    await Promise.resolve()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/audit view log failed/i), 'permission denied')
  })

  // changed_fields holds column names, never values — storing values would
  // make the audit log a second copy of every medical history.
  it('does not carry any record content into the log', async () => {
    db().queue('audit_log', { data: null })
    logPatientView('p-1', 's-1', 'medical_histories')
    await Promise.resolve()
    expect(db().query('audit_log')!.payload).not.toHaveProperty('changed_fields')
  })
})
