/** One expense on the day it was recorded. `business_date`, `created_by`
 *  and `created_at` are set by the database (0020), never by the client. */
export interface DailyExpense {
  id: string
  business_date: string
  description: string
  amount: number
  created_by: string | null
  created_at: string
}

/** One salary payment. A dentist's salary record is their rows here. */
export interface SalaryEntry extends DailyExpense {
  dentist_id: string
}

/** The day's figures, summed in SQL by clinic_day_totals() (0020). */
export interface ClinicDayTotals {
  business_date: string
  revenue_total: number
  expense_total: number
  salary_total: number
  commission_total: number
}

/** The frozen end-of-day report, saved when the clinic is closed. A
 *  re-download is rebuilt from this, never recomputed, so it always matches
 *  what was closed. */
export interface ClinicDayReport extends ClinicDayTotals {
  closed_at: string
  closed_by_name: string | null
  /** revenue − expenses − salary. */
  net_total: number
  expenses: { description: string; amount: number }[]
  salaries: { dentist_id: string; dentist_name: string | null; description: string; amount: number }[]
}

/** A closed day. Its existence is the lock. */
export interface ClinicDay {
  id: string
  business_date: string
  closed_at: string
  closed_by: string | null
  report: ClinicDayReport
}
