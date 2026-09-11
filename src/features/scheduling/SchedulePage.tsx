import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { toMessage } from '../../core/errors'
import { EmptyState, ErrorState, LoadingState } from '../../core/components/states'
import { listAppointmentsForDay, setAppointmentStatus } from './api'
import { findInvoiceForVisit } from '../billing/api'
import { isInQueue, isPending } from './appointmentStatus'
import AppointmentCard from './AppointmentCard'
import BookAppointmentForm from './BookAppointmentForm'
import type { AppointmentStatus, AppointmentWithPatient } from './types'
import { PageHeader } from '../../core/components/ui/Page'

function toDateInput(d: Date) {
  // Local, not toISOString() — that would shift the clinic's evening
  // appointments onto the following day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function SchedulePage() {
  const { staff } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Arriving from the recalls list, which links to /schedule?patient=<id>.
  // Without this the Book button there dropped you on an unchanged schedule
  // with the form closed and nothing selected.
  const bookFor = searchParams.get('patient')
  const [day, setDay] = useState(() => toDateInput(new Date()))
  const [appointments, setAppointments] = useState<AppointmentWithPatient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // visit_id → invoice id, so a completed appointment shows "View invoice"
  // rather than inviting a second one. Empty until looked up.
  const [invoiceByVisit, setInvoiceByVisit] = useState<Record<string, string | null>>({})
  const [booking, setBooking] = useState(Boolean(bookFor))
  // Re-renders the waiting-time figures without refetching: a number that
  // silently goes stale is worse than no number.
  const [, setTick] = useState(0)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const list = await listAppointmentsForDay(new Date(`${day}T12:00:00`))
      setAppointments(list)

      // Only the completed ones can have been billed, so don't ask about
      // the rest.
      const visitIds = list
        .filter((a) => a.status === 'completed' && a.visit_id)
        .map((a) => a.visit_id as string)
      if (visitIds.length > 0) {
        const found = await Promise.all(
          visitIds.map(
            async (visitId) => [visitId, (await findInvoiceForVisit(visitId))?.id ?? null] as const,
          ),
        )
        setInvoiceByVisit(Object.fromEntries(found))
      } else {
        setInvoiceByVisit({})
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }, [day])

  useEffect(() => {
    setAppointments(null)
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handle = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(handle)
  }, [])

  const queue = useMemo(() => appointments?.filter((a) => isInQueue(a.status)) ?? [], [appointments])
  const upcoming = useMemo(() => appointments?.filter((a) => isPending(a.status)) ?? [], [appointments])
  const done = useMemo(
    () => appointments?.filter((a) => !isInQueue(a.status) && !isPending(a.status)) ?? [],
    [appointments],
  )

  const isToday = day === toDateInput(new Date())

  async function handleStatus(appointment: AppointmentWithPatient, status: AppointmentStatus) {
    if (!staff) return
    setBusyId(appointment.id)
    setError(null)
    try {
      await setAppointmentStatus({ appointment, status, staffId: staff.id })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  function shiftDay(days: number) {
    const d = new Date(`${day}T12:00:00`)
    d.setDate(d.getDate() + days)
    setDay(toDateInput(d))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Schedule" description="The day's bookings, and who is in the clinic right now." />
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/recalls"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Recalls
          </Link>
          <button
            type="button"
            onClick={() => setBooking((b) => !b)}
            className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
          >
            {booking ? 'Close' : '+ Book appointment'}
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {booking && staff && (
        <BookAppointmentForm
          defaultDate={day}
          staffId={staff.id}
          defaultPatientId={bookFor ?? undefined}
          onBooked={() => {
            setBooking(false)
            // Drop the parameter so a later "Book appointment" opens a blank
            // form rather than silently reusing the recalled patient.
            if (bookFor) setSearchParams({}, { replace: true })
            void refresh()
          }}
        />
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => shiftDay(-1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          ←
        </button>
        <input
          type="date"
          aria-label="Show this day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => shiftDay(1)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          →
        </button>
        {!isToday && (
          <button
            type="button"
            onClick={() => setDay(toDateInput(new Date()))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Today
          </button>
        )}
        <span className="text-sm text-slate-400 ml-auto">{appointments?.length ?? 0} booked</span>
      </section>

      {appointments === null && <LoadingState label="Loading the day…" />}

      {appointments !== null && (
        <>
          {/* The queue leads on today, because it's the only part that
              changes minute to minute and the only part someone is standing
              at the desk asking about. */}
          {isToday && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-slate-700">
                In the clinic now
                {queue.length > 0 && <span className="text-slate-400 font-normal"> · {queue.length}</span>}
              </h2>
              {queue.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl">
                  <EmptyState
                    title="Nobody waiting"
                    hint="Patients appear here once reception marks them arrived."
                  />
                </div>
              ) : (
                queue.map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    onStatusChange={handleStatus}
                    busy={busyId === a.id}
                    invoiceId={a.visit_id ? invoiceByVisit[a.visit_id] : null}
                  />
                ))
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-700">{isToday ? 'Still to come' : 'Booked'}</h2>
            {upcoming.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl">
                <EmptyState
                  title={isToday ? 'Nothing else booked today' : 'Nothing booked this day'}
                  hint="Use “Book appointment” above to add one."
                />
              </div>
            ) : (
              upcoming.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatus}
                  busy={busyId === a.id}
                  invoiceId={a.visit_id ? invoiceByVisit[a.visit_id] : null}
                />
              ))
            )}
          </section>

          {done.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-slate-700">Finished & cancelled</h2>
              {done.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appointment={a}
                  onStatusChange={handleStatus}
                  busy={busyId === a.id}
                  invoiceId={a.visit_id ? invoiceByVisit[a.visit_id] : null}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
