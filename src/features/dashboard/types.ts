/** One row from the `daily_dashboard` view (0009_dashboard.sql).
 *  Numeric columns arrive from PostgREST as strings often enough that
 *  every consumer coerces with Number() rather than trusting the type. */
export interface DailySummary {
  today: string
  appointments_today: number
  in_clinic: number
  still_to_come: number
  completed_today: number
  no_shows_today: number
  cancelled_today: number
  longest_wait_minutes: number
  collected_today: number
  collected_cash: number
  collected_card: number
  collected_transfer: number
  collected_other: number
  produced_today: number
  outstanding_total: number
  patients_owing: number
  recalls_overdue: number
  recalls_due_soon: number
  new_patients_today: number
}
