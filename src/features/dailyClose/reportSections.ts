import type { ClinicDayReport } from './types'

export interface SalaryGroup {
  dentistId: string
  dentistName: string
  entries: { description: string; amount: number }[]
  subtotal: number
}

/** Salary itemised per dentist, dentists by name, each with a subtotal —
 *  how the report and the screen both present it. */
export function groupSalariesByDentist(
  salaries: {
    dentist_id: string
    dentist_name: string | null
    description: string
    amount: number | string
  }[],
): SalaryGroup[] {
  const groups = new Map<string, SalaryGroup>()
  for (const s of salaries) {
    const amount = Number(s.amount)
    const group = groups.get(s.dentist_id) ?? {
      dentistId: s.dentist_id,
      dentistName: s.dentist_name ?? 'Unknown dentist',
      entries: [],
      subtotal: 0,
    }
    group.entries.push({ description: s.description, amount })
    group.subtotal += amount
    groups.set(s.dentist_id, group)
  }
  return [...groups.values()].sort((a, b) => a.dentistName.localeCompare(b.dentistName))
}

/** The report as it arrives from jsonb, with every figure a number.
 *  PostgREST and jsonb both hand numeric back as a string often enough that
 *  adding them uncoerced would concatenate. */
export function normaliseReport(raw: ClinicDayReport): ClinicDayReport {
  return {
    ...raw,
    revenue_total: Number(raw.revenue_total),
    expense_total: Number(raw.expense_total),
    salary_total: Number(raw.salary_total),
    commission_total: Number(raw.commission_total),
    net_total: Number(raw.net_total),
    expenses: (raw.expenses ?? []).map((e) => ({ ...e, amount: Number(e.amount) })),
    salaries: (raw.salaries ?? []).map((s) => ({ ...s, amount: Number(s.amount) })),
  }
}

/** Money for the PDF. Not formatMoney: jsPDF's built-in fonts cannot draw
 *  the peso sign, and render it as stray characters. */
export function pdfMoney(amount: number): string {
  const figure = Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${amount < 0 ? '-' : ''}PHP ${figure}`
}
