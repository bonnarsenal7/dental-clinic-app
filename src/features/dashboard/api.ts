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

type AppointmentRow = {
  id: string
  patient_id: string
  scheduled_at: string
  status: AppointmentStatus
  reason: string | null
  visit_id: string | null
  procedures: { name: string } | null
  patients: {
    name: string
    medical_histories: MedicalHistory | MedicalHistory[] | null
  } | null
}

async function fetchToday(dentistId?: string): Promise<AppointmentRow[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  let q = supabase
    .from('appointments')
    .select(
      'id, patient_id, scheduled_at, status, reason, visit_id, procedures(name), patients(name, medical_histories(*))',
    )
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
  if (dentistId) q = q.eq('dentist_id', dentistId)
  const { data, error } = await q.order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AppointmentRow[]
}

function toTodaysPatient(row: AppointmentRow): TodaysPatient {
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
}

/** Today's list with each patient's medical history attached, so the
 *  dashboard can warn about an allergy before the patient is in the chair
 *  rather than when the dentist happens to open their chart. */
export async function listTodaysPatients(): Promise<TodaysPatient[]> {
  return (await fetchToday()).map(toTodaysPatient)
}

export interface DentistDayRow extends TodaysPatient {
  /** The booked procedure's name, else the booking's reason. */
  treatment: string | null
  /** The visit's invoice total; null until an invoice exists. */
  amount: number | null
  /** Entered by reception on the invoice; 0 until they do. */
  commission: number
}

/** One dentist's patients for today, in every status — finished and
 *  cancelled included, since this is their record of the day rather than a
 *  queue.
 *
 *  The dentist filter is a presentation scope, not a security boundary: RLS
 *  still lets a dentist read every appointment. Amount and commission come
 *  from the visit's invoice, fetched in one second query rather than one per
 *  row. Void invoices are excluded — they are not owed, so not earned on. */
export async function listDentistDay(dentistId: string): Promise<DentistDayRow[]> {
  const rows = await fetchToday(dentistId)
  const visitIds = rows.map((r) => r.visit_id).filter((v): v is string => !!v)

  const byVisit: Record<string, { total_amount: number | string; commission_amount: number | string }> = {}
  if (visitIds.length > 0) {
    const { data, error } = await supabase
      .from('invoices')
      .select('visit_id, total_amount, commission_amount')
      .in('visit_id', visitIds)
      .neq('status', 'void')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    type InvoiceRow = { visit_id: string; total_amount: number | string; commission_amount: number | string }
    for (const inv of (data ?? []) as InvoiceRow[]) {
      // Newest first, so the first one seen for a visit wins.
      if (!byVisit[inv.visit_id]) byVisit[inv.visit_id] = inv
    }
  }

  return rows.map((row) => {
    const invoice = row.visit_id ? byVisit[row.visit_id] : undefined
    return {
      ...toTodaysPatient(row),
      treatment: row.procedures?.name ?? row.reason,
      // Numeric columns arrive from PostgREST as strings often enough that
      // adding them uncoerced would concatenate.
      amount: invoice ? Number(invoice.total_amount) : null,
      commission: invoice ? Number(invoice.commission_amount ?? 0) : 0,
    }
  })
}
