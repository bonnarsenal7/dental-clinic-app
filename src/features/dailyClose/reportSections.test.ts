import { describe, expect, it } from 'vitest'
import {
  buildPayByDentist,
  buildReportPayTable,
  commissionLabel,
  normaliseReport,
  pdfMoney,
} from './reportSections'
import type { ClinicDayReport } from './types'

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

describe('buildPayByDentist', () => {
  const salary = (dentist_id: string, dentist_name: string | null, amount: number | string) => ({
    dentist_id,
    dentist_name,
    amount,
  })
  const commission = (
    dentist_id: string | null,
    dentist_name: string | null,
    commission_total: number | string,
  ) => ({
    dentist_id,
    dentist_name,
    commission_total,
  })

  it("puts a dentist's salary entries and commission on one row, with their total", () => {
    const [row] = buildPayByDentist(
      [salary('d-1', 'Dr Cruz', 1500), salary('d-1', 'Dr Cruz', 1500)],
      [commission('d-1', 'Dr Cruz', 500)],
    )
    expect(row).toMatchObject({ label: 'Dr Cruz', salary: 3000, commission: 500, total: 3500 })
  })

  it('gives a row to a dentist with only salary, and to one with only commission', () => {
    const rows = buildPayByDentist([salary('d-1', 'Dr Cruz', 3000)], [commission('d-2', 'Dr Reyes', 250)])
    expect(rows).toEqual([
      expect.objectContaining({ label: 'Dr Cruz', salary: 3000, commission: 0, total: 3000 }),
      expect.objectContaining({ label: 'Dr Reyes', salary: 0, commission: 250, total: 250 }),
    ])
  })

  // So the columns still add up to the day's totals.
  it('lists commission with no dentist last, rather than dropping it', () => {
    const rows = buildPayByDentist(
      [salary('d-2', 'Dr Reyes', 3000)],
      [commission(null, null, 100), commission('d-1', 'Dr Cruz', 500)],
    )
    expect(rows.map((r) => r.label)).toEqual(['Dr Cruz', 'Dr Reyes', 'No dentist recorded'])
    expect(rows[2]).toMatchObject({ dentistId: null, salary: 0, commission: 100 })
  })

  // "Unknown" must not read as "none".
  it('leaves commission and total blank when the breakdown could not be loaded', () => {
    const [row] = buildPayByDentist([salary('d-1', 'Dr Cruz', 3000)], null)
    expect(row).toMatchObject({ salary: 3000, commission: null, total: null })
  })

  it('takes the name from whichever source knows it', () => {
    const [row] = buildPayByDentist([salary('d-9', null, 3000)], [commission('d-9', 'Dr Santos', 200)])
    expect(row.label).toBe('Dr Santos')
  })

  it('coerces numeric strings rather than concatenating them', () => {
    const [row] = buildPayByDentist(
      [salary('d-1', 'Dr Cruz', '1500.00')],
      [commission('d-1', 'Dr Cruz', '250.00')],
    )
    expect(row.total).toBe(1750)
  })
})

describe('buildReportPayTable', () => {
  const report = (extra: object = {}) =>
    normaliseReport({
      business_date: '2026-09-15',
      closed_at: '2026-09-15T10:00:00Z',
      closed_by_name: 'Ana',
      revenue_total: '9000.00',
      expense_total: '0',
      salary_total: '3000.00',
      commission_total: '850.00',
      net_total: '6000.00',
      expenses: [],
      salaries: [
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Morning', amount: '1500.00' },
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Afternoon', amount: '1500.00' },
      ],
      ...extra,
    } as unknown as ClinicDayReport)

  it("prints the dashboard's table: a row per dentist, and the column totals", () => {
    const table = buildReportPayTable(
      report({
        commission_by_dentist: [
          { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: '500.00' },
          { dentist_id: 'd-2', dentist_name: 'Dr Reyes', commission_total: '250.00' },
          { dentist_id: null, dentist_name: null, commission_total: '100.00' },
        ],
      }),
    )
    expect(table.rows).toEqual([
      { label: 'Dr Cruz', salary: 'PHP 3,000.00', commission: 'PHP 500.00', total: 'PHP 3,500.00' },
      { label: 'Dr Reyes', salary: 'PHP 0.00', commission: 'PHP 250.00', total: 'PHP 250.00' },
      { label: 'No dentist recorded', salary: 'PHP 0.00', commission: 'PHP 100.00', total: 'PHP 100.00' },
    ])
    expect(table.footer).toEqual({
      label: 'Total',
      salary: 'PHP 3,000.00',
      commission: 'PHP 850.00',
      total: 'PHP 3,850.00',
    })
    expect(table.commissionByDentistRecorded).toBe(true)
  })

  // Matches the dashboard: the per-dentist table only, no itemised entries.
  it('carries no itemised salary entries', () => {
    const table = buildReportPayTable(report({ commission_by_dentist: [] }))
    expect(Object.keys(table).sort()).toEqual(['commissionByDentistRecorded', 'footer', 'rows'])
    expect(JSON.stringify(table)).not.toContain('Morning')
  })

  // A day closed before 0022 froze no breakdown. Per-dentist commission is
  // unknown, not zero — but the column total is still the frozen figure.
  it('shows per-dentist commission as unknown on a day closed before it was frozen', () => {
    const table = buildReportPayTable(report())
    expect(table.rows).toEqual([{ label: 'Dr Cruz', salary: 'PHP 3,000.00', commission: '-', total: '-' }])
    expect(table.footer.commission).toBe('PHP 850.00')
    expect(table.commissionByDentistRecorded).toBe(false)
  })

  // jsPDF's built-in font cannot draw the peso sign or the em dash reliably.
  it('uses only characters the PDF font can draw', () => {
    const table = buildReportPayTable(report())
    const text = JSON.stringify(table)
    expect(text).not.toContain('₱')
    expect(text).not.toContain('—')
  })
})
