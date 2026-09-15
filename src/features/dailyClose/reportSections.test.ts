import { describe, expect, it } from 'vitest'
import { commissionLabel, groupSalariesByDentist, normaliseReport, pdfMoney } from './reportSections'
import type { ClinicDayReport } from './types'

describe('groupSalariesByDentist', () => {
  it('itemises salary per dentist, dentists by name, each with a subtotal', () => {
    const groups = groupSalariesByDentist([
      { dentist_id: 'd-2', dentist_name: 'Dr Reyes', description: 'Day rate', amount: 3000 },
      { dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Morning', amount: 1500 },
      { dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Afternoon', amount: '1500.00' },
    ])
    expect(groups.map((g) => g.dentistName)).toEqual(['Dr Cruz', 'Dr Reyes'])
    expect(groups[0]).toMatchObject({
      subtotal: 3000,
      entries: [{ description: 'Morning' }, { description: 'Afternoon' }],
    })
    expect(groups[1].subtotal).toBe(3000)
  })

  it('names a dentist it cannot resolve rather than leaving a blank heading', () => {
    const [group] = groupSalariesByDentist([
      { dentist_id: 'd-9', dentist_name: null, description: 'x', amount: 1 },
    ])
    expect(group.dentistName).toBe('Unknown dentist')
  })
})

describe('normaliseReport', () => {
  it('turns every figure into a number', () => {
    const report = normaliseReport({
      business_date: '2026-09-15',
      closed_at: '2026-09-15T10:00:00Z',
      closed_by_name: 'Ana',
      revenue_total: '5000.00',
      expense_total: '1200.00',
      salary_total: '3000.00',
      commission_total: '750.00',
      net_total: '800.00',
      expenses: [{ description: 'Gloves', amount: '1200.00' }],
      salaries: [{ dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Day', amount: '3000.00' }],
    } as unknown as ClinicDayReport)
    expect(report.revenue_total + report.expense_total).toBe(6200)
    expect(report.net_total).toBe(800)
    expect(report.expenses[0].amount).toBe(1200)
    expect(report.salaries[0].amount).toBe(3000)
  })
})

describe('pdfMoney', () => {
  // jsPDF's built-in fonts cannot draw the peso sign.
  it('writes PHP rather than the peso sign', () => {
    expect(pdfMoney(1234.5)).toBe('PHP 1,234.50')
    expect(pdfMoney(1234.5)).not.toContain('₱')
  })

  it('puts the sign in front of a negative net', () => {
    expect(pdfMoney(-800)).toBe('-PHP 800.00')
  })
})

describe('the per-dentist commission in a report', () => {
  const closed = (extra: object = {}) =>
    ({
      business_date: '2026-09-15',
      closed_at: '2026-09-15T10:00:00Z',
      closed_by_name: 'Ana',
      revenue_total: '5000.00',
      expense_total: '0',
      salary_total: '0',
      commission_total: '750.00',
      net_total: '5000.00',
      expenses: [],
      salaries: [],
      ...extra,
    }) as unknown as ClinicDayReport

  it("coerces each dentist's frozen commission to a number", () => {
    const report = normaliseReport(
      closed({
        commission_by_dentist: [
          { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: '500.00' },
          { dentist_id: null, dentist_name: null, commission_total: '250.00' },
        ],
      }),
    )
    const rows = report.commission_by_dentist!
    expect(rows[0].commission_total + rows[1].commission_total).toBe(750)
  })

  // A day closed before 0022 never recorded it. An empty list would read as
  // "nobody earned commission" on a day somebody did.
  it('leaves it absent on a day closed before it was frozen, rather than inventing an empty one', () => {
    const report = normaliseReport(closed())
    expect('commission_by_dentist' in report).toBe(false)
  })

  it('labels commission with no dentist, and a dentist no longer on the list', () => {
    expect(commissionLabel({ dentist_id: 'd-1', dentist_name: 'Dr Cruz' })).toBe('Dr Cruz')
    expect(commissionLabel({ dentist_id: null, dentist_name: null })).toBe('No dentist recorded')
    expect(commissionLabel({ dentist_id: 'd-9', dentist_name: null })).toBe('Former staff')
  })
})
