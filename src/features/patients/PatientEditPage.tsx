import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PatientForm from './PatientForm'
import { EMPTY_PATIENT_FORM } from './PatientForm'
import { getDentalHistory, getMedicalHistory, getPatient, updatePatientHistory } from './api'
import type { PatientRegistrationInput } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'

function toStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

export default function PatientEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [defaultValues, setDefaultValues] = useState<PatientRegistrationInput | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    Promise.all([getPatient(id), getMedicalHistory(id), getDentalHistory(id)])
      .then(([patient, medical, dental]) => {
        setDefaultValues({
          ...EMPTY_PATIENT_FORM,
          name: patient.name,
          address: toStr(patient.address),
          birthday: toStr(patient.birthday),
          age: toStr(patient.age),
          sex: toStr(patient.sex),
          height: toStr(patient.height),
          weight: toStr(patient.weight),
          occupation: toStr(patient.occupation),
          spouse: toStr(patient.spouse),
          phone_number: toStr(patient.phone_number),
          cell_number: toStr(patient.cell_number),
          remarks: toStr(patient.remarks),
          under_physician_care: medical?.under_physician_care ?? false,
          physician_name: toStr(medical?.physician_name),
          physician_phone: toStr(medical?.physician_phone),
          hospitalized: medical?.hospitalized ?? false,
          hospitalized_reason: toStr(medical?.hospitalized_reason),
          conditions: {
            ...EMPTY_PATIENT_FORM.conditions,
            ...(medical?.conditions ?? {}),
          },
          other_condition_details: toStr(medical?.other_condition_details),
          allergic_to_food_or_drug: medical?.allergic_to_food_or_drug ?? false,
          allergy_details: toStr(medical?.allergy_details),
          current_medications: medical?.current_medications ?? false,
          medication_details: toStr(medical?.medication_details),
          allergic_to_anesthesia: medical?.allergic_to_anesthesia ?? false,
          smokes: medical?.smokes ?? false,
          last_visit_date: toStr(dental?.last_visit_date),
          last_dental_problem: toStr(dental?.last_dental_problem),
          previous_dentist_name: toStr(dental?.previous_dentist_name),
          previous_dentist_address: toStr(dental?.previous_dentist_address),
          symptoms: { ...EMPTY_PATIENT_FORM.symptoms, ...(dental?.symptoms ?? {}) },
          oral_habits: {
            ...EMPTY_PATIENT_FORM.oral_habits,
            ...(dental?.oral_habits ?? {}),
          },
          oral_habits_other_details: toStr(dental?.oral_habits_other_details),
        })
      })
      .catch((e) => setError(toMessage(e)))
  }, [id])

  async function handleSubmit(values: PatientRegistrationInput) {
    if (!id) return
    await updatePatientHistory(id, values)
    navigate(`/patients/${id}`)
  }

  if (error) return <ErrorState message={error} />
  if (!defaultValues) return <LoadingState />

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-slate-800">Edit patient</h1>
      <PatientForm defaultValues={defaultValues} onSubmit={handleSubmit} submitLabel="Save changes" />
    </div>
  )
}
