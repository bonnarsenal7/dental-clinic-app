/** What the queue query returns for an appointment. */
export interface QueueAppointment {
  id: string
  patient_id: string
  scheduled_at: string
  status: 'pending_payment' | 'completed'
  reason: string | null
  visit_id: string | null
  completed_at: string | null
  procedures: { name: string } | null
  patients: { name: string } | null
}

/** What the queue query returns for an invoice. Void and draft are excluded
 *  by the query: neither is a bill anybody can be asked to pay. */
export interface QueueInvoice {
  id: string
  visit_id: string | null
  invoice_items: { amount: number | string }[]
  payments: { amount: number | string; paid_at: string }[]
}

/**   awaiting    finished, not paid — the bill, or nothing billed yet
 *    owing       checked out on the schedule with money still owed
 *    paid        the bill is settled                      (greyed)
 *    no_charge   nothing was billed and they have left    (greyed) */
export type QueueState = 'awaiting' | 'owing' | 'paid' | 'no_charge'

export interface PaymentQueueEntry {
  appointmentId: string
  patientId: string
  patientName: string
  /** The booked procedure, else the booking's reason. */
  treatment: string | null
  scheduledAt: string
  state: QueueState
  /** Null when nothing was billed — there is no invoice to open. */
  invoiceId: string | null
  /** What is still owed. Null when nothing was billed. */
  balance: number | null
  /** Finished on an earlier day and still unpaid. */
  carriedOver: boolean
}

const sum = (xs: { amount: number | string }[]) => xs.reduce((s, x) => s + Number(x.amount), 0)

/** The queue, as reception should see it right now.
 *
 *  **What stays, and for how long:**
 *  - awaiting / owing — until paid, **whatever day it was finished**. An
 *    unpaid bill must not drop out of sight overnight.
 *  - paid — for the day it was settled (its last payment, else checkout).
 *  - no_charge — for the day they were checked out.
 *
 *  So at the start of a day the settled entries clear and only what is still
 *  owed carries over.
 *
 *  **Paid is decided by the bill, not the appointment.** Settling the bill
 *  also checks the patient out, but if that second write failed the money is
 *  still in, and the entry must not go on asking for it.
 *
 *  Order: still to pay first, oldest first — then the settled, greyed. */
export function buildPaymentQueue(
  appointments: QueueAppointment[],
  invoices: QueueInvoice[],
  now: Date = new Date(),
): PaymentQueueEntry[] {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const today = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= start.getTime()

  // The query orders invoices newest first, so the first seen per visit wins.
  const byVisit = new Map<string, QueueInvoice>()
  for (const inv of invoices) {
    if (inv.visit_id && !byVisit.has(inv.visit_id)) byVisit.set(inv.visit_id, inv)
  }

  const entries: PaymentQueueEntry[] = []
  for (const a of appointments) {
    const invoice = a.visit_id ? byVisit.get(a.visit_id) : undefined
    const total = invoice ? sum(invoice.invoice_items) : 0
    // A bill for nothing is no bill: it cannot be paid, only checked out.
    const billed = invoice && total > 0 ? invoice : undefined
    const balance = billed ? total - sum(billed.payments) : null

    let state: QueueState
    if (!billed) state = a.status === 'completed' ? 'no_charge' : 'awaiting'
    else if (balance !== null && balance <= 0) state = 'paid'
    else state = a.status === 'completed' ? 'owing' : 'awaiting'

    if (state === 'paid') {
      const lastPayment = billed!.payments
        .map((p) => p.paid_at)
        .sort()
        .at(-1)
      if (!today(lastPayment ?? a.completed_at)) continue
    }
    if (state === 'no_charge' && !today(a.completed_at)) continue

    entries.push({
      appointmentId: a.id,
      patientId: a.patient_id,
      patientName: a.patients?.name ?? 'Unknown patient',
      treatment: a.procedures?.name ?? a.reason,
      scheduledAt: a.scheduled_at,
      state,
      invoiceId: billed?.id ?? null,
      balance,
      carriedOver: !today(a.scheduled_at),
    })
  }

  const open = (e: PaymentQueueEntry) => e.state === 'awaiting' || e.state === 'owing'
  return entries.sort(
    (x, y) => Number(open(y)) - Number(open(x)) || x.scheduledAt.localeCompare(y.scheduledAt),
  )
}
