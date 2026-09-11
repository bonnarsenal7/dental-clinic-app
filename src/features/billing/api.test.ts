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

describe('billing api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // --- Price list ---------------------------------------------------------

  it('hides retired procedures from the booking and invoice screens', async () => {
    db().queue('procedures', { data: [] })
    await api.listProcedures()
    expect(
      db()
        .query('procedures')!
        .calls.find((c) => c.method === 'eq')?.args,
    ).toEqual(['active', true])
  })

  it('shows retired procedures to the admin managing the price list', async () => {
    db().queue('procedures', { data: [] })
    await api.listProcedures(true)
    expect(db().methods('procedures')).not.toContain('eq')
  })

  // --- Invoices -----------------------------------------------------------

  // 0005_billing.sql derives both from the lines. Writing them from the app
  // would put two sources of truth on the same money.
  it('never writes total_amount or status — the triggers own those', async () => {
    db().queue('invoices', { data: { id: 'inv-1' } })
    db().queue('invoice_items', { data: null })
    await api.createInvoice({
      patientId: 'p-1',
      visitId: 'v-1',
      staffId: 's-1',
      lines: [
        { description: 'Filling', amount: 1200, procedure_id: null, tooth_record_id: null, tooth_number: 36 },
      ],
    })
    const payload = db().query('invoices')!.payload as Record<string, unknown>
    expect(payload).not.toHaveProperty('total_amount')
    expect(payload).not.toHaveProperty('status')
  })

  it('attaches every line to the invoice it just created', async () => {
    db().queue('invoices', { data: { id: 'inv-1' } })
    db().queue('invoice_items', { data: null })
    await api.createInvoice({
      patientId: 'p-1',
      visitId: 'v-1',
      staffId: 's-1',
      lines: [
        {
          description: 'Filling',
          amount: 1200,
          procedure_id: null,
          tooth_record_id: 't-1',
          tooth_number: 36,
        },
        {
          description: 'Crown',
          amount: 8000,
          procedure_id: 'proc-2',
          tooth_record_id: null,
          tooth_number: 11,
        },
      ],
    })
    const rows = db().query('invoice_items')!.payload as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.invoice_id === 'inv-1')).toBe(true)
    // The wording is copied onto the line, not read back through the chart:
    // a receptionist cannot see tooth_records, and an invoice must not
    // re-word itself when the chart is later re-charted.
    expect(rows[0]).toMatchObject({ description: 'Filling', tooth_number: 36 })
  })

  it('does not insert an empty line batch for an invoice with no lines', async () => {
    db().queue('invoices', { data: { id: 'inv-1' } })
    await api.createInvoice({ patientId: 'p-1', visitId: null, staffId: 's-1', lines: [] })
    expect(db().query('invoice_items')).toBeUndefined()
  })

  it('names which half failed, so a partial invoice is diagnosable', async () => {
    db().queue('invoices', { data: { id: 'inv-1' } })
    db().queue('invoice_items', { error: { message: 'duplicate key value' } })
    await expect(
      api.createInvoice({
        patientId: 'p-1',
        visitId: 'v-1',
        staffId: 's-1',
        lines: [
          { description: 'X', amount: 1, procedure_id: null, tooth_record_id: 't-1', tooth_number: 11 },
        ],
      }),
    ).rejects.toThrow(/invoice lines:/i)
  })

  // A void invoice is not an outstanding one, so it must not suppress the
  // "Create invoice" offer on a completed appointment.
  it('ignores voided invoices when asking whether a visit was billed', async () => {
    db().queue('invoices', { data: null })
    await api.findInvoiceForVisit('v-1')
    expect(
      db()
        .query('invoices')!
        .calls.find((c) => c.method === 'neq')?.args,
    ).toEqual(['status', 'void'])
  })

  it('returns null rather than throwing when a visit has no invoice', async () => {
    db().queue('invoices', { data: null })
    await expect(api.findInvoiceForVisit('v-1')).resolves.toBeNull()
  })

  // --- Payments -----------------------------------------------------------

  // Append-only per 0002_rls.sql: a correction is another row and a refund
  // is a negative amount. An update here would be refused by RLS anyway.
  it('records a payment by inserting, never updating', async () => {
    db().queue('payments', { data: null })
    await api.recordPayment({
      invoiceId: 'inv-1',
      staffId: 's-1',
      amount: 500,
      method: 'cash',
      reference: null,
    })
    expect(db().methods('payments')).toContain('insert')
    expect(db().methods('payments')).not.toContain('update')
  })

  it('accepts a negative amount, which is how a refund is recorded', async () => {
    db().queue('payments', { data: null })
    await api.recordPayment({
      invoiceId: 'inv-1',
      staffId: 's-1',
      amount: -500,
      method: 'cash',
      reference: 'refund',
    })
    expect(db().query('payments')!.payload).toMatchObject({ amount: -500 })
  })

  // --- Billable charting --------------------------------------------------

  // decayed and missing are findings; planned is future work. Billing any of
  // them would charge a patient for a diagnosis.
  it('asks only for work performed, not findings or plans', async () => {
    db().queue('tooth_records', { data: [] })
    await api.listBillableCharting('v-1')
    expect(db().query('tooth_records')!.arg('in', 1)).toEqual(['filled', 'crown'])
  })

  it('skips the billed-items lookup entirely when nothing was charted', async () => {
    db().queue('tooth_records', { data: [] })
    await expect(api.listBillableCharting('v-1')).resolves.toEqual([])
    expect(db().query('invoice_items')).toBeUndefined()
  })

  it('leaves out procedures already on an invoice', async () => {
    db().queue('tooth_records', {
      data: [
        { id: 't-1', tooth_number: 36, condition: 'filled', surface: 'occlusal', created_at: 'x' },
        { id: 't-2', tooth_number: 11, condition: 'crown', surface: null, created_at: 'y' },
      ],
    })
    db().queue('invoice_items', { data: [{ tooth_record_id: 't-1' }] })

    const out = await api.listBillableCharting('v-1')
    expect(out.map((r) => r.tooth_record_id)).toEqual(['t-2'])
  })

  it('carries the charting through under the names the builder expects', async () => {
    db().queue('tooth_records', {
      data: [{ id: 't-1', tooth_number: 36, condition: 'filled', surface: 'occlusal', created_at: 'when' }],
    })
    db().queue('invoice_items', { data: [] })
    await expect(api.listBillableCharting('v-1')).resolves.toEqual([
      {
        tooth_record_id: 't-1',
        tooth_number: 36,
        condition: 'filled',
        surface: 'occlusal',
        charted_at: 'when',
      },
    ])
  })

  // Reception has no RLS access to tooth_records, so they get an empty list
  // rather than an error — the builder hides the section for them.
  it('treats a null result as nothing charted rather than crashing', async () => {
    db().queue('tooth_records', { data: null })
    await expect(api.listBillableCharting('v-1')).resolves.toEqual([])
  })
})
