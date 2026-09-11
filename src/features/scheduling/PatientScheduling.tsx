import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../auth/AuthContext'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import { createRecall, listPatientAppointments, listPatientRecalls } from './api'
import { STATUS_LABELS, STATUS_STYLES } from './appointmentStatus'
import BookAppointmentForm from './BookAppointmentForm'
import type { Appointment, Recall } from './types'

interface RecallForm {
  reason: string
  interval_months: string
}

function addMonths(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function PatientScheduling({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [recalls, setRecalls] = useState<Recall[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<RecallForm>({
    defaultValues: { reason: 'Six-month check-up and cleaning', interval_months: '6' },
  })

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [a, r] = await Promise.all([listPatientAppointments(patientId), listPatientRecalls(patientId)])
      setAppointments(a)
      setRecalls(r)
    } catch (e) {
      setError(toMessage(e))
    }
  }, [patientId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function onAddRecall(values: RecallForm) {
    if (!staff) return
    setError(null)
    try {
      const months = Number(values.interval_months)
      await createRecall({
        patientId,
        dueOn: addMonths(months),
        reason: values.reason.trim() || 'Check-up',
        // A repeating hygiene interval, as opposed to a one-off follow-up.
        intervalMonths: months,
        staffId: staff.id,
      })
      reset({ reason: 'Six-month check-up and cleaning', interval_months: '6' })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  const now = Date.now()
  const upcoming = appointments?.filter((a) => new Date(a.scheduled_at).getTime() >= now) ?? []
  const past = appointments?.filter((a) => new Date(a.scheduled_at).getTime() < now).slice(0, 5) ?? []
  const openRecalls = recalls?.filter((r) => r.status === 'due' || r.status === 'scheduled') ?? []

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-700">Appointments & recalls</h2>
        {staff && (
          <button
            type="button"
            onClick={() => setBooking((b) => !b)}
            className="text-sm text-slate-600 hover:underline"
          >
            {booking ? 'Cancel' : '+ Book appointment'}
          </button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {booking && staff && (
        <BookAppointmentForm
          defaultDate={addMonths(0)}
          defaultPatientId={patientId}
          staffId={staff.id}
          onBooked={() => {
            setBooking(false)
            void refresh()
          }}
        />
      )}

      {appointments === null && <LoadingState />}

      {appointments !== null && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Upcoming</p>
          {upcoming.length === 0 && <p className="text-sm text-slate-400">Nothing booked.</p>}
          {upcoming.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-sm border-t border-slate-100 pt-2">
              <span className="text-slate-700">
                {new Date(a.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                {a.reason && <span className="text-slate-400"> · {a.reason}</span>}
              </span>
              <span className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[a.status]}`}>
                {STATUS_LABELS[a.status]}
              </span>
            </div>
          ))}

          {past.length > 0 && (
            <>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-2">Recent</p>
              {past.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm border-t border-slate-100 pt-2">
                  <span className="text-slate-500">
                    {new Date(a.scheduled_at).toLocaleDateString()}
                    {a.reason && <span className="text-slate-400"> · {a.reason}</span>}
                  </span>
                  <span className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[a.status]}`}>
                    {STATUS_LABELS[a.status]}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Recalls</p>
        {openRecalls.length === 0 && <p className="text-sm text-slate-400">No recall set.</p>}
        {openRecalls.map((r) => (
          <p key={r.id} className="text-sm text-slate-600">
            Due {new Date(`${r.due_on}T00:00:00`).toLocaleDateString()} — {r.reason}
          </p>
        ))}

        {/* Set at the end of an appointment, which is the only moment anyone
            reliably remembers to. */}
        <form onSubmit={handleSubmit(onAddRecall)} className="flex items-end gap-2 flex-wrap mt-2">
          <label className="flex flex-col gap-1 text-sm text-slate-700 flex-1 min-w-[180px]">
            Set a recall
            <input {...register('reason')} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            In months
            <input type="number" min="1" max="60" {...register('interval_months')} className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Add'}
          </button>
        </form>
      </div>
    </section>
  )
}
