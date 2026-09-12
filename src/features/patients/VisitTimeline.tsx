import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listVisits } from './api'
import { listInvoices } from '../billing/api'
import VisitBilling from '../billing/VisitBilling'
import type { InvoiceWithDetail } from '../billing/types'
import type { VisitWithNote } from './types'
import { toMessage } from '../../core/errors'

import { ErrorState, LoadingState } from '../../core/components/states'

export default function VisitTimeline({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [visits, setVisits] = useState<VisitWithNote[] | null>(null)
  // Fetched once for the patient and matched to visits here, rather than a
  // query per visit — a long history would otherwise be one round trip per
  // row over the clinic Wi-Fi.
  const [invoicesByVisit, setInvoicesByVisit] = useState<Record<string, InvoiceWithDetail>>({})
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    // Fetched separately on purpose. The visit history is the clinical
    // record and has to render whether or not billing loads — tying them
    // together with Promise.all meant one failed invoice query hid every
    // note the dentist had written.
    try {
      setVisits(await listVisits(patientId))
    } catch (e) {
      setError(toMessage(e))
    }

    try {
      const byVisit: Record<string, InvoiceWithDetail> = {}
      for (const invoice of await listInvoices(patientId)) {
        // Newest first from the API, so the first one seen for a visit wins.
        if (invoice.visit_id && !byVisit[invoice.visit_id]) byVisit[invoice.visit_id] = invoice
      }
      setInvoicesByVisit(byVisit)
    } catch {
      // Left empty: each visit then reads as not billed, which is wrong but
      // survivable, and is better than losing the clinical history behind a
      // billing error.
      setInvoicesByVisit({})
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-700">Visit history</h2>
      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-3">
        {visits === null && <LoadingState />}
        {visits?.length === 0 && <p className="text-slate-400 text-sm">No visits recorded yet.</p>}
        {visits?.map((v) => (
          <div key={v.id} className="border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-700">
              {new Date(v.visit_date).toLocaleDateString()}
            </p>
            {/* What was done and what it cost, as one unit. The note used
                to be a section of its own with its own form; it is part of
                the bill now — written chairside, locked when treatment
                finishes, and read by whoever takes the payment. */}
            {staff && (
              <VisitBilling
                patientId={patientId}
                visitId={v.id}
                visitDate={v.visit_date}
                invoice={invoicesByVisit[v.id] ?? null}
                note={v.visit_notes?.notes ?? null}
                staffId={staff.id}
                role={staff.role}
                onChanged={() => void refresh()}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
