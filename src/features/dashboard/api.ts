import { supabase } from '../../core/supabaseClient'
import type { MedicalHistory } from '../patients/types'
import type { AppointmentStatus } from '../scheduling/types'
import type { DailySummary } from './types'

export async function getDailySummary(): Promise<DailySummary> {
  const { data, error } = await supabase.from('daily_dashboard').select('*').single()
  if (error) throw new Error(error.message)
  return data as DailySummary
}

export interface TodaysPatient {
  appointment_id: string
  patient_id: string
  name: string
  scheduled_at: string
  status: AppointmentStatus
  reason: string | null
  medical: MedicalHistory | null
}

/** Today's list with each patient's medical history attached, so the
 *  dashboard can warn about an allergy before the patient is in the chair
 *  rather than when the dentist happens to open their chart. */
export async function listTodaysPatients(): Promise<TodaysPatient[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id, scheduled_at, status, reason, patients(name, medical_histories(*))')
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)

  type Row = {
    id: string
    patient_id: string
    scheduled_at: string
    status: AppointmentStatus
    reason: string | null
    patients: {
      name: string
      medical_histories: MedicalHistory | MedicalHistory[] | null
    } | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    // PostgREST returns a to-one embed as an object, but a nested one can
    // still arrive as an array depending on how it infers the relationship.
    const history = row.patients?.medical_histories
    return {
      appointment_id: row.id,
      patient_id: row.patient_id,
      name: row.patients?.name ?? 'Unknown patient',
      scheduled_at: row.scheduled_at,
      status: row.status,
      reason: row.reason,
      medical: Array.isArray(history) ? (history[0] ?? null) : (history ?? null),
    }
  })
}
