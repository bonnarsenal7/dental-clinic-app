import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../core/components/states'
import { toMessage } from '../../core/errors'
import { isAssignedToDentist } from './api'
import PatientTabs from './PatientTabs'

/** Keeps a dentist to their own patients on every `/patients/:id/…` screen.
 *
 *  "Their own" means the patient has at least one appointment booked with
 *  them. The Patients list already shows a dentist only those; this covers
 *  the same record reached by URL, a bookmark or a link from elsewhere.
 *
 *  **A screen scope, not a security boundary.** RLS still lets a dentist read
 *  every patient — the clinic chose that deliberately, so a dentist covering
 *  for a colleague or charting a walk-in is not locked out at the database.
 *  Other roles pass straight through.
 *
 *  Nothing below renders until the check answers, so a record that is not
 *  the dentist's is never fetched by its screen or logged as viewed.
 *
 *  It also carries the patient tabs, since it is the one place that wraps
 *  every screen about one patient. They are deliberately *not* rendered
 *  above the refusal below: a dentist who may not open this record should
 *  not be handed tabs into the rest of it. */
export default function AssignedPatientRoute() {
  const { id } = useParams<{ id: string }>()
  const { staff } = useAuth()
  const dentistId = staff?.role === 'dentist' ? staff.id : null
  const key = `${dentistId}:${id}`
  const [result, setResult] = useState<{ key: string; allowed: boolean; error?: string }>()

  useEffect(() => {
    if (!dentistId || !id) return
    let cancelled = false
    isAssignedToDentist(id, dentistId)
      .then((allowed) => {
        if (!cancelled) setResult({ key, allowed })
      })
      .catch((e) => {
        if (!cancelled) setResult({ key, allowed: false, error: toMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [dentistId, id, key])

  const framed = (children: ReactNode) => (
    <div className="flex flex-col gap-4">
      {id && <PatientTabs patientId={id} />}
      {children}
    </div>
  )

  if (!dentistId) return framed(<Outlet />)
  if (!result || result.key !== key) return <LoadingState />
  if (result.error) return <ErrorState message={result.error} />
  if (!result.allowed) {
    return (
      <EmptyState
        title="This patient isn't assigned to you"
        hint="You can open the records of patients booked with you. Ask reception if this patient should be."
        action={
          <Link to="/patients" className="text-sm text-gold-700 hover:underline">
            Back to your patients
          </Link>
        }
      />
    )
  }
  return framed(<Outlet />)
}
