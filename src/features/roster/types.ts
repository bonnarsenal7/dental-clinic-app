/** One dentist covering one stretch of one day.
 *
 *  Times are wall-clock strings as Postgres returns them ("08:00:00"), and
 *  `shift_date` is a plain calendar date ("2026-09-21"). Deliberately not
 *  Dates: a rota is read off a wall, and putting these through a Date would
 *  invite the UTC shift that toLocalDateString exists to prevent. */
export interface DentistShift {
  id: string
  dentist_id: string
  dentist_name: string
  shift_date: string
  starts_at: string
  ends_at: string
  note: string | null
}

export interface NewShift {
  dentist_id: string
  shift_date: string
  starts_at: string
  ends_at: string
  note: string | null
}
