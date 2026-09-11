import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import { formatMoney } from '../billing/ledger'
import { collectAlerts } from '../patients/MedicalAlerts'
import { STATUS_LABELS, STATUS_STYLES } from '../scheduling/appointmentStatus'
import { getDailySummary, listTodaysPatients } from './api'
import type { TodaysPatient } from './api'
import StatTile from './StatTile'
import type { DailySummary } from './types'

export default function DashboardPage() {
  const { staff } = useAuth()
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [todays, setTodays] = useState<TodaysPatient[]>([])
  const [error, setError] = useState<string | null>(null)

  const isClinical = staff?.role === 'dentist' || staff?.role === 'admin'
  const seesMoney = staff?.role === 'receptionist' || staff?.role === 'admin'

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [s, t] = await Promise.all([getDailySummary(), listTodaysPatients()])
      setSummary(s)
      setTodays(t)
    } catch (e) {
      setError(toMessage(e))
    }
  }, [])

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Good day, {staff?.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {new Date(`${summary.today}T00:00:00`).toLocaleDateString([], {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        </div>
        <Link
          to="/schedule"
          className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
        >
          Open schedule
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {/* The day, at a glance. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="In the clinic"
          value={n(summary.in_clinic)}
          hint={n(summary.longest_wait_minutes) > 0 ? `longest wait ${n(summary.longest_wait_minutes)} min` : 'nobody waiting'}
          to="/schedule"
          tone={n(summary.longest_wait_minutes) >= 20 ? 'attention' : 'neutral'}
        />
        <StatTile label="Still to come" value={n(summary.still_to_come)} hint={`${n(summary.appointments_today)} booked today`} to="/schedule" />
        <StatTile label="Completed" value={n(summary.completed_today)} hint="treated today" to="/schedule" />
        <StatTile
          label="No-shows"
          value={n(summary.no_shows_today)}
          hint={n(summary.cancelled_today) > 0 ? `${n(summary.cancelled_today)} cancelled` : 'none today'}
          to="/schedule"
          tone={n(summary.no_shows_today) > 0 ? 'attention' : 'neutral'}
        />
      </section>

      {/* Clinical safety first, before the money. */}
      {isClinical && (flagged.length > 0 || missingHistory.length > 0) && (
        <section className="rounded-xl border border-red-300 bg-red-50 px-4 py-3" role="alert">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
            Medical alerts for today
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {flagged.map(({ patient, alerts }) => (
              <li key={patient.appointment_id} className="text-sm text-red-900">
                <Link to={`/patients/${patient.patient_id}/chart`} className="font-semibold hover:underline">
                  {patient.name}
                </Link>
                <span className="text-red-700">
                  {' '}— {alerts.filter((a) => a.severity === 'critical').map((a) => a.label).join('; ')}
                </span>
              </li>
            ))}
            {missingHistory.map((p) => (
              <li key={p.appointment_id} className="text-sm text-red-900">
                <Link to={`/patients/${p.patient_id}`} className="font-semibold hover:underline">{p.name}</Link>
                <span className="text-red-700"> — no medical history on file</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            <StatTile label="New patients" value={n(summary.new_patients_today)} hint="registered today" to="/patients" />
          </div>
          {/* What the drawer is reconciled against at close of business. */}
          <p className="text-xs text-slate-500">
            Cash {formatMoney(n(summary.collected_cash))} · Card {formatMoney(n(summary.collected_card))} ·
            Transfer {formatMoney(n(summary.collected_transfer))} · Other {formatMoney(n(summary.collected_other))}
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
            to="/recalls"
            tone={n(summary.recalls_overdue) > 0 ? 'attention' : 'neutral'}
          />
          <StatTile label="Due within 30 days" value={n(summary.recalls_due_soon)} hint="worth booking now" to="/recalls" />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Today's list</h2>
        {todays.length === 0 && <p className="text-sm text-slate-400">Nothing booked today.</p>}
        {todays.map((p) => (
          <div key={p.appointment_id} className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-2">
            <span className="text-sm text-slate-700">
              <span className="tabular-nums text-slate-500">
                {new Date(p.scheduled_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>{' '}
              <Link to={`/patients/${p.patient_id}`} className="hover:underline">{p.name}</Link>
              {p.reason && <span className="text-slate-400"> · {p.reason}</span>}
            </span>
            <span className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[p.status]}`}>
              {STATUS_LABELS[p.status]}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}
