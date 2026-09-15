import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../core/components/ui/Button'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import { formatMoney } from '../billing/ledger'
import { checkOutWithoutCharge } from '../scheduling/api'
import type { PaymentQueueEntry } from './paymentQueueState'

/** Reception's "Awaiting payment" list: who still has to pay.
 *
 *  Kept live by the dashboard's realtime subscription — no popup, sound or
 *  badge, only the list changing. Tapping an entry opens that visit's
 *  invoice, where payment and commission are entered. An entry leaves the
 *  list as soon as it is paid, or checked out with nothing billed; see
 *  buildPaymentQueue for what shows when. */
export default function PaymentQueue({
  entries,
  onChanged,
}: {
  entries: PaymentQueueEntry[]
  onChanged: () => void
}) {
  const [checkingOut, setCheckingOut] = useState<PaymentQueueEntry | null>(null)

  return (
    <section
      aria-labelledby="payment-queue-heading"
      className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="payment-queue-heading" className="text-sm font-semibold text-slate-700">
          Awaiting payment
        </h2>
        <span className="text-xs text-slate-500">
          {entries.length === 0 ? 'nobody waiting' : `${entries.length} waiting`}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">Nobody is waiting to pay.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.appointmentId}>
              <QueueRow entry={entry} onCheckOut={() => setCheckingOut(entry)} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={checkingOut !== null}
        onOpenChange={(open) => {
          if (!open) setCheckingOut(null)
        }}
        title="Check out with no charge?"
        description={`Nothing was billed for ${checkingOut?.patientName ?? 'this patient'}'s visit. Checking out completes the appointment.`}
        confirmLabel="Check out"
        onConfirm={async () => {
          if (!checkingOut) return
          await checkOutWithoutCharge(checkingOut.appointmentId)
          setCheckingOut(null)
          onChanged()
        }}
      />
    </section>
  )
}

function QueueRow({ entry, onCheckOut }: { entry: PaymentQueueEntry; onCheckOut: () => void }) {
  const time = new Date(entry.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  // A carried-over entry says which day, or it reads as today's patient.
  const day = entry.carriedOver
    ? ` · ${new Date(entry.scheduledAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`
    : ''

  const body = (
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-800">{entry.patientName}</p>
      <p className="text-xs text-slate-500">
        {entry.treatment ?? 'Treatment'} · {time}
        {day}
      </p>
    </div>
  )

  const rowClass =
    'flex items-center justify-between gap-3 flex-wrap rounded-lg border border-slate-200 bg-white px-3 py-2'

  // Nothing billed: no invoice to open, so the action is checking them out.
  if (!entry.invoiceId) {
    return (
      <div className={rowClass} data-state={entry.state}>
        {body}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">Nothing billed</span>
          <Button size="sm" variant="secondary" onClick={onCheckOut}>
            Check out
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Link
      to={`/invoices/${entry.invoiceId}`}
      data-state={entry.state}
      className={`${rowClass} hover:border-gold-500`}
    >
      {body}
      {entry.state === 'owing' ? (
        <span className="text-sm font-medium tabular-nums text-red-700">
          {formatMoney(entry.balance ?? 0)} unpaid
        </span>
      ) : (
        <span className="text-sm font-medium tabular-nums text-slate-800">
          {formatMoney(entry.balance ?? 0)} to pay
        </span>
      )}
    </Link>
  )
}
