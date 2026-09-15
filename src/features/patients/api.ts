import { supabase } from '../../core/supabaseClient'
import type {
  Consent,
  DentalHistory,
  MedicalHistory,
  Patient,
  PatientFile,
  PatientRegistrationInput,
  SignerRelationship,
  VisitWithNote,
} from './types'

const ATTACHMENTS_BUCKET = 'patient-files'

function toNullableNumber(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}
function toNullableString(v: string): string | null {
  return v.trim() === '' ? null : v
}

/** `dentistId` narrows the list to that dentist's patients: anyone with at
 *  least one appointment booked with them, past or future.
 *
 *  A screen scope, not a security boundary — RLS still lets a dentist read
 *  every patient. The inner join makes the embed a filter rather than an
 *  attachment, and PostgREST still returns each patient once. */
export async function searchPatients(query: string, dentistId?: string): Promise<Patient[]> {
  let q = supabase
    .from('patients')
    .select(dentistId ? '*, appointments!inner(dentist_id)' : '*')
    .order('created_at', { ascending: false })
  if (dentistId) q = q.eq('appointments.dentist_id', dentistId)
  if (query.trim()) {
    const term = query.trim()
    q = q.or(`name.ilike.%${term}%,cell_number.ilike.%${term}%,phone_number.ilike.%${term}%`)
  }
  const { data, error } = await q.limit(100)
  if (error) throw new Error(error.message)
  // The join column is how the filter works, not part of a patient.
  return ((data ?? []) as unknown as (Patient & { appointments?: unknown })[]).map((row) => {
    const patient = { ...row }
    delete patient.appointments
    return patient as Patient
  })
}

/** Whether a patient has ever been booked with this dentist — the same rule
 *  `searchPatients` scopes a dentist's list by. */
export async function isAssignedToDentist(patientId: string, dentistId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('patient_id', patientId)
    .eq('dentist_id', dentistId)
    .limit(1)
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function getPatient(id: string): Promise<Patient> {
  const { data, error } = await supabase.from('patients').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as Patient
}

export async function getMedicalHistory(patientId: string): Promise<MedicalHistory | null> {
  const { data, error } = await supabase
    .from('medical_histories')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as MedicalHistory | null
}

export async function getDentalHistory(patientId: string): Promise<DentalHistory | null> {
  const { data, error } = await supabase
    .from('dental_histories')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as DentalHistory | null
}

/** Creates a patient plus their medical and dental history rows together.
 *  Not a single DB transaction (supabase-js doesn't expose multi-table
 *  transactions without an RPC) — if a later step fails, the patient row
 *  still exists and history can be retried via updatePatientHistory. */
export async function registerPatient(input: PatientRegistrationInput, createdBy: string) {
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      name: input.name,
      address: toNullableString(input.address),
      birthday: toNullableString(input.birthday),
      age: toNullableNumber(input.age),
      sex: toNullableString(input.sex),
      height: toNullableNumber(input.height),
      weight: toNullableNumber(input.weight),
      occupation: toNullableString(input.occupation),
      spouse: toNullableString(input.spouse),
      phone_number: toNullableString(input.phone_number),
      cell_number: toNullableString(input.cell_number),
      remarks: toNullableString(input.remarks),
      created_by: createdBy,
    })
    .select()
    .single()
  if (patientError) throw new Error(`Patient: ${patientError.message}`)

  const { error: medError } = await supabase.from('medical_histories').insert({
    patient_id: patient.id,
    under_physician_care: input.under_physician_care,
    physician_name: toNullableString(input.physician_name),
    physician_phone: toNullableString(input.physician_phone),
    hospitalized: input.hospitalized,
    hospitalized_reason: toNullableString(input.hospitalized_reason),
    conditions: input.conditions,
    other_condition_details: toNullableString(input.other_condition_details),
    allergic_to_food_or_drug: input.allergic_to_food_or_drug,
    allergy_details: toNullableString(input.allergy_details),
    current_medications: input.current_medications,
    medication_details: toNullableString(input.medication_details),
    allergic_to_anesthesia: input.allergic_to_anesthesia,
    smokes: input.smokes,
  })
  if (medError) throw new Error(`Medical history: ${medError.message}`)

  const { error: dentalError } = await supabase.from('dental_histories').insert({
    patient_id: patient.id,
    last_visit_date: toNullableString(input.last_visit_date),
    last_dental_problem: toNullableString(input.last_dental_problem),
    previous_dentist_name: toNullableString(input.previous_dentist_name),
    previous_dentist_address: toNullableString(input.previous_dentist_address),
    symptoms: input.symptoms,
    oral_habits: input.oral_habits,
    oral_habits_other_details: toNullableString(input.oral_habits_other_details),
  })
  if (dentalError) throw new Error(`Dental history: ${dentalError.message}`)

  return patient as Patient
}

export async function updatePatientHistory(patientId: string, input: PatientRegistrationInput) {
  const { error: patientError } = await supabase
    .from('patients')
    .update({
      name: input.name,
      address: toNullableString(input.address),
      birthday: toNullableString(input.birthday),
      age: toNullableNumber(input.age),
      sex: toNullableString(input.sex),
      height: toNullableNumber(input.height),
      weight: toNullableNumber(input.weight),
      occupation: toNullableString(input.occupation),
      spouse: toNullableString(input.spouse),
      phone_number: toNullableString(input.phone_number),
      cell_number: toNullableString(input.cell_number),
      remarks: toNullableString(input.remarks),
    })
    .eq('id', patientId)
  if (patientError) throw new Error(`Patient: ${patientError.message}`)

  const { error: medError } = await supabase
    .from('medical_histories')
    .update({
      under_physician_care: input.under_physician_care,
      physician_name: toNullableString(input.physician_name),
      physician_phone: toNullableString(input.physician_phone),
      hospitalized: input.hospitalized,
      hospitalized_reason: toNullableString(input.hospitalized_reason),
      conditions: input.conditions,
      other_condition_details: toNullableString(input.other_condition_details),
      allergic_to_food_or_drug: input.allergic_to_food_or_drug,
      allergy_details: toNullableString(input.allergy_details),
      current_medications: input.current_medications,
      medication_details: toNullableString(input.medication_details),
      allergic_to_anesthesia: input.allergic_to_anesthesia,
      smokes: input.smokes,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', patientId)
  if (medError) throw new Error(`Medical history: ${medError.message}`)

  const { error: dentalError } = await supabase
    .from('dental_histories')
    .update({
      last_visit_date: toNullableString(input.last_visit_date),
      last_dental_problem: toNullableString(input.last_dental_problem),
      previous_dentist_name: toNullableString(input.previous_dentist_name),
      previous_dentist_address: toNullableString(input.previous_dentist_address),
      symptoms: input.symptoms,
      oral_habits: input.oral_habits,
      oral_habits_other_details: toNullableString(input.oral_habits_other_details),
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', patientId)
  if (dentalError) throw new Error(`Dental history: ${dentalError.message}`)
}

// --- Consent -----------------------------------------------------------

export async function listConsents(patientId: string): Promise<Consent[]> {
  const { data, error } = await supabase
    .from('consents')
    .select('*')
    .eq('patient_id', patientId)
    .order('signed_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Consent[]
}

/** Uploads the signature PNG to Storage and writes the consents row.
 *  signature_image_url stores the private bucket's object path, not a
 *  public URL — see getSignedFileUrl to render it. */
export async function saveConsent(params: {
  patientId: string
  staffId: string
  consentTextVersion: string
  signatureDataUrl: string
  signedByName: string
  signerRelationship: SignerRelationship
}) {
  const blob = await (await fetch(params.signatureDataUrl)).blob()
  const path = `signatures/${params.patientId}/${Date.now()}.png`
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, blob, {
    contentType: 'image/png',
  })
  if (uploadError) throw new Error(`Signature upload: ${uploadError.message}`)

  const { error: insertError } = await supabase.from('consents').insert({
    patient_id: params.patientId,
    staff_id: params.staffId,
    consent_text_version: params.consentTextVersion,
    signature_image_url: path,
    signed_by_name: params.signedByName,
    signer_relationship: params.signerRelationship,
  })
  if (insertError) throw new Error(`Consent: ${insertError.message}`)
}

// --- Visits & clinical notes (dentist/admin only, enforced by RLS) -----

export async function listVisits(patientId: string): Promise<VisitWithNote[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('*, visit_notes(*)')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data as VisitWithNote[]
}

export async function addVisitWithNote(params: {
  patientId: string
  staffId: string
  visitDate: string
  notes: string
}) {
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      patient_id: params.patientId,
      staff_id: params.staffId,
      visit_date: params.visitDate,
    })
    .select()
    .single()
  if (visitError) throw new Error(`Visit: ${visitError.message}`)

  const { error: noteError } = await supabase
    .from('visit_notes')
    .insert({ visit_id: visit.id, notes: params.notes, created_by: params.staffId })
  if (noteError) throw new Error(`Visit note: ${noteError.message}`)
}

// --- File attachments ----------------------------------------------------

export async function listPatientFiles(patientId: string): Promise<PatientFile[]> {
  const { data, error } = await supabase
    .from('patient_files')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as PatientFile[]
}

export async function uploadPatientFile(params: {
  patientId: string
  staffId: string
  file: File
  fileType: string
}) {
  const path = `attachments/${params.patientId}/${Date.now()}-${params.file.name}`
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, params.file)
  if (uploadError) throw new Error(`Upload: ${uploadError.message}`)

  const { error: insertError } = await supabase.from('patient_files').insert({
    patient_id: params.patientId,
    storage_path: path,
    file_name: params.file.name,
    file_type: params.fileType,
    uploaded_by: params.staffId,
  })
  if (insertError) throw new Error(`File record: ${insertError.message}`)
}

/** Signed URLs are short-lived since the bucket is private. */
export async function getSignedFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, 60 * 10)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
