import type { ToothConditionKey, ToothSurface } from './chartVocabulary'

/** One entry in the append-only chart log. A tooth's current state is the
 *  fold of every record for it, oldest first — nothing is ever edited in
 *  place, so the history per tooth stays intact. */
export interface ToothRecord {
  id: string
  /** Write order across the whole log. The fold depends on it — see the
   *  seq column's note in 0004_charting.sql for why created_at can't
   *  stand in for it. */
  seq: number
  patient_id: string
  visit_id: string | null
  tooth_number: number
  surface: ToothSurface | null
  condition: ToothConditionKey
  image_path: string | null
  image_name: string | null
  created_by: string | null
  created_at: string
}

/** A visit as the chart needs it: the date to label entries with, plus
 *  the dentist's write-up so the chart can show what the visit was about.
 *  PostgREST returns a to-one embed as an object, not an array. */
export interface ChartVisit {
  id: string
  visit_date: string
  visit_notes: { notes: string } | null
}

/** A mark staged in the UI but not yet written. Marks accumulate until
 *  the dentist saves, so a mis-tap chairside is undone with a tap rather
 *  than a database correction. */
export interface PendingMark {
  /** Local-only id, so React keys and removal don't depend on position. */
  key: string
  tooth_number: number
  surface: ToothSurface | null
  condition: ToothConditionKey
}

/** A tooth's current state, folded from its records. `planned` is separate
 *  from `condition` because planned treatment overlays existing findings
 *  rather than replacing them. */
export interface ToothState {
  condition: 'missing' | 'crown' | null
  surfaces: Partial<Record<ToothSurface, 'decayed' | 'filled'>>
  planned: boolean
}

export type ChartState = Record<number, ToothState>
