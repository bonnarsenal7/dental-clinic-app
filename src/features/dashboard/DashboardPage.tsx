import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import { formatMoney } from '../billing/ledger'
import { collectAlerts } from '../patients/MedicalAlerts'
import { STATUS_LABELS, STATUS_STYLES } from '../scheduling/appointmentStatus'
import { useRealtimeRefresh } from '../../core/useRealtimeRefresh'
import { getDailySummary, listDentistDay, listPaymentQueue, listTodaysPatients } from './api'
import type { DentistDayRow, TodaysPatient } from './api'
import DailyClosePanel from '../dailyClose/DailyClosePanel'
import PaymentQueue from './PaymentQueue'
import type { PaymentQueueEntry } from './paymentQueueState'
import StatTile from './StatTile'
import WeekRoster from '../roster/WeekRoster'
import type { DailySummary } from './types'

/** The rows that decide what the payment queue shows (0019 publishes them). */
const PAYMENT_QUEUE_TABLES = ['appointments', 'invoices', 'payments'] as const

export default function DashboardPage() {
  const { staff } = useAuth()
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [todays, setTodays] = useState<TodaysPatient[]>([])
  const [dentistDay, setDentistDay] = useState<DentistDayRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const isDentist = staff?.role === 'dentist'
  const staffId = staff?.id
  const isClinical = isDentist || staff?.role === 'admin'
  // The schedule and recalls refuse a dentist (App.tsx), so their tiles stay
  // plain figures rather than links that bounce straight back here.
  const scheduleLink = isDentist ? undefined : '/schedule'
  const recallsLink = isDentist ? undefined : '/recalls'
  const seesMoney = staff?.role === 'receptionist' || staff?.role === 'admin'
  // Taking payment is the front desk's, so the queue is too — every
  // receptionist sees the same list; nothing is routed to one of them.
  const seesPaymentQueue = seesMoney
  const [paymentQueue, setPaymentQueue] = useState<PaymentQueueEntry[]>([])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      // A dentist sees only the patients booked with them; everyone else
      // sees the clinic's whole day.
      if (isDentist && staffId) {
        const [s, d] = await Promise.all([getDailySummary(), listDentistDay(staffId)])
        setSummary(s)
        setDentistDay(d)
        setTodays(d)
      } else {
        const [s, t, q] = await Promise.all([
          getDailySummary(),
          listTodaysPatients(),
          seesPaymentQueue ? listPaymentQueue() : Promise.resolve([]),
        ])
        setSummary(s)
        setTodays(t)
        setPaymentQueue(q)
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }, [isDentist, staffId, seesPaymentQueue])

  // Live: a dentist finishing treatment, a payment landing, or a patient
  // checked out on another tablet refreshes the dashboard within a moment.
  // The minute poll below stays as the floor for a channel that fails.
  useRealtimeRefresh('dashboard-payment-queue', PAYMENT_QUEUE_TABLES, refresh, seesPaymentQueue)

  useEffect(() => {
    void refresh()
    // The queue and the waiting figures go stale fastest; a minute is often
    // enough that reception doesn't reach for the reload button.
    const handle = setInterval(() => void refresh(), 60_000)
    return () => clearInterval(handle)
  }, [refresh])

  // Patients due in today who carry something a clinician must know before
  // treating them. Surfaced here as well as on the chart because the useful
  // moment is while the day can still be rearranged.
  const flagged = useMemo(
    () =>
      todays
        .filter((p) => p.status !== 'cancelled' && p.status !== 'no_show')
        .map((p) => ({ patient: p, alerts: collectAlerts(p.medical) }))
        .filter((x) => x.alerts.some((a) => a.severity === 'critical')),
    [todays],
  )

  const missingHistory = useMemo(
    () => todays.filter((p) => p.status !== 'cancelled' && p.status !== 'no_show' && !p.medical),
    [todays],
  )

  if (error && !summary) return <ErrorState message={error} onRetry={() => void refresh()} />
  if (!summary) return <LoadingState label="Loading today…" />

  const n = (v: number | string) => Number(v ?? 0)
  // The dentist's own commission for the day, added up from the same rows
  // their Today's Patient table shows — no extra query, and it can only ever
  // be their own patients' invoices.
  const commissionToday = dentistDay.reduce((sum, p) => sum + p.commission, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Good day, {staff?.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {new Date(`${summary.today}T00:00:00`).toLocaleDateString([], {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        {!isDentist && (
          <Link
            to="/schedule"
            className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
          >
            Open schedule
          </Link>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {/* Above the day's numbers, not below them. A dentist opening this
          at the start of a shift needs to know who cannot be treated as
          planned before they read how many are booked — and an alert that
          sits under four stat tiles is an alert someone scrolls past. */}
      {isClinical && (flagged.length > 0 || missingHistory.length > 0) && (
        <section className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3.5" role="alert">
          <p className="text-sm font-semibold text-red-900">
            Medical alerts for today
            <span className="ml-2 font-normal text-red-700">
              {flagged.length + missingHistory.length}{' '}
              {flagged.length + missingHistory.length === 1 ? 'patient' : 'patients'}
            </span>
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {flagged.map(({ patient, alerts }) => (
              <li key={patient.appointment_id} className="text-sm text-red-900">
                <Link to={`/patients/${patient.patient_id}/chart`} className="font-semibold hover:underline">
                  {patient.name}
                </Link>
                <span className="text-red-700">
                  {' '}
                  —{' '}
                  {alerts
                    .filter((a) => a.severity === 'critical')
                    .map((a) => a.label)
                    .join('; ')}
                </span>
              </li>
            ))}
            {missingHistory.map((p) => (
              <li key={p.appointment_id} className="text-sm text-red-900">
                <Link to={`/patients/${p.patient_id}`} className="font-semibold hover:underline">
                  {p.name}
                </Link>
                <span className="text-red-700"> — no medical history on file</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* First for the front desk: the patient standing at the counter is
          the thing to act on before any figure. */}
      {seesPaymentQueue && <PaymentQueue entries={paymentQueue} onChanged={() => void refresh()} />}

      {/* High on a dentist's dashboard, below the day on reception's.
          A dentist opens this to find out when they are next in; reception
          opens it to deal with the person in front of them, and reads the
          week when they get to it. Medical alerts still come first — who
          cannot be treated as planned outranks when anyone is in. */}
      {isDentist && <WeekRoster dentistId={staffId} />}

      {/* The day, at a glance. A dentist gets what they earned in place of
          two figures about a diary they cannot open — their own commission,
          never the clinic's takings. */}
      <section className={`grid grid-cols-2 gap-3 ${isDentist ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        <StatTile
          label="In the clinic"
          value={n(summary.in_clinic)}
          hint={
            n(summary.longest_wait_minutes) > 0
              ? `longest wait ${n(summary.longest_wait_minutes)} min`
              : 'nobody waiting'
          }
          to={scheduleLink}
          tone={n(summary.longest_wait_minutes) >= 20 ? 'attention' : 'neutral'}
        />
        {!isDentist && (
          <StatTile
            label="Still to come"
            value={n(summary.still_to_come)}
            hint={`${n(summary.appointments_today)} booked today`}
            to={scheduleLink}
          />
        )}
        <StatTile
          label="Completed"
          value={n(summary.completed_today)}
          hint="treated today"
          to={scheduleLink}
        />
        {isDentist ? (
          <StatTile
            label="Commission"
            value={formatMoney(commissionToday)}
            hint="yours, from today's invoices"
          />
        ) : (
          <StatTile
            label="No-shows"
            value={n(summary.no_shows_today)}
            hint={n(summary.cancelled_today) > 0 ? `${n(summary.cancelled_today)} cancelled` : 'none today'}
            to={scheduleLink}
            tone={n(summary.no_shows_today) > 0 ? 'attention' : 'neutral'}
          />
        )}
      </section>

      {seesMoney && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Money</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Collected today"
              value={formatMoney(n(summary.collected_today))}
              hint={`cash ${formatMoney(n(summary.collected_cash))}`}
              tone={n(summary.collected_today) > 0 ? 'good' : 'neutral'}
            />
            <StatTile
              label="Billed today"
              value={formatMoney(n(summary.produced_today))}
              hint="invoiced, not necessarily paid"
            />
            <StatTile
              label="Outstanding"
              value={formatMoney(n(summary.outstanding_total))}
              hint={`${n(summary.patients_owing)} ${n(summary.patients_owing) === 1 ? 'patient' : 'patients'} owing`}
              to="/billing"
              tone={n(summary.outstanding_total) > 0 ? 'attention' : 'neutral'}
            />
            <StatTile
              label="New patients"
              value={n(summary.new_patients_today)}
              hint="registered today"
              to="/patients"
            />
          </div>
          {/* What the drawer is reconciled against at close of business. */}
          <p className="text-xs text-slate-500">
            Cash {formatMoney(n(summary.collected_cash))} · Card {formatMoney(n(summary.collected_card))} ·
            Transfer {formatMoney(n(summary.collected_transfer))} · Other{' '}
            {formatMoney(n(summary.collected_other))}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Recalls</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Overdue"
            value={n(summary.recalls_overdue)}
            hint="patients past due to come back"
            to={recallsLink}
            tone={n(summary.recalls_overdue) > 0 ? 'attention' : 'neutral'}
          />
          <StatTile
            label="Due within 30 days"
            value={n(summary.recalls_due_soon)}
            hint="worth booking now"
            to={recallsLink}
          />
        </div>
      </section>

      {isDentist ? (
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Today's Patient</h2>
          {dentistDay.length === 0 ? (
            <p className="text-sm text-slate-400">Nobody booked with you today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left py-2 pr-3">Time</th>
                    <th className="text-left py-2 pr-3">Patient Name</th>
                    <th className="text-left py-2 pr-3">Treatment</th>
                    <th className="text-right py-2 pr-3">Amount</th>
                    <th className="text-right py-2">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {dentistDay.map((p) => (
                    <tr key={p.appointment_id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 tabular-nums text-slate-500">
                        {new Date(p.scheduled_at).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 pr-3 text-slate-700">
                        <Link to={`/patients/${p.patient_id}`} className="hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{p.treatment ?? '—'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                        {p.amount === null ? '—' : formatMoney(p.amount)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-slate-700">
                        {formatMoney(p.commission)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Today's list</h2>
          {todays.length === 0 && <p className="text-sm text-slate-400">Nothing booked today.</p>}
          {todays.map((p) => (
            <div
              key={p.appointment_id}
              className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-2"
            >
              <span className="text-sm text-slate-700">
                <span className="tabular-nums text-slate-500">
                  {new Date(p.scheduled_at).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>{' '}
                <Link to={`/patients/${p.patient_id}`} className="hover:underline">
                  {p.name}
                </Link>
                {p.reason && <span className="text-slate-400"> · {p.reason}</span>}
              </span>
              <span
                className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[p.status]}`}
              >
                {STATUS_LABELS[p.status]}
              </span>
            </div>
          ))}
        </section>
      )}

      {!isDentist && <WeekRoster />}

      {/* Below everything else: closing the day is the last thing the front
          desk does, and its button should not sit anywhere a tap meant for
          the queue could land. */}
      {seesMoney && staff && <DailyClosePanel staff={staff} />}
    </div>
  )
}
