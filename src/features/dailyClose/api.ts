import { supabase } from '../../core/supabaseClient'
import { normaliseReport } from './reportSections'
import type {
  ClinicDay,
  ClinicDayReport,
  ClinicDayTotals,
  CommissionByDentist,
  DailyExpense,
  SalaryEntry,
} from './types'

// The day an entry belongs to, and who recorded it, are set by 0020's
// trigger — never sent from here. A client cannot backdate an entry onto a
// day that is already closed.

const toNumber = <T extends { amount: number | string }>(row: T) => ({ ...row, amount: Number(row.amount) })

// --- Expenses ----------------------------------------------------------------

export async function listDailyExpenses(date: string): Promise<DailyExpense[]> {
  const { data, error } = await supabase
    .from('daily_expenses')
    .select('*')
    .eq('business_date', date)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as DailyExpense[]).map(toNumber)
}

export async function addDailyExpense(input: { description: string; amount: number }) {
  const { error } = await supabase
    .from('daily_expenses')
    .insert({ description: input.description, amount: input.amount })
  if (error) throw new Error(error.message)
}

/** Admin only, and only until the day is closed — both enforced by 0020. */
export async function updateDailyExpense(id: string, patch: { description: string; amount: number }) {
  const { error } = await supabase.from('daily_expenses').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteDailyExpense(id: string) {
  const { error } = await supabase.from('daily_expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// --- Salary --------------------------------------------------------------------

export async function listSalaryEntries(date: string): Promise<SalaryEntry[]> {
  const { data, error } = await supabase
    .from('salary_entries')
    .select('*')
    .eq('business_date', date)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as SalaryEntry[]).map(toNumber)
}

export async function addSalaryEntry(input: { dentistId: string; description: string; amount: number }) {
  const { error } = await supabase.from('salary_entries').insert({
    dentist_id: input.dentistId,
    description: input.description,
    amount: input.amount,
  })
  if (error) throw new Error(error.message)
}

export async function updateSalaryEntry(id: string, patch: { description: string; amount: number }) {
  const { error } = await supabase.from('salary_entries').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteSalaryEntry(id: string) {
  const { error } = await supabase.from('salary_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// --- The day -------------------------------------------------------------------

/** The closed day, or null while it is still open. */
export async function getClinicDay(date: string): Promise<ClinicDay | null> {
  const { data, error } = await supabase
    .from('clinic_days')
    .select('*')
    .eq('business_date', date)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const day = data as ClinicDay
  return { ...day, report: normaliseReport(day.report) }
}

/** Revenue, expenses, salary and commission for a day, summed in SQL. */
export async function getClinicDayTotals(date: string): Promise<ClinicDayTotals> {
  const { data, error } = await supabase.rpc('clinic_day_totals', { p_date: date })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as ClinicDayTotals | undefined
  return {
    business_date: row?.business_date ?? date,
    revenue_total: Number(row?.revenue_total ?? 0),
    expense_total: Number(row?.expense_total ?? 0),
    salary_total: Number(row?.salary_total ?? 0),
    commission_total: Number(row?.commission_total ?? 0),
  }
}

/** The day's commission per dentist, attributed through each invoice's visit
 *  (0021). Grouped and named in SQL: reception cannot read the staff table. */
export async function listCommissionByDentist(date: string): Promise<CommissionByDentist[]> {
  const { data, error } = await supabase.rpc('clinic_day_commission_by_dentist', { p_date: date })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CommissionByDentist[]).map((row) => ({
    dentist_id: row.dentist_id ?? null,
    dentist_name: row.dentist_name ?? null,
    commission_total: Number(row.commission_total),
  }))
}

/** Closes today: freezes the figures into a report and locks the day for
 *  everyone. The report comes back so it can be downloaded at once. */
export async function closeClinicDay(): Promise<ClinicDayReport> {
  const { data, error } = await supabase.rpc('close_clinic_day')
  if (error) throw new Error(error.message)
  return normaliseReport(data as ClinicDayReport)
}

export async function getClinicName(): Promise<string | null> {
  const { data } = await supabase.from('clinic_settings').select('clinic_name').eq('id', 1).maybeSingle()
  return (data?.clinic_name as string | undefined) ?? null
}
