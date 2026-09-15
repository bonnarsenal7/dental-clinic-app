import { useEffect, useState } from 'react'
import type { StaffRole } from '../auth/types'
import Button from '../../core/components/ui/Button'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import { toastSaved } from '../../core/components/ui/toast'
import { ErrorState } from '../../core/components/states'
import { toMessage } from '../../core/errors'
import { findDraftInvoice } from '../billing/api'
import { canRoleTransition } from './appointmentStatus'
import { findInChairAppointmentForVisit, finishTreatment, setAppointmentStatus } from './api'
import type { Appointment } from './types'

/** "Finish treatment", on the patient's own record.
 *
 *  It used to exist only on the schedule, which dentists no longer see. The
 *  database lets a dentist make exactly one move on an appointment —
 *  in_chair to pending_payment (0015) — so without this a dentist could bill
 *  a visit and never lock it, and reception could never take the money.
 *
 *  Renders nothing unless this visit's appointment is actually in the chair
 *  and the signed-in role may finish it. */
export default function FinishTreatmentButton({
  visitId,
  staffId,
  role,
  onFinished,
}: {
  visitId: string
  staffId: string
  role: StaffRole
  onFinished: () => void
}) {
  const mayFinish = canRoleTransition(role, 'in_chair', 'pending_payment')
  const [lookup, setLookup] = useState<{ visitId: string; appointment: Appointment | null; error?: string }>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!mayFinish) return
    let cancelled = false
    findInChairAppointmentForVisit(visitId)
      .then((appointment) => {
        if (!cancelled) setLookup({ visitId, appointment })
      })
      .catch((e) => {
        if (!cancelled) setLookup({ visitId, appointment: null, error: toMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [visitId, mayFinish])

  if (!mayFinish || !lookup || lookup.visitId !== visitId) return null
  if (lookup.error) return <ErrorState message={lookup.error} />
  const appointment = lookup.appointment
  if (!appointment) return null

  async function onConfirm() {
    if (!appointment) return
    const draft = await findDraftInvoice(visitId)
    if (draft) {
      await finishTreatment({ appointment, staffId, invoiceId: draft.id })
    } else {
      // Nothing billed. A dentist still moves the patient to the counter
      // rather than straight to completed: pending_payment is the one move
      // 0015 allows them, and reception checks the patient out from there.
      await setAppointmentStatus({ appointment, status: 'pending_payment', staffId })
    }
    setLookup({ visitId, appointment: null })
    toastSaved(
      'Treatment finished',
      draft ? 'The bill is locked and reception can take payment.' : 'Nothing was billed for this visit.',
    )
    onFinished()
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-slate-200 bg-white px-6 py-4">
      <p className="text-sm text-slate-600">
        This patient is in the chair. Finishing sends them to reception.
      </p>
      <Button onClick={() => setOpen(true)}>Finish treatment</Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Finish treatment?"
        description="The bill and the note for this visit lock once you finish. Only an admin can change them afterwards."
        confirmLabel="Finish treatment"
        onConfirm={onConfirm}
      />
    </div>
  )
}
