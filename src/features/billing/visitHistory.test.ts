import { describe, expect, it } from 'vitest'
import { buildVisitHistory, invoicesByVisit, isVisitOpen } from './visitHistory'
import type { HistoryVisit } from './visitHistory'
import type { InvoiceWithDetail } from './types'

function visit(id: string, visit_date: string, notes: string | null = null): HistoryVisit {
  return { id, visit_date, created_at: `${visit_date}T08:00:00Z`, visit_notes: notes ? { notes } : null }
}

function invoice(
  id: string,
  visitId: string,
  opts: {
    status?: InvoiceWithDetail['status']
    lines?: [string, number, number?][]
    payments?: number[]
    created_at?: string
  } = {},
): InvoiceWithDetail {
  const lines = opts.lines ?? [['Composite filling', 1800]]
  return {
    id,
    patient_id: 'p-1',
    visit_id: visitId,
    status: opts.status ?? 'unpaid',
    total_amount: lines.reduce((s, [, a]) => s + a, 0),
    commission_amount: 0,
    created_by: null,
    created_at: opts.created_at ?? '2026-09-01T00:00:00Z',
    invoice_items: lines.map(([description, amount, tooth], i) => ({
      id: `${id}-line-${i}`,
      invoice_id: id,
      description,
      amount,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: tooth ?? null,
      created_at: '2026-09-01T00:00:00Z',
    })),
    payments: (opts.payments ?? []).map((amount, i) => ({
      id: `${id}-pay-${i}`,
      invoice_id: id,
      amount,
      method: 'cash',
      reference: null,
      received_by: null,
      paid_at: '2026-09-01T00:00:00Z',
    })),
  }
}

describe('buildVisitHistory', () => {
  it('lists visits newest first', () => {
    const rows = buildVisitHistory(
      [visit('old', '2026-01-10'), visit('new', '2026-09-10'), visit('mid', '2026-05-10')],
      [],
    )
    expect(rows.map((r) => r.visitId)).toEqual(['new', 'mid', 'old'])
  })

  it('takes Amount from the lines, Paid from the payments, and Balance as the difference', () => {
    const [row] = buildVisitHistory(
      [visit('v-1', '2026-09-10')],
      [
        invoice('inv-1', 'v-1', {
          lines: [
            ['Filling', 1800],
            ['Cleaning', 1200],
          ],
          payments: [1000, 500],
        }),
      ],
    )
    expect(row).toMatchObject({ amount: 3000, paid: 1500, balance: 1500 })
  })

  // PostgREST returns numeric as a string often enough that naive addition
  // would concatenate "1800" and "1200" into a fee nobody charged.
  it('coerces numeric strings rather than concatenating them', () => {
    const inv = invoice('inv-1', 'v-1', {
      lines: [
        ['Filling', 1800],
        ['Cleaning', 1200],
      ],
      payments: [500],
    })
    inv.invoice_items.forEach((l) => (l.amount = String(l.amount) as unknown as number))
    inv.payments.forEach((p) => (p.amount = String(p.amount) as unknown as number))
    const [row] = buildVisitHistory([visit('v-1', '2026-09-10')], [inv])
    expect(row).toMatchObject({ amount: 3000, paid: 500, balance: 2500 })
  })

  it('names every procedure of the visit, with the tooth', () => {
    const [row] = buildVisitHistory(
      [visit('v-1', '2026-09-10')],
      [
        invoice('inv-1', 'v-1', {
          lines: [
            ['Composite filling', 1800, 36],
            ['Oral prophylaxis', 1200],
          ],
        }),
      ],
    )
    expect(row.treatment).toBe('Composite filling (tooth 36); Oral prophylaxis')
  })

  it('leaves the money blank for a visit that was never billed, rather than showing zero owed', () => {
    const [row] = buildVisitHistory([visit('v-1', '2026-09-10', 'Consult only.')], [])
    expect(row).toMatchObject({ treatment: null, amount: null, paid: null, balance: null, invoiceId: null })
    expect(row.note).toBe('Consult only.')
  })

  // A draft is the dentist's working total, not a bill anybody can be asked
  // to pay — the same rule the chairside panel and reception already follow.
  it('does not present a draft as what is owed', () => {
    const [row] = buildVisitHistory(
      [visit('v-1', '2026-09-10')],
      [invoice('inv-1', 'v-1', { status: 'draft' })],
    )
    expect(row).toMatchObject({ invoiceStatus: 'draft', amount: null, balance: null })
    expect(row.treatment).toBe('Composite filling')
  })

  it('shows a voided bill as voided, owing nothing', () => {
    const [row] = buildVisitHistory(
      [visit('v-1', '2026-09-10')],
      [invoice('inv-1', 'v-1', { status: 'void' })],
    )
    expect(row).toMatchObject({ invoiceStatus: 'void', amount: null, balance: null })
  })
})

describe('invoicesByVisit', () => {
  it('prefers the bill that stands over a newer voided one', () => {
    const byVisit = invoicesByVisit([
      invoice('voided', 'v-1', { status: 'void', created_at: '2026-09-02T00:00:00Z' }),
      invoice('live', 'v-1', { created_at: '2026-09-01T00:00:00Z' }),
    ])
    expect(byVisit['v-1'].id).toBe('live')
  })
})

describe('isVisitOpen', () => {
  const now = new Date('2026-09-15T10:00:00')

  it("is open for today's visit with no bill yet", () => {
    expect(isVisitOpen('2026-09-15', null, now)).toBe(true)
  })

  it('is closed for an unbilled visit from another day', () => {
    expect(isVisitOpen('2026-03-01', null, now)).toBe(false)
  })

  it('stays open while the bill is a draft, whatever the date', () => {
    expect(isVisitOpen('2026-03-01', invoice('inv-1', 'v-1', { status: 'draft' }), now)).toBe(true)
  })

  it('closes once the bill has left draft', () => {
    expect(isVisitOpen('2026-09-15', invoice('inv-1', 'v-1', { status: 'unpaid' }), now)).toBe(false)
  })
})
