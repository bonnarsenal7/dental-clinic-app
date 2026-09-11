import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toMessage } from '../../core/errors'
import { EmptyState, ErrorState, LoadingState } from '../../core/components/states'
import { listDueRecalls, setRecallStatus } from './api'
import type { RecallWithPatient } from './types'
import { PageHeader } from '../../core/components/ui/Page'

const HORIZONS = [
  { label: 'Overdue now', days: 0 },
  { label: 'Next 30 days', days: 30 },
  { label: 'Next 90 days', days: 90 },
]

function daysOverdue(dueOn: string): number {
  const due = new Date(`${dueOn}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((today.getTime() - due.getTime()) / 86_400_000)
}

/** Who is due back. Recalls are how a clinic fills next month's book —
 *  without this list, a six-month cleaning only happens if the patient
 *  remembers, which mostly means it doesn't. */
export default function RecallsPage() {
  const [horizon, setHorizon] = useState(30)
  const [recalls, setRecalls] = useState<RecallWithPatient[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const through = new Date()
      through.setDate(through.getDate() + horizon)
      setRecalls(await listDueRecalls(through))
    } catch (e) {
      setError(toMessage(e))
    }
  }, [horizon])

  useEffect(() => {
    setRecalls(null)
    void refresh()
  }, [refresh])

  async function dismiss(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await setRecallStatus(id, 'dismissed')
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <PageHeader title="Recalls" description="Patients due back. Book them from here, or dismiss if they've moved on." />
        <Link
          to="/schedule"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Schedule
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      <div className="flex items-center gap-2 flex-wrap">
        {HORIZONS.map((h) => (
          <button
            key={h.days}
            type="button"
            onClick={() => setHorizon(h.days)}
            className={`rounded-lg border px-3 py-2 text-sm ${
              horizon === h.days
                ? 'border-gold-700 bg-gold-700 text-white'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>

      {recalls === null && <LoadingState label="Loading recalls…" />}

      {recalls?.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState
            title="Nobody due in this window"
            hint="Recalls are set from a patient's profile after treatment."
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {recalls?.map((recall) => {
          const overdue = daysOverdue(recall.due_on)
          return (
            <div
              key={recall.id}
              className="bg-white border border-slate-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {recall.patients ? (
                    <Link to={`/patients/${recall.patients.id}`} className="text-sm font-medium text-slate-800 hover:underline">
                      {recall.patients.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-slate-400">(patient record unavailable)</span>
                  )}
                  {overdue > 0 ? (
                    <span className="text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 bg-red-50 text-red-700 border-red-200">
                      {overdue} {overdue === 1 ? 'day' : 'days'} overdue
                    </span>
                  ) : (
                    <span className="text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 bg-slate-100 text-slate-500 border-slate-200">
                      due {new Date(`${recall.due_on}T00:00:00`).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {recall.reason}
                  {recall.patients?.cell_number ? ` · ${recall.patients.cell_number}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <Link
                  to={`/schedule?patient=${recall.patient_id}`}
                  className="rounded-md bg-gold-700 text-white text-xs font-medium px-3 py-1.5 hover:bg-gold-800"
                >
                  Book
                </Link>
                <button
                  type="button"
                  disabled={busyId === recall.id}
                  onClick={() => void dismiss(recall.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
