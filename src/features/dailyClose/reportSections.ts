import { pdfMoney } from '../billing/ledger'
import type { ClinicDayReport, ReportPayment } from './types'

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
    // Same rule: only when frozen (0027).
    ...(raw.payments ? { payments: raw.payments.map((p) => ({ ...p, amount: Number(p.amount) })) } : {}),
    ...(raw.non_cash_total !== undefined && raw.non_cash_total !== null
      ? { non_cash_total: Number(raw.non_cash_total) }
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

/** The "Salary & commission" section of the PDF, as text ready to draw — the
 *  dashboard's combined table on paper. Kept apart from the jsPDF drawing so
 *  what the report *says* can be tested; only the layout cannot. */
export interface ReportPayTable {
  rows: { label: string; salary: string; commission: string; total: string }[]
  footer: { label: string; salary: string; commission: string; total: string }
  /** False for a day closed before per-dentist commission was frozen (0022). */
  commissionByDentistRecorded: boolean
}

export function buildReportPayTable(report: ClinicDayReport): ReportPayTable {
  // A plain hyphen, not an em dash: safe in jsPDF's built-in font.
  const figure = (v: number | null) => (v === null ? '-' : pdfMoney(v))
  const pay = buildPayByDentist(report.salaries, report.commission_by_dentist ?? null)

  return {
    rows: pay.map((r) => ({
      label: r.label,
      salary: pdfMoney(r.salary),
      commission: figure(r.commission),
      total: figure(r.total),
    })),
    // The column totals are the frozen day's figures, known even where the
    // per-dentist commission is not.
    footer: {
      label: 'Total',
      salary: pdfMoney(report.salary_total),
      commission: pdfMoney(report.commission_total),
      total: pdfMoney(report.salary_total + report.commission_total),
    },
    commissionByDentistRecorded: report.commission_by_dentist !== undefined,
  }
}

/** How a payment method reads on the report. */
export function methodLabel(method: ReportPayment['method']): string {
  switch (method) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'bank_transfer':
      return 'Bank'
    default:
      return 'Other'
  }
}

/** The "Today's patients" table, as text ready to draw. Null for a day
 *  closed before the list was frozen (0027). */
export function buildReportPatientTable(
  report: ClinicDayReport,
): { name: string; procedure: string; method: string; amount: string }[] | null {
  if (!report.payments) return null
  return report.payments.map((p, i) => ({
    name: `${i + 1}. ${p.patient_name}`,
    procedure: p.procedure || '-',
    method: methodLabel(p.method),
    amount: pdfMoney(p.amount),
  }))
}

/** The overall summary and today's cash on hand:
 *
 *    COH = revenue - bank & digital - expenses - (salary + commission)
 *
 *  Bank & digital and COH are null for a day closed before the non-cash
 *  total was frozen (0027) — unknown must not print as a figure. */
export function buildReportSummary(report: ClinicDayReport): {
  revenue: number
  nonCash: number | null
  expenses: number
  salaryAndCommission: number
  cashOnHand: number | null
} {
  const salaryAndCommission = report.salary_total + report.commission_total
  const nonCash = report.non_cash_total ?? null
  return {
    revenue: report.revenue_total,
    nonCash,
    expenses: report.expense_total,
    salaryAndCommission,
    cashOnHand:
      nonCash === null ? null : report.revenue_total - nonCash - report.expense_total - salaryAndCommission,
  }
}
