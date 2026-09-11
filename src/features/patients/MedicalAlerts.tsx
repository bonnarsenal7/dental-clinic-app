import { CONDITION_ALERTS, MEDICAL_CONDITIONS } from './historyOptions'
import type { AlertSeverity } from './historyOptions'
import type { MedicalHistory } from './types'

interface Alert {
  severity: AlertSeverity
  label: string
  why?: string
}

const CONDITION_LABELS = new Map(MEDICAL_CONDITIONS.map((c) => [c.key, c.label]))

/** Everything about this patient that should change what happens next,
 *  worst first. Allergies lead: they're the ones that turn a routine
 *  injection into an emergency. */
export function collectAlerts(medical: MedicalHistory | null): Alert[] {
  if (!medical) return []
  const alerts: Alert[] = []

  if (medical.allergic_to_anesthesia) {
    alerts.push({
      severity: 'critical',
      label: 'Allergic to anaesthesia',
      why: 'confirm agent before injecting',
    })
  }
  if (medical.allergic_to_food_or_drug) {
    alerts.push({
      severity: 'critical',
      label: `Allergy: ${medical.allergy_details?.trim() || 'unspecified — ask the patient'}`,
    })
  }

  for (const [key, meta] of Object.entries(CONDITION_ALERTS)) {
    if (medical.conditions?.[key]) {
      alerts.push({
        severity: meta.severity,
        label: CONDITION_LABELS.get(key) ?? key,
        why: meta.why,
      })
    }
  }

  if (medical.current_medications) {
    alerts.push({
      severity: 'notable',
      label: `Taking: ${medical.medication_details?.trim() || 'unspecified — ask the patient'}`,
      why: 'check for anticoagulants and interactions',
    })
  }
  if (medical.under_physician_care) {
    alerts.push({
      severity: 'notable',
      label: medical.physician_name ? `Under care of ${medical.physician_name}` : 'Under a physician’s care',
    })
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
}

/** Shown wherever a clinician is about to treat someone.
 *
 *  The empty case is deliberately not empty. A missing banner is ambiguous —
 *  it could mean "nothing to worry about" or "the history never loaded" —
 *  and a dentist should not have to guess which. Saying so explicitly is the
 *  difference between checked and merely absent. */
export default function MedicalAlerts({
  medical,
  loading = false,
}: {
  medical: MedicalHistory | null
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-400">
        Checking medical history…
      </div>
    )
  }

  if (!medical) {
    return (
      <div
        className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="alert"
      >
        <strong className="font-semibold">No medical history on file.</strong> Take one before treating this
        patient.
      </div>
    )
  }

  const alerts = collectAlerts(medical)

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <strong className="font-semibold">No medical alerts.</strong> History reviewed — no allergies, flagged
        conditions, or medications recorded.
      </div>
    )
  }

  const critical = alerts.filter((a) => a.severity === 'critical')
  const notable = alerts.filter((a) => a.severity === 'notable')

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        critical.length > 0 ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
      }`}
      role="alert"
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${critical.length > 0 ? 'text-red-800' : 'text-amber-800'}`}
      >
        {critical.length > 0 ? 'Medical alert' : 'Medical notes'}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {critical.map((a) => (
          <li key={a.label} className="text-sm text-red-900">
            <span className="font-semibold">{a.label}</span>
            {a.why && <span className="text-red-700"> — {a.why}</span>}
          </li>
        ))}
        {notable.map((a) => (
          <li key={a.label} className="text-sm text-amber-900">
            {a.label}
            {a.why && <span className="text-amber-700"> — {a.why}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
