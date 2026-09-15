import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../auth/AuthContext'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import { createRecall, listPatientAppointments, listPatientRecalls } from './api'
import { STATUS_LABELS, STATUS_STYLES, canManageBookings } from './appointmentStatus'
import BookAppointmentForm from './BookAppointmentForm'
import type { Appointment, Recall } from './types'
import { Field, TextInput } from '../../core/components/ui/Field'
import { toLocalDateString } from '../../core/localDate'

interface RecallForm {
  reason: string
  /** YYYY-MM-DD, straight from the calendar. */
  due_on: string
}

const DEFAULT_REASON = 'Six-month check-up and cleaning'

/** The first day a recall may fall on. Local, not UTC: the clinic's evening
 *  would otherwise already be "tomorrow". */
function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toLocalDateString(d)
}

export default function PatientScheduling({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
  const [recalls, setRecalls] = useState<Recall[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<RecallForm>({
    defaultValues: { reason: DEFAULT_REASON, due_on: '' },
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
      await createRecall({
        patientId,
        dueOn: values.due_on,
        reason: values.reason.trim() || 'Check-up',
        staffId: staff.id,
      })
      reset({ reason: DEFAULT_REASON, due_on: '' })
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
        {staff && canManageBookings(staff.role) && (
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

      {booking && staff && canManageBookings(staff.role) && (
        <BookAppointmentForm
          defaultDate={toLocalDateString(new Date())}
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
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 text-sm border-t border-slate-100 pt-2"
            >
              <span className="text-slate-700">
                {new Date(a.scheduled_at).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {a.reason && <span className="text-slate-400"> · {a.reason}</span>}
              </span>
              <span
                className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[a.status]}`}
              >
                {STATUS_LABELS[a.status]}
              </span>
            </div>
          ))}

          {past.length > 0 && (
            <>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mt-2">Recent</p>
              {past.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 text-sm border-t border-slate-100 pt-2"
                >
                  <span className="text-slate-500">
                    {new Date(a.scheduled_at).toLocaleDateString()}
                    {a.reason && <span className="text-slate-400"> · {a.reason}</span>}
                  </span>
                  <span
                    className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[a.status]}`}
                  >
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
        <form noValidate onSubmit={handleSubmit(onAddRecall)} className="flex items-end gap-2 flex-wrap mt-2">
          <Field label="Set a recall" className="flex-1 min-w-[180px]">
            <TextInput {...register('reason')} />
          </Field>
          {/* A native date input: on a tablet it opens the OS calendar, the
              better touch target, and `min` greys out today and every day
              before it. The rule below catches a date typed past the
              calendar, and 0018 refuses one in the database. */}
          <Field label="Recall date" error={errors.due_on?.message}>
            <TextInput
              type="date"
              min={tomorrow()}
              {...register('due_on', {
                required: 'Choose a recall date.',
                // YYYY-MM-DD compares correctly as a string.
                validate: (v) => v >= tomorrow() || 'A recall date must be after today.',
              })}
            />
          </Field>
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
