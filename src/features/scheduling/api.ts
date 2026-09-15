import { supabase } from '../../core/supabaseClient'
import { toLocalDateString } from '../../core/localDate'
import { lockInvoice } from '../billing/api'
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

/** The appointment for a visit that is in the chair right now, if any —
 *  what "Finish treatment" on the patient's record acts on. */
export async function findInChairAppointmentForVisit(visitId: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('visit_id', visitId)
    .eq('status', 'in_chair')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Appointment | null) ?? null
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
  /** Who is actually treating the patient, asked when they are seated.
   *  Whoever was pencilled in at booking is often not who is free when the
   *  patient finally sits down, and the visit has to record the dentist who
   *  did the work rather than the one on the original booking. */
  dentistId?: string | null
}): Promise<Appointment> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: params.status }

  if (params.status === 'arrived') patch.arrived_at = now
  if (params.status === 'completed') patch.completed_at = now

  if (params.status === 'in_chair') {
    patch.seated_at = now

    // Who is treating them, decided now rather than at booking. Undefined
    // means nobody was asked; null means asked and left unassigned.
    const treating = params.dentistId !== undefined ? params.dentistId : params.appointment.dentist_id
    if (treating !== params.appointment.dentist_id) patch.dentist_id = treating

    if (!params.appointment.visit_id) {
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .insert({
          patient_id: params.appointment.patient_id,
          staff_id: treating ?? params.staffId,
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
  if (error) {
    // Moving the appointment onto a different dentist can collide with what
    // that dentist is already doing — the exclusion constraint applies to
    // the reassignment just as it does to a new booking.
    if (error.message.includes('appointments_no_double_booking')) {
      throw new Error('That dentist is already with another patient at this time.')
    }
    throw new Error(error.message)
  }
  return data as Appointment
}

/** Through `bookable_dentists()` rather than a select on `staff`.
 *
 *  `staff` lets a non-admin read only their own row, so the direct select
 *  returned nothing for a receptionist — the role that does most of the
 *  booking could not attach a booking to any dentist. The function returns
 *  id and name only, so fixing that does not also hand reception every
 *  colleague's email address. See 0011. */
/** Finishing treatment: the invoice leaves draft and the patient moves to
 *  awaiting payment. Both, or neither — a locked invoice with the patient
 *  still shown as in the chair is worse than either alone.
 *
 *  Not a database transaction (supabase-js has none without an RPC), so the
 *  invoice is locked *after* the status moves: if the lock then fails the
 *  patient is at the counter with an invoice that is still editable, which
 *  an admin can fix. The other order leaves a bill nobody can be charged. */
export async function finishTreatment(params: {
  appointment: Appointment
  staffId: string
  invoiceId: string | null
}): Promise<Appointment> {
  const updated = await setAppointmentStatus({
    appointment: params.appointment,
    status: params.invoiceId ? 'pending_payment' : 'completed',
    staffId: params.staffId,
  })
  if (params.invoiceId) await lockInvoice(params.invoiceId)
  return updated
}

/** Checks out a patient who had nothing billed — the "No charge" path from
 *  reception's queue. Only moves an appointment still awaiting payment, so a
 *  second tap from another tablet changes nothing. */
export async function checkOutWithoutCharge(appointmentId: string) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', appointmentId)
    .eq('status', 'pending_payment')
  if (error) throw new Error(error.message)
}

/** Checks the patient out once their bill is settled, so reception does not
 *  also have to press Complete on the schedule. Only appointments still
 *  awaiting payment for this visit move; 0015 lets reception and admin make
 *  that move and nobody else. */
export async function completeAwaitingForVisit(visitId: string) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('visit_id', visitId)
    .eq('status', 'pending_payment')
  if (error) throw new Error(error.message)
}

export async function listDentists(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc('bookable_dentists')
  if (error) throw new Error(error.message)
  return (data ?? []) as { id: string; name: string }[]
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

/** A recall is the date chosen on the profile's calendar — nothing else.
 *  0018 dropped the interval that used to travel with it, and refuses a date
 *  that is not after today. */
export async function createRecall(params: {
  patientId: string
  dueOn: string
  reason: string
  staffId: string
}): Promise<Recall> {
  const { data, error } = await supabase
    .from('recalls')
    .insert({
      patient_id: params.patientId,
      due_on: params.dueOn,
      reason: params.reason,
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
