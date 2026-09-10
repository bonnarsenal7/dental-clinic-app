import { supabase } from '../../core/supabaseClient'
import type { ChartVisit, PendingMark, ToothRecord } from './types'

// Same private bucket as Phase 2's signatures and attachments, but under a
// tooth/ prefix that 0004_charting.sql restricts to dentist/admin — a
// per-tooth X-ray is clinical data, like the tooth_record it hangs off.
const BUCKET = 'patient-files'
const TOOTH_IMAGE_PREFIX = 'tooth'

/** Oldest-first, because the chart is a fold of the log in order — by seq
 *  rather than created_at, which is identical across a batch. */
export async function listToothRecords(patientId: string): Promise<ToothRecord[]> {
  const { data, error } = await supabase
    .from('tooth_records')
    .select('*')
    .eq('patient_id', patientId)
    .order('seq', { ascending: true })
  if (error) throw new Error(error.message)
  return data as ToothRecord[]
}

/** Writes the staged marks as new rows — one insert, so a save either
 *  lands whole or not at all. Existing records are never updated: a
 *  re-chart is a later row that supersedes the earlier one. */
export async function saveToothMarks(params: {
  patientId: string
  staffId: string
  visitId: string
  marks: PendingMark[]
}): Promise<ToothRecord[]> {
  const rows = params.marks.map((m) => ({
    patient_id: params.patientId,
    visit_id: params.visitId,
    tooth_number: m.tooth_number,
    surface: m.surface,
    condition: m.condition,
    created_by: params.staffId,
  }))

  const { data, error } = await supabase.from('tooth_records').insert(rows).select()
  if (error) throw new Error(`Save chart: ${error.message}`)
  return data as ToothRecord[]
}

// --- Visits --------------------------------------------------------------

/** Chart entries are always tied to a visit, so the chart and the
 *  dentist's write-up of the same appointment stay connected. */
export async function listChartVisits(patientId: string): Promise<ChartVisit[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, visit_date, visit_notes(notes)')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data as unknown as ChartVisit[]
}

/** Charting a patient who walked in without a visit record yet — creates
 *  the administrative visit row so marks have something to attach to. The
 *  dentist writes the note itself on the patient's profile. */
export async function createVisitToday(patientId: string, staffId: string): Promise<ChartVisit> {
  const { data, error } = await supabase
    .from('visits')
    .insert({ patient_id: patientId, staff_id: staffId, visit_date: new Date().toISOString() })
    .select('id, visit_date')
    .single()
  if (error) throw new Error(`Visit: ${error.message}`)
  return { ...(data as { id: string; visit_date: string }), visit_notes: null }
}

// --- Per-tooth images ----------------------------------------------------

/** Attaches an image to one already-saved record (e.g. the X-ray behind a
 *  decayed marking). Records only ever gain an image they don't have —
 *  replacing one would orphan the old object, which only an admin could
 *  clear up. */
export async function attachToothImage(params: {
  recordId: string
  patientId: string
  toothNumber: number
  file: File
}): Promise<ToothRecord> {
  const path = `${TOOTH_IMAGE_PREFIX}/${params.patientId}/${params.toothNumber}/${Date.now()}-${params.file.name}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, params.file)
  if (uploadError) throw new Error(`Upload: ${uploadError.message}`)

  const { data, error } = await supabase
    .from('tooth_records')
    .update({ image_path: path, image_name: params.file.name })
    .eq('id', params.recordId)
    .select()
    .single()
  if (error) throw new Error(`Attach image: ${error.message}`)
  return data as ToothRecord
}

/** The bucket is private, so images are viewed through a short-lived
 *  signed URL rather than a permanent link (same as Phase 2's attachments). */
export async function getSignedToothImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
