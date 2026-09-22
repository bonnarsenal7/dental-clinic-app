import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logPatientView } from '../../core/auditView'
import { getDentalHistory, getMedicalHistory, getPatient, listConsents } from './api'
import ConsentCapture from './ConsentCapture'
import PatientScheduling from '../scheduling/PatientScheduling'
import VisitTimeline from './VisitTimeline'
import FileAttachments from './FileAttachments'
import { MEDICAL_CONDITIONS, DENTAL_SYMPTOMS, ORAL_HABITS } from './historyOptions'
import { SIGNER_RELATIONSHIPS, patientTypeLabel } from './types'
import type { Consent, DentalHistory, MedicalHistory, Patient } from './types'
import { toMessage } from '../../core/errors'
import { ButtonLink } from '../../core/components/ui/Button'
import MedicalAlerts from './MedicalAlerts'
import PatientSummary from './PatientSummary'
import { ErrorState, LoadingState } from '../../core/components/states'

function trueKeys(map: Record<string, boolean> | undefined, options: { key: string; label: string }[]) {
  if (!map) return []
  return options.filter((o) => map[o.key]).map((o) => o.label)
}

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { staff } = useAuth()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [medical, setMedical] = useState<MedicalHistory | null>(null)
  const [dental, setDental] = useState<DentalHistory | null>(null)
  const [consents, setConsents] = useState<Consent[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConsent, setShowConsent] = useState(false)

  async function refreshConsents(patientId: string) {
    setConsents(await listConsents(patientId))
  }

  useEffect(() => {
    if (!id || !staff) return
    logPatientView(id, staff.id, 'patients')
  }, [id, staff])

  useEffect(() => {
    if (!id) return
    Promise.all([getPatient(id), getMedicalHistory(id), getDentalHistory(id), listConsents(id)])
      .then(([p, m, d, c]) => {
        setPatient(p)
        setMedical(m)
        setDental(d)
        setConsents(c)
      })
      .catch((e) => setError(toMessage(e)))
  }, [id])

  if (error) return <ErrorState message={error} />
  if (!patient || !id) return <LoadingState />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-800">{patient.name}</h1>
            {/* Neutral: a category is not a record state (red/green) and not
                the brand (gold). Only an admin can change it, on Edit. */}
            <span className="text-xs uppercase tracking-wide border border-slate-200 bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
              {patientTypeLabel(patient.patient_type)}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {patient.cell_number ?? patient.phone_number ?? 'No contact number on file'}
          </p>
        </div>
        {/* The chart and the ledger are tabs above this, on every screen
            about the patient, so they are not repeated here. Editing is not
            a tab: it is an action on this screen. */}
        <ButtonLink to={`/patients/${id}/edit`} variant="secondary">
          Edit demographics & history
        </ButtonLink>
      </div>

      {/* Clinical first, as on the chart and the dashboard: an allergy is
          the one thing that has to be read before anybody does anything,
          and the profile is where reception checks somebody in. */}
      {/* No `loading` prop: the screen itself waits for all four fetches,
          so by the time this renders the history is settled — null here
          means none on file, which the banner says in its own words. */}
      <MedicalAlerts medical={medical} />

      <PatientSummary patient={patient} />

      {/* Ten intake fields, folded away. They are read when somebody needs
          an address or a birthday, and they were sitting between the name
          and everything about today's treatment — on a tablet that is most
          of a screenful of scrolling before the clinical record starts. */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          className="w-full flex items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-xl"
        >
          Patient details
          <span aria-hidden="true" className="text-slate-400">
            {detailsOpen ? '▾' : '▸'}
          </span>
        </button>
        {detailsOpen && (
          <div className="px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <p>
              <span className="text-slate-400">Address:</span> {patient.address ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Birthday:</span> {patient.birthday ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Age:</span> {patient.age ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Sex:</span> {patient.sex ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Height:</span> {patient.height ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Weight:</span> {patient.weight ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Occupation:</span> {patient.occupation ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Spouse:</span> {patient.spouse ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Phone:</span> {patient.phone_number ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Cell:</span> {patient.cell_number ?? '—'}
            </p>
            {patient.remarks && (
              <p className="sm:col-span-2">
                <span className="text-slate-400">Remarks:</span> {patient.remarks}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Medical history</h2>
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Conditions:</span>{' '}
          {trueKeys(medical?.conditions, MEDICAL_CONDITIONS).join(', ') || 'None reported'}
        </p>
        {medical?.other_condition_details && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Detail:</span> {medical.other_condition_details}
          </p>
        )}
        {medical?.allergic_to_food_or_drug && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Allergies:</span> {medical.allergy_details ?? '(unspecified)'}
          </p>
        )}
        {medical?.current_medications && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Current medication:</span>{' '}
            {medical.medication_details ?? '(unspecified)'}
          </p>
        )}
        {medical?.allergic_to_anesthesia && (
          <p className="text-sm text-amber-700">Allergic reaction to anesthesia noted.</p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Dental history</h2>
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Symptoms:</span>{' '}
          {trueKeys(dental?.symptoms, DENTAL_SYMPTOMS).join(', ') || 'None reported'}
        </p>
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Oral habits:</span>{' '}
          {trueKeys(dental?.oral_habits, ORAL_HABITS).join(', ') || 'None reported'}
        </p>
        {dental?.previous_dentist_name && (
          <p className="text-sm text-slate-600">
            <span className="text-slate-400">Previous dentist:</span> {dental.previous_dentist_name}
          </p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Consent history</h2>
          {!showConsent && (
            <button onClick={() => setShowConsent(true)} className="text-sm text-slate-600 hover:underline">
              + Re-confirm consent
            </button>
          )}
        </div>
        {consents.length === 0 && <p className="text-slate-400 text-sm">No signed consent on file yet.</p>}
        {consents.map((c) => (
          <p key={c.id} className="text-sm text-slate-600">
            Signed {new Date(c.signed_at).toLocaleString()} — version {c.consent_text_version}
            {/* A null signer means the consent predates 0010 recording it.
                That has to read as "not recorded" rather than silently
                looking like the patient signed. */}
            {c.signed_by_name ? (
              <span className="text-slate-500">
                {' '}
                · by {c.signed_by_name}
                {c.signer_relationship && c.signer_relationship !== 'self'
                  ? ` (${SIGNER_RELATIONSHIPS.find((r) => r.value === c.signer_relationship)?.label ?? c.signer_relationship})`
                  : ''}
              </span>
            ) : (
              <span className="text-slate-400"> · signer not recorded</span>
            )}
          </p>
        ))}
        {showConsent && staff && (
          <ConsentCapture
            patientId={id}
            patientName={patient.name}
            staffId={staff.id}
            submitLabel="Save re-confirmed consent"
            onSaved={() => {
              setShowConsent(false)
              void refreshConsents(id)
            }}
          />
        )}
      </section>

      <PatientScheduling patientId={id} />
      <VisitTimeline patientId={id} />
      <FileAttachments patientId={id} />
    </div>
  )
}
