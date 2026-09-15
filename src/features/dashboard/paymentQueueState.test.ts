import { describe, expect, it } from 'vitest'
import { buildPaymentQueue } from './paymentQueueState'
import type { QueueAppointment, QueueInvoice } from './paymentQueueState'

// Tests run in Asia/Manila (npm test sets TZ), so these are clinic-local times.
const NOW = new Date('2026-09-15T15:00:00')
const TODAY_9AM = new Date('2026-09-15T09:00:00').toISOString()
const TODAY_2PM = new Date('2026-09-15T14:00:00').toISOString()
const YESTERDAY = new Date('2026-09-14T10:00:00').toISOString()

function appt(id: string, over: Partial<QueueAppointment> = {}): QueueAppointment {
  return {
    id,
    patient_id: `p-${id}`,
    scheduled_at: TODAY_9AM,
    status: 'pending_payment',
    reason: 'Cleaning',
    visit_id: `v-${id}`,
    completed_at: null,
    procedures: null,
    patients: { name: `Patient ${id}` },
    ...over,
  }
}

function bill(visitId: string, total: number, payments: [number, string][] = []): QueueInvoice {
  return {
    id: `inv-${visitId}`,
    visit_id: visitId,
    invoice_items: [{ amount: total }],
    payments: payments.map(([amount, paid_at]) => ({ amount, paid_at })),
  }
}

describe('buildPaymentQueue', () => {
  it('lists a finished treatment as awaiting payment, with what is owed', () => {
    const [e] = buildPaymentQueue([appt('a')], [bill('v-a', 1800)], NOW)
    expect(e).toMatchObject({ state: 'awaiting', invoiceId: 'inv-v-a', balance: 1800, carriedOver: false })
  })

  it('keeps a part-paid bill on the list, with what is left', () => {
    const [e] = buildPaymentQueue([appt('a')], [bill('v-a', 1800, [[500, TODAY_2PM]])], NOW)
    expect(e).toMatchObject({ state: 'awaiting', balance: 1300 })
  })

  // PostgREST returns numeric as a string often enough that naive addition
  // would concatenate.
  it('coerces numeric strings', () => {
    const inv = bill('v-a', 0)
    inv.invoice_items = [{ amount: '1000.00' }, { amount: '800.00' }]
    inv.payments = [{ amount: '500.00', paid_at: TODAY_2PM }]
    const [e] = buildPaymentQueue([appt('a')], [inv], NOW)
    expect(e.balance).toBe(1300)
  })

  // The list is who still has to pay. A settled entry leaves at once rather
  // than staying greyed for the rest of the day.
  it('removes a bill as soon as it is paid in full', () => {
    const entries = buildPaymentQueue(
      [appt('a', { status: 'completed', completed_at: TODAY_2PM })],
      [bill('v-a', 1800, [[1800, TODAY_2PM]])],
      NOW,
    )
    expect(entries).toEqual([])
  })

  // Settling also checks the patient out, but if that second write failed the
  // money is still in, and the entry must not go on asking for it.
  it('removes a paid bill even if the appointment was never checked out', () => {
    const entries = buildPaymentQueue([appt('a')], [bill('v-a', 1800, [[1800, TODAY_2PM]])], NOW)
    expect(entries).toEqual([])
  })

  it('removes a visit with nothing billed once it has been checked out', () => {
    const entries = buildPaymentQueue([appt('a', { status: 'completed', completed_at: TODAY_2PM })], [], NOW)
    expect(entries).toEqual([])
  })

  // An unpaid bill must not drop out of sight overnight.
  it('carries an unpaid bill forward to the next day, flagged', () => {
    const [e] = buildPaymentQueue([appt('a', { scheduled_at: YESTERDAY })], [bill('v-a', 1800)], NOW)
    expect(e).toMatchObject({ state: 'awaiting', carriedOver: true })
  })

  it('offers checkout for a visit with nothing billed', () => {
    const [e] = buildPaymentQueue([appt('a')], [], NOW)
    expect(e).toMatchObject({ state: 'awaiting', invoiceId: null, balance: null })
  })

  it('treats a bill for nothing as nothing billed, rather than as paid', () => {
    const [e] = buildPaymentQueue([appt('a')], [bill('v-a', 0)], NOW)
    expect(e).toMatchObject({ state: 'awaiting', invoiceId: null })
  })

  it('keeps a checkout that still owes money, as owing', () => {
    const [e] = buildPaymentQueue(
      [appt('a', { status: 'completed', completed_at: TODAY_2PM })],
      [bill('v-a', 1800, [[500, TODAY_2PM]])],
      NOW,
    )
    expect(e).toMatchObject({ state: 'owing', balance: 1300 })
  })

  it('lists who is still to pay oldest first, with the paid gone', () => {
    const entries = buildPaymentQueue(
      [
        appt('paid-early', {
          scheduled_at: new Date('2026-09-15T08:00:00').toISOString(),
          status: 'completed',
          completed_at: TODAY_2PM,
        }),
        appt('late', { scheduled_at: TODAY_2PM }),
        appt('early', { scheduled_at: TODAY_9AM }),
      ],
      [bill('v-paid-early', 900, [[900, TODAY_2PM]]), bill('v-late', 500), bill('v-early', 700)],
      NOW,
    )
    expect(entries.map((e) => e.appointmentId)).toEqual(['early', 'late'])
  })

  it('names the treatment from the booked procedure, else the reason', () => {
    const [withProcedure, withReason] = buildPaymentQueue(
      [
        appt('a', { procedures: { name: 'Composite filling' } }),
        appt('b', { scheduled_at: TODAY_2PM, reason: 'Toothache' }),
      ],
      [],
      NOW,
    )
    expect(withProcedure.treatment).toBe('Composite filling')
    expect(withReason.treatment).toBe('Toothache')
  })
})
