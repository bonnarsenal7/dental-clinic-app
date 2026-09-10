import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import PatientForm, { EMPTY_PATIENT_FORM } from './PatientForm'
import ConsentCapture from './ConsentCapture'
import { registerPatient } from './api'
import type { PatientRegistrationInput } from './types'

export default function PatientRegisterPage() {
  const { staff } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [newPatientId, setNewPatientId] = useState<string | null>(null)
  const [newPatientName, setNewPatientName] = useState('')

  async function handleSubmit(values: PatientRegistrationInput) {
    if (!staff) return
    setError(null)
    try {
      const patient = await registerPatient(values, staff.id)
      setNewPatientId(patient.id)
      setNewPatientName(patient.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  if (newPatientId) {
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Register patient</h1>
        <p className="text-slate-500 text-sm mt-1">
          Demographics and history mirror the clinic's paper intake form.
        </p>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      <PatientForm defaultValues={EMPTY_PATIENT_FORM} onSubmit={handleSubmit} submitLabel="Save and continue to consent" />
    </div>
  )
}
