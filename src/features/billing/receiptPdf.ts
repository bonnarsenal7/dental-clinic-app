import { jsPDF } from 'jspdf'
import { CLINIC_NAME } from '../../core/branding'
import { formatMoney, invoiceBalance, invoicePaid, invoiceTotal } from './ledger'
import type { InvoiceWithDetail } from './types'

interface ReceiptContext {
  invoice: InvoiceWithDetail
  patientName: string
  clinicName: string
  operatingHours: string
}

const MARGIN = 48
const PAGE_WIDTH = 595 // A4 at 72dpi
const RIGHT = PAGE_WIDTH - MARGIN

/** Renders the receipt and hands it to the browser.
 *
 *  `output('dataurlnewwindow')` is deliberately not used: it's blocked by
 *  popup blockers and renders poorly on tablets, which is where the clinic
 *  actually prints from. A direct save gives the tablet's own PDF viewer
 *  the file, and its share sheet handles printing. */
export function downloadReceipt(context: ReceiptContext) {
  const doc = buildReceipt(context)
  const number = receiptNumber(context.invoice)
  doc.save(`receipt-${number}.pdf`)
}

/** Short, human-quotable identifier derived from the invoice's uuid — a
 *  uuid is unusable over the phone. Not a sequential OR number; if the
 *  clinic needs one of those for BIR purposes it goes in payments.reference. */
export function receiptNumber(invoice: InvoiceWithDetail): string {
  return invoice.id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function buildReceipt({ invoice, patientName, clinicName, operatingHours }: ReceiptContext): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(clinicName || CLINIC_NAME, MARGIN, y)
  y += 16

  if (operatingHours) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110)
    doc.text(operatingHours, MARGIN, y)
    y += 14
  }

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text('RECEIPT', MARGIN, y + 8)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110)
  doc.text(`No. ${receiptNumber(invoice)}`, RIGHT, y + 8, { align: 'right' })
  y += 24

  doc.setDrawColor(200).line(MARGIN, y, RIGHT, y)
  y += 20

  doc.setTextColor(0).setFontSize(10)
  doc.text(`Patient: ${patientName}`, MARGIN, y)
  doc.text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, RIGHT, y, {
    align: 'right',
  })
  y += 26

  // Line items
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110)
  doc.text('PROCEDURE', MARGIN, y)
  doc.text('FEE', RIGHT, y, { align: 'right' })
  y += 6
  doc.setDrawColor(220).line(MARGIN, y, RIGHT, y)
  y += 16

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(0)
  for (const item of invoice.invoice_items) {
    const label = item.tooth_number ? `${item.description} — tooth ${item.tooth_number}` : item.description
    // Wrap rather than overflow into the fee column.
    const lines = doc.splitTextToSize(label, RIGHT - MARGIN - 90) as string[]
    doc.text(lines, MARGIN, y)
    doc.text(formatMoney(Number(item.amount)), RIGHT, y, { align: 'right' })
    y += Math.max(lines.length, 1) * 14
  }

  if (invoice.invoice_items.length === 0) {
    doc.setTextColor(140).text('No line items.', MARGIN, y)
    doc.setTextColor(0)
    y += 14
  }

  y += 6
  doc.setDrawColor(220).line(MARGIN, y, RIGHT, y)
  y += 18

  const total = invoiceTotal(invoice)
  const paid = invoicePaid(invoice)
  const balance = invoiceBalance(invoice)

  const summary: [string, string, boolean][] = [
    ['Total', formatMoney(total), false],
    ['Paid', formatMoney(paid), false],
    ['Balance', formatMoney(balance), true],
  ]
  for (const [label, value, bold] of summary) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 11 : 10)
    doc.text(label, RIGHT - 140, y, { align: 'right' })
    doc.text(value, RIGHT, y, { align: 'right' })
    y += bold ? 18 : 15
  }

  // Payment history — what was actually settled and how.
  if (invoice.payments.length > 0) {
    y += 12
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(110)
    doc.text('PAYMENTS RECEIVED', MARGIN, y)
    y += 6
    doc.setDrawColor(220).line(MARGIN, y, RIGHT, y)
    y += 15

    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(0)
    for (const payment of invoice.payments) {
      const method = payment.method.replace('_', ' ')
      const ref = payment.reference ? ` · ref ${payment.reference}` : ''
      doc.text(`${new Date(payment.paid_at).toLocaleDateString()} — ${method}${ref}`, MARGIN, y)
      doc.text(formatMoney(Number(payment.amount)), RIGHT, y, { align: 'right' })
      y += 13
    }
  }

  y += 26
  doc.setFontSize(8).setTextColor(140)
  doc.text(
    balance > 0
      ? 'This receipt reflects payments received to date. A balance remains outstanding.'
      : 'Paid in full. Thank you.',
    MARGIN,
    y,
  )

  return doc
}
