import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listVisits } from './api'
import { listInvoices } from '../billing/api'
import ChairsideBilling from '../billing/ChairsideBilling'
import { buildVisitHistory, invoicesByVisit, isVisitOpen } from '../billing/visitHistory'
import type { InvoiceWithDetail } from '../billing/types'
import FinishTreatmentButton from '../scheduling/FinishTreatmentButton'
import VisitHistoryTable from './VisitHistoryTable'
import type { VisitWithNote } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'

/** The visit on now, and every visit before it.
 *
 *  Two sections. **Current visit** is the dentist's chairside workspace —
 *  the note, the lines, Add to bill and Finish treatment — for any visit
 *  still open. **Visit History** is the table of every visit and what it
 *  came to. They used to be one list with a billing panel under each visit;
 *  the table has no room for a workspace, so the workspace sits above it. */
export default function VisitTimeline({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [visits, setVisits] = useState<VisitWithNote[] | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)

  // Stable, and that is load-bearing. ChairsideBilling reports its total
  // from an effect that depends on this callback, and that report refreshes
  // this component. A callback recreated on every render re-ran the effect
  // on every render, which refreshed, which re-rendered — a refetch loop for
  // as long as a visit was open.
  const refresh = useCallback(async () => {
    // Fetched separately on purpose. The visit history is the clinical
    // record and has to render whether or not billing loads — tying them
    // together with Promise.all meant one failed invoice query hid every
    // note the dentist had written.
    try {
      setVisits(await listVisits(patientId))
      setError(null)
    } catch (e) {
      setError(toMessage(e))
    }

    try {
      setInvoices(await listInvoices(patientId))
      setBillingError(null)
    } catch (e) {
      setInvoices(null)
      setBillingError(toMessage(e))
    }
  }, [patientId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byVisit = useMemo(() => invoicesByVisit(invoices ?? []), [invoices])
  const rows = useMemo(() => (visits ? buildVisitHistory(visits, invoices ?? []) : []), [visits, invoices])

  const canBill = staff?.role === 'dentist' || staff?.role === 'admin'
  // Only once billing has loaded. Without it an existing draft reads as "no
  // invoice", and the panel would offer entry against a bill it cannot see.
  const openVisits =
    staff && canBill && visits && invoices
      ? visits.filter((v) => isVisitOpen(v.visit_date, byVisit[v.id] ?? null))
      : []

  return (
    <>
      {staff &&
        openVisits.map((v) => (
          <ChairsideBilling
            key={v.id}
            patientId={patientId}
            visitId={v.id}
            staffId={staff.id}
            onTotalChange={refresh}
            finishAction={
              <FinishTreatmentButton
                visitId={v.id}
                staffId={staff.id}
                role={staff.role}
                onFinished={refresh}
              />
            }
          />
        ))}

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Visit History</h2>
        {error && <ErrorState message={error} onRetry={() => void refresh()} />}
        {visits === null && !error && <LoadingState />}
        {visits && (
          <VisitHistoryTable
            rows={rows}
            canTakePayment={staff?.role === 'receptionist' || staff?.role === 'admin'}
            billingError={billingError}
          />
        )}
      </section>
    </>
  )
}
