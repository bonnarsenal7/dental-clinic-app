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

describe('admin api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // Creating, deactivating and restoring all need the service-role key,
  // which must never reach the browser — so all three go through the Edge
  // Function, which verifies the caller is an active admin first.
  it.each([
    ['createStaff', () => api.createStaff({ name: 'X', email: 'x@x.com', role: 'dentist' }), 'create'],
    ['deactivateStaff', () => api.deactivateStaff('s-2'), 'deactivate'],
    ['reactivateStaff', () => api.reactivateStaff('s-2'), 'reactivate'],
  ])('%s goes through the manage-staff function', async (_name, call, action) => {
    db().setInvokeResult({ data: { ok: true, staffId: 'n', tempPassword: 'p', note: 'n' } })
    await call()
    expect(db().invoked).toHaveLength(1)
    expect(db().invoked[0].name).toBe('manage-staff')
    expect(db().invoked[0].body).toMatchObject({ action })
    // Never a direct table write: flipping staff.active from the browser
    // leaves an account that reads as active and still cannot sign in.
    expect(db().queries).toHaveLength(0)
  })

  it('surfaces a refusal from the edge function instead of swallowing it', async () => {
    db().setInvokeResult({ error: { message: 'Admin role required' } })
    await expect(api.deactivateStaff('s-2')).rejects.toThrow(/admin role required/i)
  })

  it('lists staff oldest first, so the founding admin stays at the top', async () => {
    db().queue('staff', { data: [] })
    await api.listStaff()
    expect(db().query('staff')!.arg('order', 1)).toEqual({ ascending: true })
  })
})
