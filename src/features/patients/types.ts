export interface Patient {
  id: string
  name: string
  address: string | null
  birthday: string | null
  age: number | null
  sex: string | null
  height: number | null
  weight: number | null
  occupation: string | null
  spouse: string | null
  phone_number: string | null
  cell_number: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
}

export interface MedicalHistory {
  id: string
  patient_id: string
  under_physician_care: boolean | null
  physician_name: string | null
  physician_phone: string | null
  hospitalized: boolean | null
  hospitalized_reason: string | null
  conditions: Record<string, boolean>
  other_condition_details: string | null
  allergic_to_food_or_drug: boolean | null
  allergy_details: string | null
  current_medications: boolean | null
  medication_details: string | null
  allergic_to_anesthesia: boolean | null
  smokes: boolean | null
  updated_at: string
}

export interface DentalHistory {
  id: string
  patient_id: string
  last_visit_date: string | null
  last_dental_problem: string | null
  previous_dentist_name: string | null
  previous_dentist_address: string | null
  symptoms: Record<string, boolean>
  oral_habits: Record<string, boolean>
  oral_habits_other_details: string | null
  updated_at: string
}

/** How a signer is entitled to consent. Widening this means a migration —
 *  the same list is a check constraint on the column (0010). */
export type SignerRelationship = 'self' | 'parent' | 'guardian' | 'representative'

export const SIGNER_RELATIONSHIPS: { value: SignerRelationship; label: string }[] = [
  { value: 'self', label: 'The patient' },
  { value: 'parent', label: 'Parent' },
  { value: 'guardian', label: 'Legal guardian' },
  { value: 'representative', label: 'Authorised representative' },
]

export interface Consent {
  id: string
  patient_id: string
  staff_id: string | null
  consent_text_version: string
  signature_image_url: string
  signed_at: string
  created_at: string
  /** Null on consents signed before 0010 recorded this — which means
   *  "not recorded", never "the patient signed". */
  signed_by_name: string | null
  signer_relationship: SignerRelationship | null
}

export interface Visit {
  id: string
  patient_id: string
  staff_id: string | null
  visit_date: string
  created_at: string
}

export interface VisitNote {
  id: string
  visit_id: string
  notes: string
  created_by: string | null
  updated_at: string
}

export interface VisitWithNote extends Visit {
  visit_notes: VisitNote | null
}

export interface PatientFile {
  id: string
  patient_id: string
  storage_path: string
  file_name: string
  file_type: string | null
  uploaded_by: string | null
  created_at: string
}

/** Registration form shape — demographics + the two history checklists,
 *  submitted together in one flow. */
export interface PatientRegistrationInput {
  name: string
  address: string
  birthday: string
  age: string
  sex: string
  height: string
  weight: string
  occupation: string
  spouse: string
  phone_number: string
  cell_number: string
  remarks: string

  under_physician_care: boolean
  physician_name: string
  physician_phone: string
  hospitalized: boolean
  hospitalized_reason: string
  conditions: Record<string, boolean>
  other_condition_details: string
  allergic_to_food_or_drug: boolean
  allergy_details: string
  current_medications: boolean
  medication_details: string
  allergic_to_anesthesia: boolean
  smokes: boolean

  last_visit_date: string
  last_dental_problem: string
  previous_dentist_name: string
  previous_dentist_address: string
  symptoms: Record<string, boolean>
  oral_habits: Record<string, boolean>
  oral_habits_other_details: string
}
