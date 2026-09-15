import { invoicePaid, invoiceTotal } from './ledger'
import type { InvoiceStatus, InvoiceWithDetail } from './types'

/** The parts of a visit the history needs. Structural, so this module does
 *  not have to know the patients feature's types. */
export interface HistoryVisit {
  id: string
  visit_date: string
  created_at: string
  visit_notes: { notes: string } | null
}

/** One row of the profile's Visit History table.
 *
 *  **One row per visit, not per procedure.** Payments are recorded against
 *  a whole invoice, never a line, so a per-procedure Paid or Balance does not
 *  exist to show. The visit's procedures share its Treatment cell instead. */
export interface VisitHistoryRow {
  visitId: string
  visitDate: string
  /** The invoice's lines, joined. Null when nothing was billed. */
  treatment: string | null
  /** Null when nothing was billed, the bill was voided, or it is still a
   *  draft — a total that may still move is not shown as what is owed. */
  amount: number | null
  paid: number | null
  /** Amount − Paid. Null wherever Amount is. */
  balance: number | null
  invoiceId: string | null
  invoiceStatus: InvoiceStatus | null
  note: string | null
}

/** The invoice that speaks for each visit: the newest live one, else the
 *  newest voided one. A void is kept only so the row can say it was voided;
 *  it never outranks a bill that stands. */
export function invoicesByVisit(invoices: InvoiceWithDetail[]): Record<string, InvoiceWithDetail> {
  const byVisit: Record<string, InvoiceWithDetail> = {}
  const newestFirst = [...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const invoice of newestFirst) {
    if (!invoice.visit_id) continue
    const current = byVisit[invoice.visit_id]
    if (!current || (current.status === 'void' && invoice.status !== 'void')) {
      byVisit[invoice.visit_id] = invoice
    }
  }
  return byVisit
}

/** Whether a visit may still be billed chairside: its bill is a draft, or it
 *  is today's and has no bill yet. Line entry on a visit from six months ago
 *  would create a draft nothing can finish — "finish treatment" only exists
 *  while an appointment is in the chair. */
export function isVisitOpen(
  visitDate: string,
  invoice: InvoiceWithDetail | null,
  now: Date = new Date(),
): boolean {
  if (invoice) return invoice.status === 'draft'
  return new Date(visitDate).toDateString() === now.toDateString()
}

/** The Visit History rows, newest visit first. */
export function buildVisitHistory(visits: HistoryVisit[], invoices: InvoiceWithDetail[]): VisitHistoryRow[] {
  const byVisit = invoicesByVisit(invoices)

  return [...visits]
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.created_at.localeCompare(a.created_at))
    .map((visit) => {
      const invoice = byVisit[visit.id] ?? null
      const billed = invoice && invoice.status !== 'void' && invoice.status !== 'draft' ? invoice : null
      const amount = billed ? invoiceTotal(billed) : null
      const paid = billed ? invoicePaid(billed) : null
      const lines = invoice?.invoice_items ?? []

      return {
        visitId: visit.id,
        visitDate: visit.visit_date,
        treatment:
          lines.length > 0
            ? lines
                .map((l) => (l.tooth_number ? `${l.description} (tooth ${l.tooth_number})` : l.description))
                .join('; ')
            : null,
        amount,
        paid,
        balance: amount === null || paid === null ? null : amount - paid,
        invoiceId: invoice?.id ?? null,
        invoiceStatus: invoice?.status ?? null,
        note: visit.visit_notes?.notes?.trim() ? visit.visit_notes.notes : null,
      }
    })
}
