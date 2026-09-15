import { describe, expect, it } from 'vitest'
import { buildLedger, invoiceBalance, invoicePaid, invoiceTotal, outstandingBalance } from './ledger'
import type { InvoiceWithDetail } from './types'

let seq = 0
// `payments` and `invoice_items` are omitted from the spread before being
// re-declared: intersecting with InvoiceWithDetail's own fields would give
// `Payment[] & [number, string?][]`, which nothing can satisfy.
type InvoiceFixture = Omit<Partial<InvoiceWithDetail>, 'invoice_items' | 'payments'> & {
  items?: [number, string?][]
  payments?: [number, string?][]
}

function invoice(partial: InvoiceFixture = {}): InvoiceWithDetail {
  const id = `inv-${++seq}`
  const created = partial.created_at ?? '2026-01-01T00:00:00Z'
  return {
    id,
    patient_id: 'p1',
    visit_id: null,
    status: partial.status ?? 'unpaid',
    total_amount: 0,
    commission_amount: 0,
    created_by: null,
    created_at: created,
    invoice_items: (partial.items ?? []).map(([amount, at], i) => ({
      id: `${id}-item-${i}`,
      invoice_id: id,
      description: 'Composite filling',
      amount,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: 16,
      created_at: at ?? created,
    })),
    payments: (partial.payments ?? []).map(([amount, at], i) => ({
      id: `${id}-pay-${i}`,
      invoice_id: id,
      amount,
      method: 'cash' as const,
      reference: null,
      received_by: null,
      paid_at: at ?? created,
    })),
  }
}

describe('invoice arithmetic', () => {
  it('sums lines and payments into a balance', () => {
    const inv = invoice({ items: [[2000], [500]], payments: [[1000]] })
    expect(invoiceTotal(inv)).toBe(2500)
    expect(invoicePaid(inv)).toBe(1000)
    expect(invoiceBalance(inv)).toBe(1500)
  })

  // Postgres numeric arrives over PostgREST as a string often enough that
  // naive addition would concatenate. Number() coercion is load-bearing.
  it('coerces numeric strings rather than concatenating them', () => {
    const inv = invoice({
      items: [['2000' as unknown as number], ['500' as unknown as number]],
    })
    expect(invoiceTotal(inv)).toBe(2500)
  })

  it('treats a negative payment as a refund', () => {
    const inv = invoice({ items: [[1000]], payments: [[1000], [-400]] })
    expect(invoicePaid(inv)).toBe(600)
    expect(invoiceBalance(inv)).toBe(400)
  })
})

describe('outstandingBalance', () => {
  it('adds up what is still owed across invoices', () => {
    expect(
      outstandingBalance([
        invoice({ items: [[1000]], payments: [[1000]] }),
        invoice({ items: [[2000]], payments: [[500]] }),
      ]),
    ).toBe(1500)
  })

  // A voided invoice was never owed; counting it would overstate the debt.
  it('excludes voided invoices', () => {
    expect(
      outstandingBalance([invoice({ items: [[5000]], status: 'void' }), invoice({ items: [[1000]] })]),
    ).toBe(1000)
  })
})

describe('buildLedger', () => {
  it('runs a balance down the rows in date order', () => {
    const rows = buildLedger([
      invoice({
        items: [[2000, '2026-01-01T09:00:00Z']],
        payments: [[500, '2026-01-05T09:00:00Z']],
      }),
      invoice({ items: [[1000, '2026-01-03T09:00:00Z']] }),
    ])
    expect(rows.map((r) => r.balance)).toEqual([2000, 3000, 2500])
  })

  it('drops voided invoices entirely', () => {
    const rows = buildLedger([invoice({ items: [[5000]], status: 'void' })])
    expect(rows).toHaveLength(0)
  })

  // Charge and payment written in the same save share a timestamp. Sorting
  // the payment first would show a negative balance that never existed.
  it('orders a charge before a payment made at the same instant', () => {
    const rows = buildLedger([
      invoice({
        items: [[1000, '2026-02-01T10:00:00Z']],
        payments: [[1000, '2026-02-01T10:00:00Z']],
      }),
    ])
    expect(rows.map((r) => r.balance)).toEqual([1000, 0])
    expect(rows[0].fee).toBe(1000)
    expect(rows[1].paid).toBe(1000)
  })

  it('labels a refund as such', () => {
    const rows = buildLedger([invoice({ items: [[1000]], payments: [[-250]] })])
    expect(rows.at(-1)?.description).toContain('Refund')
  })

  it('names the tooth on a charge row', () => {
    const rows = buildLedger([invoice({ items: [[1000]] })])
    expect(rows[0].description).toContain('tooth 16')
  })
})
