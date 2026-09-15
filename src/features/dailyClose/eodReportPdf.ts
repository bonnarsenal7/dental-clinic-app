import { jsPDF } from 'jspdf'
import { CLINIC_NAME } from '../../core/branding'
import { buildReportPayTable, pdfMoney } from './reportSections'
import type { ClinicDayReport } from './types'

const MARGIN = 48
const PAGE_WIDTH = 595 // A4 at 72dpi
const PAGE_BOTTOM = 842 - 56
const RIGHT = PAGE_WIDTH - MARGIN

/** Builds the end-of-day report from the frozen figures and saves it.
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

  const ensure = (space: number) => {
    if (y + space > PAGE_BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
  }

  const heading = (text: string) => {
    ensure(48)
    y += 12
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110)
    doc.text(text.toUpperCase(), MARGIN, y)
    y += 6
    doc.setDrawColor(220).line(MARGIN, y, RIGHT, y)
    y += 16
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0)
  }

  const row = (label: string, amount: number, opts: { bold?: boolean; indent?: number } = {}) => {
    const indent = opts.indent ?? 0
    doc
      .setFont('helvetica', opts.bold ? 'bold' : 'normal')
      .setFontSize(10)
      .setTextColor(0)
    // Wrap rather than overflow into the amount column.
    const lines = doc.splitTextToSize(label, RIGHT - MARGIN - indent - 120) as string[]
    ensure(lines.length * 14)
    doc.text(lines, MARGIN + indent, y)
    doc.text(pdfMoney(amount), RIGHT, y, { align: 'right' })
    y += Math.max(lines.length, 1) * 14
  }

  const note = (text: string) => {
    ensure(14)
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(140)
    doc.text(text, MARGIN, y)
    doc.setTextColor(0)
    y += 14
  }

  // --- Header
  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(clinicName || CLINIC_NAME, MARGIN, y)
  y += 20
  doc.setFontSize(11).text('END-OF-DAY REPORT', MARGIN, y)
  y += 16
  doc.setFont('helvetica', 'normal').setFontSize(10)
  doc.text(
    new Date(`${report.business_date}T00:00:00`).toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    MARGIN,
    y,
  )
  const closed = new Date(report.closed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  doc.setFontSize(9).setTextColor(110)
  doc.text(`Closed ${closed}${report.closed_by_name ? ` by ${report.closed_by_name}` : ''}`, RIGHT, y, {
    align: 'right',
  })
  doc.setTextColor(0)
  y += 8

  // --- Summary
  heading('Summary')
  row('Revenue collected', report.revenue_total)
  row('Expenses', report.expense_total)
  row('Salary', report.salary_total)
  row('Commission', report.commission_total)
  y += 4
  row('Net (revenue - expenses - salary)', report.net_total, { bold: true })

  // --- Expenses
  heading('Expenses')
  if (report.expenses.length === 0) note('No expenses recorded.')
  for (const e of report.expenses) row(e.description, e.amount)
  row('Total expenses', report.expense_total, { bold: true })

  // --- Salary & commission: the dashboard's combined table on paper
  heading('Salary & commission')
  const pay = buildReportPayTable(report)

  // Three right-aligned money columns, the dentist's name wrapping in the rest.
  const COL_TOTAL = RIGHT
  const COL_COMMISSION = RIGHT - 95
  const COL_SALARY = RIGHT - 190
  const NAME_WIDTH = COL_SALARY - 95 - MARGIN

  const payRow = (
    cells: { label: string; salary: string; commission: string; total: string },
    bold = false,
  ) => {
    doc
      .setFont('helvetica', bold ? 'bold' : 'normal')
      .setFontSize(10)
      .setTextColor(0)
    const lines = doc.splitTextToSize(cells.label, NAME_WIDTH) as string[]
    ensure(lines.length * 14)
    doc.text(lines, MARGIN, y)
    doc.text(cells.salary, COL_SALARY, y, { align: 'right' })
    doc.text(cells.commission, COL_COMMISSION, y, { align: 'right' })
    doc.text(cells.total, COL_TOTAL, y, { align: 'right' })
    y += Math.max(lines.length, 1) * 14
  }

  if (pay.rows.length === 0) {
    note('No salary or commission recorded.')
  } else {
    ensure(16)
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(110)
    doc.text('DENTIST', MARGIN, y)
    doc.text('SALARY', COL_SALARY, y, { align: 'right' })
    doc.text('COMMISSION', COL_COMMISSION, y, { align: 'right' })
    doc.text('TOTAL', COL_TOTAL, y, { align: 'right' })
    y += 14

    for (const r of pay.rows) payRow(r)

    ensure(20)
    doc.setDrawColor(220).line(MARGIN, y - 9, RIGHT, y - 9)
    y += 4
    payRow(pay.footer, true)
  }

  if (!pay.commissionByDentistRecorded) {
    // Closed before the breakdown was frozen into reports (0022). Not
    // reconstructed: the report is what was closed.
    note('Per-dentist commission not recorded for this day; commission is shown as a total only.')
  }

  note("Commission on the day's invoices, by the dentist who treated the patient.")

  y += 12
  note('Figures as at closing. Payments recorded after closing are not included.')

  return doc
}
