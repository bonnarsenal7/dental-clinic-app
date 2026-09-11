import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logPatientView } from '../../core/auditView'
import { getDentalHistory, getMedicalHistory, getPatient, listConsents } from './api'
import ConsentCapture from './ConsentCapture'
import PatientScheduling from '../scheduling/PatientScheduling'
import VisitTimeline from './VisitTimeline'
import FileAttachments from './FileAttachments'
import { MEDICAL_CONDITIONS, DENTAL_SYMPTOMS, ORAL_HABITS } from './historyOptions'
import type { Consent, DentalHistory, MedicalHistory, Patient } from './types'
import { toMessage } from '../../core/errors'
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
          <h1 className="text-lg font-semibold text-slate-800">{patient.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {patient.cell_number ?? patient.phone_number ?? 'No contact number on file'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {staff && staff.role !== 'receptionist' && (
            <Link
              to={`/patients/${id}/chart`}
              className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700"
            >
              Dental chart
            </Link>
          )}
          <Link
            to={`/patients/${id}/billing`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Billing
          </Link>
          <Link
            to={`/patients/${id}/edit`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Edit demographics & history
          </Link>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <p><span className="text-slate-400">Address:</span> {patient.address ?? '—'}</p>
        <p><span className="text-slate-400">Birthday:</span> {patient.birthday ?? '—'}</p>
        <p><span className="text-slate-400">Age:</span> {patient.age ?? '—'}</p>
        <p><span className="text-slate-400">Sex:</span> {patient.sex ?? '—'}</p>
        <p><span className="text-slate-400">Height:</span> {patient.height ?? '—'}</p>
        <p><span className="text-slate-400">Weight:</span> {patient.weight ?? '—'}</p>
        <p><span className="text-slate-400">Occupation:</span> {patient.occupation ?? '—'}</p>
        <p><span className="text-slate-400">Spouse:</span> {patient.spouse ?? '—'}</p>
        <p><span className="text-slate-400">Phone:</span> {patient.phone_number ?? '—'}</p>
        <p><span className="text-slate-400">Cell:</span> {patient.cell_number ?? '—'}</p>
        {patient.remarks && <p className="sm:col-span-2"><span className="text-slate-400">Remarks:</span> {patient.remarks}</p>}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Medical history</h2>
        <p className="text-sm text-slate-600">
          <span className="text-slate-400">Conditions:</span>{' '}
          {trueKeys(medical?.conditions, MEDICAL_CONDITIONS).join(', ') || 'None reported'}
        </p>
        {medical?.other_condition_details && (
          <p className="text-sm text-slate-600"><span className="text-slate-400">Detail:</span> {medical.other_condition_details}</p>
        )}
        {medical?.allergic_to_food_or_drug && (
          <p className="text-sm text-slate-600"><span className="text-slate-400">Allergies:</span> {medical.allergy_details ?? '(unspecified)'}</p>
        )}
        {medical?.current_medications && (
          <p className="text-sm text-slate-600"><span className="text-slate-400">Current medication:</span> {medical.medication_details ?? '(unspecified)'}</p>
        )}
        {medical?.allergic_to_anesthesia && <p className="text-sm text-amber-700">Allergic reaction to anesthesia noted.</p>}
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
          <p className="text-sm text-slate-600"><span className="text-slate-400">Previous dentist:</span> {dental.previous_dentist_name}</p>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Consent history</h2>
          {!showConsent && (
            <button
              onClick={() => setShowConsent(true)}
              className="text-sm text-slate-600 hover:underline"
            >
              + Re-confirm consent
            </button>
          )}
        </div>
        {consents.length === 0 && <p className="text-slate-400 text-sm">No signed consent on file yet.</p>}
        {consents.map((c) => (
          <p key={c.id} className="text-sm text-slate-600">
            Signed {new Date(c.signed_at).toLocaleString()} — version {c.consent_text_version}
          </p>
        ))}
        {showConsent && staff && (
          <ConsentCapture
            patientId={id}
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
