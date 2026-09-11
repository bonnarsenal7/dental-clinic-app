import { supabase } from './supabaseClient'

/** Records that a staff member opened a patient record.
 *
 *  Writes are logged by database triggers (0006_audit.sql) and cannot be
 *  skipped. Reads can't work that way — PostgreSQL has no SELECT trigger —
 *  so a view entry is only as trustworthy as the client that sent it. That
 *  is a real limitation, recorded in docs/COMPLIANCE.md rather than papered
 *  over; the `operation` column keeps view entries distinguishable from
 *  trigger-written ones.
 *
 *  Fire-and-forget on purpose: failing to log a view must never stop a
 *  clinician seeing a record mid-appointment. The write path is where the
 *  hard guarantee lives.
 */
export function logPatientView(patientId: string, staffId: string, table: string) {
  void supabase
    .from('audit_log')
    .insert({
      staff_id: staffId,
      action: `view ${table}`,
      operation: 'view',
      table_name: table,
      patient_id: patientId,
      record_id: patientId,
    })
    .then(({ error }) => {
      if (error) console.warn('Audit view log failed:', error.message)
    })
}
