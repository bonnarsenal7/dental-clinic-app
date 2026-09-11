import type { InvoiceWithDetail, LedgerRow } from './types'

// The clinic is in the Philippines, so amounts are pesos.
const pesoFormat = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

export function formatMoney(amount: number): string {
  return pesoFormat.format(amount)
}

export function invoiceTotal(invoice: InvoiceWithDetail): number {
  return invoice.invoice_items.reduce((sum, item) => sum + Number(item.amount), 0)
}

export function invoicePaid(invoice: InvoiceWithDetail): number {
  return invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
}

export function invoiceBalance(invoice: InvoiceWithDetail): number {
  return invoiceTotal(invoice) - invoicePaid(invoice)
}

/** Builds the patient's treatment ledger — the digital equivalent of the
 *  clinic's paper Date / Treatment / Fee / Balance sheet.
 *
 *  Charges and payments interleave in date order with a running balance,
 *  rather than being grouped per invoice, because that is how the paper
 *  ledger reads: what was owed and what was settled, in the order it
 *  happened. Voided invoices are dropped entirely — they were never owed.
 */
export function buildLedger(invoices: InvoiceWithDetail[]): LedgerRow[] {
  interface Entry {
    date: string
    description: string
    fee: number | null
    paid: number | null
    key: string
    invoiceId: string
  }

  const entries: Entry[] = []

  for (const invoice of invoices) {
    if (invoice.status === 'void') continue

    for (const item of invoice.invoice_items) {
      entries.push({
        date: item.created_at ?? invoice.created_at,
        description: item.tooth_number
          ? `${item.description} (tooth ${item.tooth_number})`
          : item.description,
        fee: Number(item.amount),
        paid: null,
        key: `item-${item.id}`,
        invoiceId: invoice.id,
      })
    }

    for (const payment of invoice.payments) {
      const isRefund = Number(payment.amount) < 0
      entries.push({
        date: payment.paid_at,
        description: isRefund
          ? `Refund (${payment.method.replace('_', ' ')})`
          : `Payment (${payment.method.replace('_', ' ')})`,
        fee: null,
        paid: Number(payment.amount),
        key: `payment-${payment.id}`,
        invoiceId: invoice.id,
      })
    }
  }

  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime()
    // Stable within the same timestamp: charges before the payment that
    // settles them, so the balance never dips negative on a same-moment pair.
    if (diff !== 0) return diff
    if (a.fee !== null && b.fee === null) return -1
    if (a.fee === null && b.fee !== null) return 1
    return a.key.localeCompare(b.key)
  })

  let balance = 0
  return entries.map((entry) => {
    balance += (entry.fee ?? 0) - (entry.paid ?? 0)
    return { ...entry, balance }
  })
}

/** What the patient still owes across every non-void invoice. */
export function outstandingBalance(invoices: InvoiceWithDetail[]): number {
  return invoices.filter((i) => i.status !== 'void').reduce((sum, i) => sum + invoiceBalance(i), 0)
}
