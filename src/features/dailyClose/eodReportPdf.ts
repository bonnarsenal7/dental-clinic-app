import { jsPDF } from 'jspdf'
import { CLINIC_NAME } from '../../core/branding'
import { buildReportPatientTable, buildReportPayTable, buildReportSummary } from './reportSections'
import { pdfMoney } from '../billing/ledger'
import type { ClinicDayReport } from './types'

const MARGIN = 40
const PAGE_WIDTH = 595 // A4 at 72dpi
const PAGE_BOTTOM = 842 - 48
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
/** Four equal columns, like the clinic's spreadsheet. */
const COL_WIDTH = CONTENT_WIDTH / 4
const PAD = 5
const LINE = 11
const ROW_MIN = 20

const GRID = 215
const SECTION_GREY = 90
const RED: [number, number, number] = [200, 30, 30]

type Cell =
  | string
  | null
  | {
      text: string
      bold?: boolean
      /** How many columns the cell covers. */
      span?: number
      color?: number | [number, number, number]
      size?: number
    }

/** Builds the end-of-day report from the frozen figures and saves it.
 *
 *  Laid out as the clinic's own EOD sheet: a four-column grid with Today's
 *  patients, Expenses, Salary & commission, an Overall summary and Today's
 *  cash on hand.
 *
 *  Loaded on demand from the dashboard: jsPDF is the heaviest thing in the
 *  app, and it is needed once a day. `doc.save()` rather than a new window,
 *  for the same reason as receipts — popup blockers and tablets. */
export function downloadClinicDayReport(report: ClinicDayReport, clinicName: string | null) {
  buildReport(report, clinicName).save(`eod-report-${report.business_date}.pdf`)
}

function buildReport(report: ClinicDayReport, clinicName: string | null): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN
  const notes: string[] = []

  /** One grid row. Cells wrap within their column; the row grows to fit. */
  const row = (cells: Cell[]) => {
    const laid: { x: number; width: number; lines: string[]; cell: Exclude<Cell, string | null> }[] = []
    let col = 0
    for (const raw of cells) {
      if (col >= 4) break
      const cell = raw === null ? { text: '' } : typeof raw === 'string' ? { text: raw } : raw
      const span = Math.min(cell.span ?? 1, 4 - col)
      const width = COL_WIDTH * span
      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal').setFontSize(cell.size ?? 8.5)
      const lines = cell.text ? (doc.splitTextToSize(cell.text, width - PAD * 2) as string[]) : []
      laid.push({ x: MARGIN + col * COL_WIDTH, width, lines, cell })
      col += span
    }
    // Pad the row out to four columns so the grid is complete.
    while (col < 4) {
      laid.push({ x: MARGIN + col * COL_WIDTH, width: COL_WIDTH, lines: [], cell: { text: '' } })
      col += 1
    }

    const height = Math.max(ROW_MIN, Math.max(...laid.map((c) => c.lines.length)) * LINE + 9)
    if (y + height > PAGE_BOTTOM) {
      doc.addPage()
      y = MARGIN
    }

    doc.setDrawColor(GRID).setLineWidth(0.5)
    doc.line(MARGIN, y + height, MARGIN + CONTENT_WIDTH, y + height)
    for (const c of laid) {
      if (c.x > MARGIN) doc.line(c.x, y, c.x, y + height)
      if (c.lines.length === 0) continue
      const { cell } = c
      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal').setFontSize(cell.size ?? 8.5)
      if (Array.isArray(cell.color)) doc.setTextColor(...cell.color)
      else doc.setTextColor(cell.color ?? 0)
      doc.text(c.lines, c.x + PAD, y + 13)
    }
    doc.setTextColor(0)
    y += height
  }

  const blank = () => row([])
  const section = (title: string) =>
    row([{ text: title.toUpperCase(), bold: true, color: SECTION_GREY, size: 9, span: 4 }])
  const message = (text: string) => row([{ text, color: 120, span: 4 }])
  const total = (label: string, amount: string) =>
    row([null, null, { text: label, bold: true }, { text: amount, bold: true }])

  // --- Header
  doc
    .setDrawColor(GRID)
    .setLineWidth(0.5)
    .line(MARGIN, y, MARGIN + CONTENT_WIDTH, y)
  row([{ text: clinicName || CLINIC_NAME, bold: true, size: 11, span: 4 }])
  row([{ text: 'END-OF-DAY REPORT', bold: true, span: 4 }])
  const date = new Date(`${report.business_date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const closed = new Date(report.closed_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  row([
    { text: date, span: 3 },
    `Closed ${closed}${report.closed_by_name ? ` by ${report.closed_by_name}` : ''}`,
  ])
  blank()

  // --- Today's patients
  section("Today's patients")
  row(['NAME', 'PROCEDURE', 'METHOD', 'AMOUNT'])
  const patients = buildReportPatientTable(report)
  if (patients === null) message('Patient list not recorded for this day.')
  else if (patients.length === 0) message('No payments recorded.')
  else for (const p of patients) row([p.name, p.procedure, p.method, p.amount])
  blank()
  total('REVENUE COLLECTED', pdfMoney(report.revenue_total))
  blank()

  // --- Expenses
  section('Expenses')
  row([{ text: 'DESCRIPTION', span: 3 }, 'AMOUNT'])
  if (report.expenses.length === 0) message('No expenses recorded.')
  for (const e of report.expenses) row([{ text: e.description, span: 3 }, pdfMoney(e.amount)])
  blank()
  total('TOTAL', pdfMoney(report.expense_total))
  blank()

  // --- Salary & commission
  section('Salary & commission')
  row(['DENTIST', 'SALARY', 'COMMISSION', 'TOTAL'])
  const pay = buildReportPayTable(report)
  if (pay.rows.length === 0) message('No salary or commission recorded.')
  pay.rows.forEach((r, i) => row([`${i + 1}. ${r.label}`, r.salary, r.commission, r.total]))
  blank()
  total('TOTAL', pay.footer.total)
  blank()
  if (!pay.commissionByDentistRecorded) {
    // Closed before the breakdown was frozen into reports (0022). Not
    // reconstructed: the report is what was closed.
    notes.push('Per-dentist commission not recorded for this day; commission is shown as a total only.')
  }

  // --- Overall summary
  const summary = buildReportSummary(report)
  section('Overall summary')
  row(['REVENUE COLLECTED', 'Bank & Digital Transactions', 'EXPENSES', 'SALARY & COMMISSION'])
  row([
    { text: pdfMoney(summary.revenue), bold: true },
    { text: summary.nonCash === null ? '-' : pdfMoney(summary.nonCash), bold: true },
    { text: pdfMoney(summary.expenses), bold: true },
    { text: pdfMoney(summary.salaryAndCommission), bold: true },
  ])
  blank()
  blank()
  row([null, null, null, { text: "TODAY'S COH", bold: true, color: RED }])
  row([
    null,
    null,
    null,
    { text: summary.cashOnHand === null ? '-' : pdfMoney(summary.cashOnHand), bold: true, color: RED },
  ])
  if (summary.cashOnHand === null) {
    // Closed before the non-cash total was frozen (0027).
    notes.push('Bank & digital total not recorded for this day, so cash on hand cannot be shown.')
  }

  // --- Notes under the grid
  notes.push(
    'COH = revenue collected - bank & digital - expenses - salary & commission.',
    'Figures as at closing. Payments recorded after closing are not included.',
  )
  y += 14
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130)
  for (const n of notes) {
    if (y + 12 > PAGE_BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
    doc.text(n, MARGIN, y)
    y += 12
  }

  return doc
}
