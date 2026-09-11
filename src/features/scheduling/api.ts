import { supabase } from '../../core/supabaseClient'
import { toLocalDateString } from '../../core/localDate'
import type {
  Appointment,
  AppointmentStatus,
  AppointmentWithPatient,
  Recall,
  RecallWithPatient,
} from './types'

const WITH_PATIENT = '*, patients(id, name, cell_number, phone_number)'

/** Everything booked for one calendar day, in time order.
 *  Bounds are computed from local midnight, so "today" means the clinic's
 *  today rather than UTC's. */
export async function listAppointmentsForDay(day: Date): Promise<AppointmentWithPatient[]> {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  const { data, error } = await supabase
    .from('appointments')
    .select(WITH_PATIENT)
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as unknown as AppointmentWithPatient[]
}

export async function getAppointment(id: string): Promise<Appointment> {
  const { data, error } = await supabase.from('appointments').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as Appointment
}

export async function listPatientAppointments(patientId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('patient_id', patientId)
    .order('scheduled_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Appointment[]
}

export async function bookAppointment(params: {
  patientId: string
  dentistId: string | null
  scheduledAt: string
  durationMinutes: number
  reason: string | null
  procedureId: string | null
  receptionNotes: string | null
  staffId: string
}): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      patient_id: params.patientId,
      dentist_id: params.dentistId,
      scheduled_at: params.scheduledAt,
      duration_minutes: params.durationMinutes,
      reason: params.reason,
      procedure_id: params.procedureId,
      reception_notes: params.receptionNotes,
      created_by: params.staffId,
    })
    .select()
    .single()

  // The database refuses to double-book a dentist (0008_scheduling.sql).
  // Translate that into something a receptionist can act on rather than
  // showing them a constraint name.
  if (error) {
    if (error.message.includes('appointments_no_double_booking')) {
      throw new Error('That dentist already has an appointment overlapping this time. Pick another slot.')
    }
    throw new Error(error.message)
  }
  return data as Appointment
}

export async function rescheduleAppointment(id: string, scheduledAt: string, durationMinutes: number) {
  const { error } = await supabase
    .from('appointments')
    .update({ scheduled_at: scheduledAt, duration_minutes: durationMinutes })
    .eq('id', id)
  if (error) {
    if (error.message.includes('appointments_no_double_booking')) {
      throw new Error('That dentist already has an appointment overlapping this time. Pick another slot.')
    }
    throw new Error(error.message)
  }
}

/** Moves an appointment along the day, stamping the time of the move.
 *
 *  Seating a patient creates the `visits` row and links it, so the dentist
 *  charts against the booking rather than starting a visit by hand — the
 *  same "no manual re-entry" thread that runs from the chart into billing.
 */
export async function setAppointmentStatus(params: {
  appointment: Appointment
  status: AppointmentStatus
  staffId: string
}): Promise<Appointment> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: params.status }

  if (params.status === 'arrived') patch.arrived_at = now
  if (params.status === 'completed') patch.completed_at = now

  if (params.status === 'in_chair') {
    patch.seated_at = now
    if (!params.appointment.visit_id) {
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert({
          patient_id: params.appointment.patient_id,
          staff_id: params.appointment.dentist_id ?? params.staffId,
          visit_date: now,
        })
        .select()
        .single()
      if (visitError) throw new Error(`Starting the visit: ${visitError.message}`)
      patch.visit_id = visit.id
    }
  }

  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', params.appointment.id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Appointment
}

export async function listDentists(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name')
    .in('role', ['dentist', 'admin'])
    .eq('active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return data as { id: string; name: string }[]
}

// --- Recalls -------------------------------------------------------------

/** Everyone due back, most overdue first. `through` lets the front desk
 *  pull next month's list rather than only today's. */
export async function listDueRecalls(through: Date): Promise<RecallWithPatient[]> {
  const { data, error } = await supabase
    .from('recalls')
    .select(WITH_PATIENT)
    .eq('status', 'due')
    .lte('due_on', toLocalDateString(through))
    .order('due_on', { ascending: true })
  if (error) throw new Error(error.message)
  return data as unknown as RecallWithPatient[]
}

export async function listPatientRecalls(patientId: string): Promise<Recall[]> {
  const { data, error } = await supabase
    .from('recalls')
    .select('*')
    .eq('patient_id', patientId)
    .order('due_on', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Recall[]
}

export async function createRecall(params: {
  patientId: string
  dueOn: string
  reason: string
  intervalMonths: number | null
  staffId: string
}): Promise<Recall> {
  const { data, error } = await supabase
    .from('recalls')
    .insert({
      patient_id: params.patientId,
      due_on: params.dueOn,
      reason: params.reason,
      interval_months: params.intervalMonths,
      created_by: params.staffId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Recall
}

export async function setRecallStatus(id: string, status: Recall['status'], appointmentId?: string) {
  const patch: Record<string, unknown> = { status }
  if (status === 'completed') patch.completed_at = new Date().toISOString()
  if (appointmentId) patch.appointment_id = appointmentId
  const { error } = await supabase.from('recalls').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
