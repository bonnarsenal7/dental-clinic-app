export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'arrived'
  | 'in_chair'
  /** Treatment is done and the invoice is raised; the patient still owes. */
  | 'pending_payment'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: string
  patient_id: string
  dentist_id: string | null
  scheduled_at: string
  duration_minutes: number
  ends_at: string
  reason: string | null
  procedure_id: string | null
  status: AppointmentStatus
  arrived_at: string | null
  seated_at: string | null
  completed_at: string | null
  visit_id: string | null
  /** Administrative only — reception can read this. Anything clinical
   *  belongs in visit_notes, which reception cannot see at all. */
  reception_notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** PostgREST returns a to-one embed as an object, not an array. */
export interface AppointmentWithPatient extends Appointment {
  patients: {
    id: string
    name: string
    cell_number: string | null
    phone_number: string | null
  } | null
}

export type RecallStatus = 'due' | 'scheduled' | 'completed' | 'dismissed'

export interface Recall {
  id: string
  patient_id: string
  due_on: string
  reason: string
  status: RecallStatus
  appointment_id: string | null
  created_by: string | null
  created_at: string
  completed_at: string | null
}

export interface RecallWithPatient extends Recall {
  patients: {
    id: string
    name: string
    cell_number: string | null
    phone_number: string | null
  } | null
}
