import { supabase } from '../../../core/supabaseClient'
import type { PatientRegistrationInput, PatientType, SignerRelationship } from '../types'

const BUCKET = 'patient-files'

/** What the patient typed: the registration form without the category, which
 *  is reception's to choose (0023). */
export type IntakePayload = Omit<PatientRegistrationInput, 'patient_type'>

export type IntakeStatus = 'ready' | 'used' | 'expired' | 'unknown'

export interface IntakeSubmission {
  id: string
  patient_id: string
  /** Null once reviewed — the staged copy is erased (0026). */
  payload: IntakePayload | null
  signature_png: string | null
  signed_by_name: string | null
  signer_relationship: SignerRelationship | null
  consent_text_version: string | null
  submitted_at: string
  status: 'pending' | 'accepted' | 'discarded'
  reviewed_at: string | null
}

// --- The front desk --------------------------------------------------------

export async function startIntake(): Promise<string> {
  const { data, error } = await supabase.rpc('start_intake')
  if (error) throw new Error(error.message)
  return data as string
}

export async function listPendingIntakes(): Promise<IntakeSubmission[]> {
  const { data, error } = await supabase
    .from('intake_submissions')
    .select('*')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as IntakeSubmission[]
}

export async function getIntake(id: string): Promise<IntakeSubmission | null> {
  const { data, error } = await supabase.from('intake_submissions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as IntakeSubmission | null
}

/** Uploads the signature to where the patient's consent will point, then
 *  creates the patient, histories and consent in one transaction.
 *
 *  The path is fixed by the reserved patient id, so a retry after a failed
 *  second step finds the image already there and carries on, rather than
 *  leaving one orphaned object per attempt. */
export async function acceptIntake(intake: IntakeSubmission, patientType: PatientType): Promise<string> {
  if (!intake.signature_png) throw new Error('This intake has no signature to file.')
  const path = `signatures/${intake.patient_id}/intake-${intake.id}.png`
  const blob = await (await fetch(intake.signature_png)).blob()
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/png' })
  if (uploadError && !/already exists/i.test(uploadError.message)) {
    throw new Error(`Signature upload: ${uploadError.message}`)
  }

  const { data, error } = await supabase.rpc('accept_intake', {
    p_intake_id: intake.id,
    p_patient_type: patientType,
    p_signature_path: path,
  })
  if (error) throw new Error(error.message)
  return data as string
}

/** The trigger erases what the patient typed as the status leaves pending. */
export async function discardIntake(id: string): Promise<void> {
  const { error } = await supabase.from('intake_submissions').update({ status: 'discarded' }).eq('id', id)
  if (error) throw new Error(error.message)
}

// --- The patient (no login) ------------------------------------------------

export async function getIntakeStatus(code: string): Promise<IntakeStatus> {
  const { data, error } = await supabase.rpc('intake_status', { p_code: code })
  if (error) throw new Error(error.message)
  return data as IntakeStatus
}

export async function submitIntake(params: {
  code: string
  values: PatientRegistrationInput
  signatureDataUrl: string
  signedByName: string
  signerRelationship: SignerRelationship
  consentTextVersion: string
}): Promise<void> {
  // The category is reception's to choose; the database drops it as well.
  const payload: Partial<PatientRegistrationInput> = { ...params.values }
  delete payload.patient_type
  const { error } = await supabase.rpc('submit_intake', {
    p_code: params.code,
    p_payload: payload,
    p_signature_png: params.signatureDataUrl,
    p_signed_by_name: params.signedByName,
    p_signer_relationship: params.signerRelationship,
    p_consent_text_version: params.consentTextVersion,
  })
  if (error) throw new Error(error.message)
}
