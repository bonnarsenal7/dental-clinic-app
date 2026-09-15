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

describe('daily close api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // The database decides the day and who recorded it (0020). A client that
  // sent a date could backdate an entry onto a day already closed.
  it('adds an expense without sending a date or an author', async () => {
    db().queue('daily_expenses', { data: null })
    await api.addDailyExpense({ description: 'Gloves', amount: 1200 })
    expect(db().query('daily_expenses')!.payload).toEqual({ description: 'Gloves', amount: 1200 })
  })

  it('records salary against the chosen dentist, and nothing else', async () => {
    db().queue('salary_entries', { data: null })
    await api.addSalaryEntry({ dentistId: 'd-1', description: 'Day rate', amount: 3000 })
    expect(db().query('salary_entries')!.payload).toEqual({
      dentist_id: 'd-1',
      description: 'Day rate',
      amount: 3000,
    })
  })

  it("lists one day's entries, in the order they were recorded, with numeric amounts", async () => {
    db().queue('daily_expenses', { data: [{ id: 'e-1', amount: '1200.00' }] })
    const [expense] = await api.listDailyExpenses('2026-09-15')
    const q = db().query('daily_expenses')!
    expect(q.calls).toContainEqual({ method: 'eq', args: ['business_date', '2026-09-15'] })
    expect(q.arg('order', 0)).toBe('created_at')
    expect(expense.amount).toBe(1200)
  })

  it('deletes by id', async () => {
    db().queue('salary_entries', { data: null })
    await api.deleteSalaryEntry('s-1')
    expect(db().methods('salary_entries')).toContain('delete')
    expect(db().query('salary_entries')!.calls).toContainEqual({ method: 'eq', args: ['id', 's-1'] })
  })

  // The arithmetic is in SQL; the client only reads it.
  it('reads the totals from clinic_day_totals, as numbers', async () => {
    db().queueRpc('clinic_day_totals', {
      data: [
        {
          business_date: '2026-09-15',
          revenue_total: '5000.00',
          expense_total: '1200.00',
          salary_total: '3000.00',
          commission_total: '750.00',
        },
      ],
    })
    const totals = await api.getClinicDayTotals('2026-09-15')
    expect(db().rpcCalls).toEqual([{ name: 'clinic_day_totals', args: { p_date: '2026-09-15' } }])
    expect(totals.revenue_total + totals.commission_total).toBe(5750)
  })

  // Grouped and named in SQL (0021): reception cannot read the staff table.
  it("reads the day's commission per dentist, as numbers", async () => {
    db().queueRpc('clinic_day_commission_by_dentist', {
      data: [
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: '500.00' },
        { dentist_id: null, dentist_name: null, commission_total: '250.00' },
      ],
    })
    const rows = await api.listCommissionByDentist('2026-09-15')
    expect(db().rpcCalls).toEqual([
      { name: 'clinic_day_commission_by_dentist', args: { p_date: '2026-09-15' } },
    ])
    expect(rows[0].commission_total + rows[1].commission_total).toBe(750)
    expect(rows[1]).toEqual({ dentist_id: null, dentist_name: null, commission_total: 250 })
  })

  it('closes through close_clinic_day and hands back the frozen report', async () => {
    db().queueRpc('close_clinic_day', {
      data: {
        business_date: '2026-09-15',
        closed_at: 'x',
        closed_by_name: 'Ana',
        revenue_total: '5000.00',
        expense_total: '1200.00',
        salary_total: '3000.00',
        commission_total: '750.00',
        net_total: '800.00',
        expenses: [],
        salaries: [],
      },
    })
    const report = await api.closeClinicDay()
    expect(db().rpcCalls.map((c) => c.name)).toEqual(['close_clinic_day'])
    expect(report.net_total).toBe(800)
  })

  it('reads an open day as null', async () => {
    db().queue('clinic_days', { data: null })
    expect(await api.getClinicDay('2026-09-15')).toBeNull()
  })
})
