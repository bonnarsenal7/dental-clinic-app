import { Link } from 'react-router-dom'
import type { StaffRole } from '../auth/types'
import ChairsideBilling from './ChairsideBilling'
import { formatMoney, invoiceBalance, invoicePaid, invoiceTotal } from './ledger'
import type { InvoiceWithDetail } from './types'

const STATUS_WORDING: Record<string, string> = {
  draft: 'Still being added to',
  unpaid: 'Awaiting payment',
  partial: 'Part paid',
  paid: 'Paid',
  void: 'Voided',
}

/** What one visit cost, inside the patient's own history.
 *
 *  Billing lives here rather than with the chart because the history is
 *  where a visit is read about afterwards — what was done, what was written
 *  down, what it came to. The chart records findings; it is not a record of
 *  what anybody was charged.
 *
 *  The panel shows one of three things, and which one is decided by the
 *  invoice rather than by the role:
 *
 *    no invoice, visit still open  the dentist's line-item entry
 *    a draft                       the same, still editable
 *    anything else                 the bill, read-only, with what is owed
 *
 *  Role only decides who may act: 0013 lets a dentist edit a draft and
 *  nobody else, and reception take payment. This mirrors that so the screen
 *  does not offer a control the database will refuse.
 */
export default function VisitBilling({
  patientId,
  visitId,
  visitDate,
  invoice,
  note,
  staffId,
  role,
  onChanged,
}: {
  patientId: string
  visitId: string
  visitDate: string
  invoice: InvoiceWithDetail | null
  /** The dentist's write-up, now part of the bill rather than a section of
   *  its own. Null where none was written — plenty of visits need none. */
  note: string | null
  staffId: string
  role: StaffRole
  onChanged: () => void
}) {
  const canBill = role === 'dentist' || role === 'admin'
  const canTakePayment = role === 'receptionist' || role === 'admin'

  // A visit that is still today's is one that may still be in progress.
  // Offering line-item entry on a visit from six months ago would create a
  // draft nothing can finish — "finish treatment" only exists on an
  // appointment that is in the chair.
  const isToday = new Date(visitDate).toDateString() === new Date().toDateString()
  const stillOpen = invoice?.status === 'draft' || (!invoice && isToday)

  if (canBill && stillOpen) {
    return (
      <ChairsideBilling patientId={patientId} visitId={visitId} staffId={staffId} onTotalChange={onChanged} />
    )
  }

  // Shown whether or not there is a bill: a visit can be noted and not
  // charged for. Read-only here for everyone — including the dentist, once
  // treatment is finished — and an admin corrects it on the invoice.
  const writtenNote = note?.trim() ? (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Note for this visit</p>
      <p className="text-sm text-slate-700 whitespace-pre-line mt-1">{note}</p>
    </div>
  ) : null

  if (!invoice) {
    return (
      <>
        {writtenNote}
        <p className="text-sm text-slate-400 mt-2">Nothing billed for this visit.</p>
      </>
    )
  }

  if (invoice.status === 'draft') {
    // A draft is not a bill anybody can be asked to pay, so reception is
    // told it is not ready rather than shown a total that may still move.
    // The note is shown regardless — it is what was done, not what is owed.
    return (
      <>
        {writtenNote}
        <p className="text-sm text-slate-400 mt-2">The dentist is still adding to this visit's bill.</p>
      </>
    )
  }

  const total = invoiceTotal(invoice)
  const paid = invoicePaid(invoice)
  const balance = invoiceBalance(invoice)

  return (
    <>
      {writtenNote}
      <div className="mt-2 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Billing for this visit
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              balance > 0
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {STATUS_WORDING[invoice.status] ?? invoice.status}
          </span>
        </div>

        {/* Read-only for everyone here. The figures were fixed when treatment
          finished; an admin corrects them on the invoice itself, where the
          change is worth being deliberate about. */}
        <div className="flex flex-col divide-y divide-slate-100">
          {invoice.invoice_items.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-sm text-slate-700">
                {line.description}
                {line.tooth_number && <span className="text-slate-400"> · tooth {line.tooth_number}</span>}
              </span>
              <span className="text-sm tabular-nums text-slate-700">{formatMoney(Number(line.amount))}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-t border-slate-100">
          <span className="text-sm font-medium text-slate-700">{balance > 0 ? 'Outstanding' : 'Total'}</span>
          <span className="text-sm font-semibold tabular-nums text-slate-900">
            {formatMoney(balance > 0 ? balance : total)}
          </span>
        </div>

        {paid > 0 && balance > 0 && (
          <p className="px-3 pb-2 text-xs text-slate-400">{formatMoney(paid)} paid so far.</p>
        )}

        <div className="px-3 pb-3 pt-1 flex items-center gap-3 flex-wrap">
          <Link to={`/invoices/${invoice.id}`} className="text-xs text-slate-600 hover:underline">
            Open invoice
          </Link>
          {/* Payment is recorded on the invoice itself rather than duplicated
            here: one implementation of taking money is enough, and it is
            already where the receipt is printed from. */}
          {canTakePayment && balance > 0 && invoice.status !== 'void' && (
            <Link
              to={`/invoices/${invoice.id}`}
              className="rounded-md bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-800"
            >
              Accept payment
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
