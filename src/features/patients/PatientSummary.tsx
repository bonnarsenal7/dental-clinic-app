import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { listInvoices, listPatientVisits } from '../billing/api'
import { formatMoney, outstandingBalance } from '../billing/ledger'
import { listPatientAppointments } from '../scheduling/api'
import { isPending } from '../scheduling/appointmentStatus'
import type { Patient } from './types'

/** Age from the birthday when there is one, because the stored `age` was
 *  true on the day somebody typed it and has been drifting since. */
export function ageOf(patient: Pick<Patient, 'birthday' | 'age'>, today = new Date()): number | null {
  if (!patient.birthday) return patient.age ?? null
  const born = new Date(`${patient.birthday}T00:00:00`)
  if (Number.isNaN(born.getTime())) return patient.age ?? null
  let years = today.getFullYear() - born.getFullYear()
  const monthDiff = today.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) years -= 1
  return years >= 0 ? years : (patient.age ?? null)
}

/** undefined: still loading, or it could not be loaded. null: none. */
interface Facts {
  balance?: number
  next?: string | null
  lastVisit?: string | null
  failed: boolean
}

const shortDate = (date: string) =>
  new Date(date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

/** The three questions asked about a patient at the desk, beside the name
 *  instead of on three other screens: what they owe, when they are next in,
 *  when they were last here.
 *
 *  It fetches its own figures, and with `allSettled`, so a billing query
 *  that fails costs that one number rather than the profile — the same
 *  reasoning that keeps visits and invoices apart in VisitTimeline. */
export default function PatientSummary({ patient }: { patient: Patient }) {
  const [facts, setFacts] = useState<Facts>({ failed: false })

  useEffect(() => {
    let cancelled = false
    void Promise.allSettled([
      listInvoices(patient.id),
      listPatientAppointments(patient.id),
      listPatientVisits(patient.id),
    ]).then(([invoices, appointments, visits]) => {
      if (cancelled) return
      const upcoming =
        appointments.status === 'fulfilled'
          ? appointments.value
              // Returned newest first; the next one due is the earliest that
              // has not happened yet and has not been called off.
              .filter((a) => isPending(a.status) && new Date(a.scheduled_at) >= new Date())
              .at(-1)
          : undefined
      setFacts({
        balance: invoices.status === 'fulfilled' ? outstandingBalance(invoices.value) : undefined,
        next: appointments.status === 'fulfilled' ? (upcoming?.scheduled_at ?? null) : undefined,
        lastVisit: visits.status === 'fulfilled' ? (visits.value[0]?.visit_date ?? null) : undefined,
        failed: [invoices, appointments, visits].some((r) => r.status === 'rejected'),
      })
    })
    return () => {
      cancelled = true
    }
  }, [patient.id])

  const age = ageOf(patient)
  const owes = (facts.balance ?? 0) > 0

  return (
    <section
      aria-label="Patient summary"
      className="bg-white border border-slate-200 rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3"
    >
      <Fact label="Age" value={age === null ? '—' : `${age}`} />
      <Fact
        label="Balance"
        value={
          facts.balance === undefined ? (
            '—'
          ) : (
            <Link to={`/patients/${patient.id}/billing`} className="hover:underline">
              {formatMoney(facts.balance)}
            </Link>
          )
        }
        // Red only when money is actually owed. Nothing owed is ordinary,
        // not an achievement, so it stays neutral rather than going green.
        tone={owes ? 'attention' : 'neutral'}
      />
      <Fact
        label="Next appointment"
        value={facts.next === undefined ? '—' : facts.next ? shortDate(facts.next) : 'None booked'}
      />
      <Fact
        label="Last visit"
        value={
          facts.lastVisit === undefined ? '—' : facts.lastVisit ? shortDate(facts.lastVisit) : 'First visit'
        }
      />
      {facts.failed && (
        <p className="col-span-2 sm:col-span-4 text-xs text-slate-500">
          Some of these could not be loaded. The rest of the record is unaffected.
        </p>
      )}
    </section>
  )
}

function Fact({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  tone?: 'neutral' | 'attention'
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`text-sm mt-0.5 tabular-nums ${
          tone === 'attention' ? 'font-semibold text-red-700' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
