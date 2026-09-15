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
    // Only when it was frozen. A day closed before 0022 never recorded it,
    // and an invented empty list would read as "nobody earned commission".
    ...(raw.commission_by_dentist
      ? {
          commission_by_dentist: raw.commission_by_dentist.map((c) => ({
            ...c,
            commission_total: Number(c.commission_total),
          })),
        }
      : {}),
  }
}

/** Whose commission a row is, in words — the same on screen and on paper.
 *  A row with no dentist is commission whose visit named nobody (0021); it
 *  is listed so the rows add up to the total. */
export function commissionLabel(row: { dentist_id: string | null; dentist_name: string | null }): string {
  if (!row.dentist_id) return 'No dentist recorded'
  return row.dentist_name ?? 'Former staff'
}

/** One dentist's pay for the day: salary and commission side by side. */
export interface DentistPayRow {
  key: string
  /** Null for commission whose visit named no dentist. */
  dentistId: string | null
  label: string
  salary: number
  /** Null when the commission breakdown could not be loaded. */
  commission: number | null
  /** Salary + commission. Null wherever commission is. */
  total: number | null
}

/** Salary and commission merged into one row per dentist — the combined
 *  "Daily salary & commission" table.
 *
 *  A dentist paid salary but earning no commission, or the reverse, still
 *  gets a row. Commission with no dentist is a row of its own, last, so the
 *  columns add up to the day's totals. If the breakdown failed to load,
 *  commission is null rather than 0: "unknown" must not read as "none". */
export function buildPayByDentist(
  salaries: { dentist_id: string; dentist_name: string | null; amount: number | string }[],
  commissions:
    { dentist_id: string | null; dentist_name: string | null; commission_total: number | string }[] | null,
): DentistPayRow[] {
  const rows = new Map<string, DentistPayRow>()

  const rowFor = (dentistId: string | null, name: string | null) => {
    const key = dentistId ?? 'unattributed'
    let row = rows.get(key)
    if (!row) {
      row = {
        key,
        dentistId,
        label: commissionLabel({ dentist_id: dentistId, dentist_name: name }),
        salary: 0,
        commission: commissions ? 0 : null,
        total: null,
      }
      rows.set(key, row)
    } else if (name && row.label === 'Former staff') {
      // One source knew the name when the other did not.
      row.label = name
    }
    return row
  }

  for (const s of salaries) rowFor(s.dentist_id, s.dentist_name).salary += Number(s.amount)
  for (const c of commissions ?? []) {
    const row = rowFor(c.dentist_id, c.dentist_name)
    row.commission = (row.commission ?? 0) + Number(c.commission_total)
  }

  return [...rows.values()]
    .map((r) => ({ ...r, total: r.commission === null ? null : r.salary + r.commission }))
    .sort(
      (a, b) => Number(a.dentistId === null) - Number(b.dentistId === null) || a.label.localeCompare(b.label),
    )
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
