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

describe('roster api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // Through the function, not a select: reception and dentists cannot read
  // `staff`, so a plain select would come back with ids and no names.
  it('reads the roster through roster_for_range, with the range asked for', async () => {
    db().queueRpc('roster_for_range', { data: [{ id: 's-1', dentist_name: 'Dr. Santos' }] })
    const shifts = await api.listRoster('2026-09-21', '2026-09-27')
    expect(db().rpcCalls).toEqual([
      { name: 'roster_for_range', args: { p_from: '2026-09-21', p_to: '2026-09-27' } },
    ])
    expect(shifts).toHaveLength(1)
  })

  // The guard trigger sets both (0025). A client that sent them would be
  // claiming somebody else recorded the shift.
  it('adds a shift without sending an author or a timestamp', async () => {
    db().queue('dentist_shifts', { data: null })
    await api.addShift({
      dentist_id: 'd-1',
      shift_date: '2026-09-21',
      starts_at: '08:00',
      ends_at: '12:30',
      note: null,
    })
    expect(db().query('dentist_shifts')!.payload).toEqual({
      dentist_id: 'd-1',
      shift_date: '2026-09-21',
      starts_at: '08:00',
      ends_at: '12:30',
      note: null,
    })
  })

  it('removes one shift by id', async () => {
    db().queue('dentist_shifts', { data: null })
    await api.removeShift('s-1')
    expect(db().methods('dentist_shifts')).toEqual(['delete', 'eq'])
    expect(db().query('dentist_shifts')!.arg('eq', 1)).toBe('s-1')
  })

  // The rule is in Postgres, so the refusal arrives as a constraint name.
  // An admin cannot act on "dentist_shifts_no_overlap".
  it('says what an overlapping shift means', async () => {
    db().queue('dentist_shifts', {
      error: { message: 'conflicting key value violates exclusion constraint "dentist_shifts_no_overlap"' },
    })
    await expect(
      api.addShift({
        dentist_id: 'd-1',
        shift_date: '2026-09-21',
        starts_at: '08:00',
        ends_at: '12:30',
        note: null,
      }),
    ).rejects.toThrow(/already rostered for part of those hours/i)
  })

  it('leaves an error it does not recognise in its own words', async () => {
    db().queue('dentist_shifts', { error: { message: 'new row violates row-level security policy' } })
    await expect(api.removeShift('s-1')).rejects.toThrow(/row-level security/i)
  })
})
