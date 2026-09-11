import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import PatientForm, { EMPTY_PATIENT_FORM } from './PatientForm'
import RegistrationReview from './RegistrationReview'
import ConsentCapture from './ConsentCapture'
import { registerPatient } from './api'
import type { PatientRegistrationInput } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'

type Stage = 'form' | 'review' | 'consent'

export default function PatientRegisterPage() {
  const { staff } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>('form')
  const [pendingValues, setPendingValues] = useState<PatientRegistrationInput | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newPatientId, setNewPatientId] = useState<string | null>(null)
  const [newPatientName, setNewPatientName] = useState('')

  // The form's own "submit" just moves to the review step — nothing is
  // saved yet, so the patient can check every answer before anything
  // touches the database or gets signed for.
  async function handleFormSubmit(values: PatientRegistrationInput) {
    setPendingValues(values)
    setStage('review')
  }

  async function handleConfirm() {
    if (!staff || !pendingValues) return
    setSaving(true)
    setError(null)
    try {
      const patient = await registerPatient(pendingValues, staff.id)
      setNewPatientId(patient.id)
      setNewPatientName(patient.name)
      setStage('consent')
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'consent' && newPatientId) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Consent for {newPatientName}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Have the patient (or parent/guardian) sign below to finish registration.
          </p>
        </div>
        {staff && (
          <ConsentCapture
            patientId={newPatientId}
            staffId={staff.id}
            onSaved={() => navigate(`/patients/${newPatientId}`)}
          />
        )}
        <button
          onClick={() => navigate(`/patients/${newPatientId}`)}
          className="self-start text-sm text-slate-500 hover:text-slate-700 hover:underline"
        >
          Skip for now — capture consent later from the patient's profile
        </button>
      </div>
    )
  }

  if (stage === 'review' && pendingValues) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Review before signing</h1>
          <p className="text-slate-500 text-sm mt-1">
            Show this to the patient (or parent/guardian) so they can confirm everything below is correct before
            signing consent. Nothing is saved yet.
          </p>
        </div>
        {error && <ErrorState message={error} />}
        <RegistrationReview values={pendingValues} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStage('form')}
            className="rounded-md border border-slate-300 px-5 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Back and edit
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="rounded-md bg-slate-800 text-white text-sm font-medium px-5 py-2.5 hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirmed correct — continue to signature'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Register patient</h1>
        <p className="text-slate-500 text-sm mt-1">
          Demographics and history mirror the clinic's paper intake form.
        </p>
      </div>
      <PatientForm
        defaultValues={pendingValues ?? EMPTY_PATIENT_FORM}
        onSubmit={handleFormSubmit}
        submitLabel="Review before signing"
      />
    </div>
  )
}
