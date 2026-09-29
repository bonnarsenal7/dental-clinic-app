import { jsPDF } from 'jspdf'
import {
  ORTHO_ACKNOWLEDGMENTS,
  ORTHO_ADD_ONS,
  ORTHO_CONTRACT_VERSION,
  ORTHO_INTRO,
  ORTHO_PACKAGES,
  ORTHO_SECTIONS,
  ORTHO_UNDERSTANDING,
  orthoContractFileName,
  orthoMoney,
  withFee,
  type OrthoContractDetails,
} from './orthoContract'

const MARGIN = 48
const PAGE_WIDTH = 595 // A4 at 72dpi
const PAGE_HEIGHT = 842
const RIGHT = PAGE_WIDTH - MARGIN
const BOTTOM = PAGE_HEIGHT - MARGIN
const TEXT_WIDTH = RIGHT - MARGIN

/** The signed orthodontic consent form as a PDF, laid out after the clinic's
 *  paper original: the clauses, the package table with the chosen package
 *  ticked, the add-ons, the acknowledgment and both signature blocks.
 *
 *  Only jsPDF's built-in Helvetica is used, so the text sticks to characters
 *  it can draw — no peso sign, no typographic bullets (bullets and tick boxes
 *  are drawn as shapes instead). */
export function buildOrthoContractPdf(details: OrthoContractDetails, clinicName: string): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  let y = MARGIN

  /** Starts a new page when the next block would run off this one. */
  function room(height: number) {
    if (y + height > BOTTOM) {
      doc.addPage()
      y = MARGIN
    }
  }

  function paragraph(text: string, x = MARGIN, width = TEXT_WIDTH, lineHeight = 13) {
    const lines = doc.splitTextToSize(text, width) as string[]
    room(lines.length * lineHeight)
    doc.text(lines, x, y)
    y += lines.length * lineHeight
  }

  function bullet(text: string, indent: number, filled: boolean) {
    const lines = doc.splitTextToSize(text, TEXT_WIDTH - indent - 12) as string[]
    room(lines.length * 13)
    if (filled) doc.circle(MARGIN + indent + 2, y - 3, 1.6, 'F')
    else doc.circle(MARGIN + indent + 2, y - 3, 1.8, 'S')
    doc.text(lines, MARGIN + indent + 12, y)
    y += lines.length * 13
  }

  // --- Heading ---------------------------------------------------------
  if (clinicName) {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(110)
    doc.text(clinicName, PAGE_WIDTH / 2, y, { align: 'center' })
    y += 16
  }
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(0)
  doc.text('ORTHODONTIC TREATMENT CONSENT FORM', PAGE_WIDTH / 2, y, { align: 'center' })
  y += 26

  doc.setFont('helvetica', 'normal').setFontSize(10)
  paragraph(ORTHO_INTRO)
  y += 4
  const age = details.patientAge === null ? '' : `, ${details.patientAge}`
  doc.setFont('helvetica', 'bold')
  paragraph(`Patient's Name and Age: ${details.patientName}${age}`)
  doc.setFont('helvetica', 'normal')
  y += 6
  paragraph(ORTHO_UNDERSTANDING)
  y += 6

  // --- Clauses ---------------------------------------------------------
  const fee = orthoMoney(details.fee)
  for (const section of ORTHO_SECTIONS) {
    room(30)
    doc.setFont('helvetica', 'bold')
    bullet(section.heading, 6, true)
    doc.setFont('helvetica', 'normal')
    for (const point of section.points) bullet(withFee(point, fee), 24, false)
    y += 3
  }

  // --- Packages --------------------------------------------------------
  // On a page of their own, as on the paper form.
  doc.addPage()
  y = MARGIN
  doc.setFont('helvetica', 'bold').setFontSize(11)
  paragraph('PACKAGE DEALS')
  doc.setFontSize(10)
  y += 4
  let group = ''
  for (const pkg of ORTHO_PACKAGES) {
    if (pkg.group !== group) {
      group = pkg.group
      room(40)
      doc.setFont('helvetica', 'bold').setTextColor(90)
      paragraph(group.toUpperCase())
      doc.setTextColor(0)
      y += 2
    }
    const chosen = pkg.id === details.packageId
    doc.setFontSize(9)
    const terms = doc.splitTextToSize(pkg.terms.join('   |   '), TEXT_WIDTH - 22) as string[]
    doc.setFontSize(10)
    room(16 + terms.length * 11)
    // Tick box, filled with a cross for the one availed.
    doc.setDrawColor(0).rect(MARGIN + 4, y - 9, 10, 10, 'S')
    if (chosen) {
      doc.line(MARGIN + 6, y - 7, MARGIN + 12, y - 1)
      doc.line(MARGIN + 12, y - 7, MARGIN + 6, y - 1)
    }
    doc.setFont('helvetica', chosen ? 'bold' : 'normal')
    doc.text(`${pkg.label} - ${orthoMoney(pkg.total)}`, MARGIN + 22, y)
    y += 13
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70)
    doc.text(terms, MARGIN + 22, y)
    doc.setFontSize(10).setTextColor(0)
    y += terms.length * 11 + 5
    // A discounted fee is said beside the package it discounts, so the
    // agreed figure never sits next to a different price with nothing
    // explaining the gap.
    if (chosen && details.fee !== pkg.total) {
      room(14)
      doc.setFont('helvetica', 'bold').setFontSize(9)
      doc.text(
        `Agreed fee: ${orthoMoney(details.fee)} (package price ${orthoMoney(pkg.total)})`,
        MARGIN + 22,
        y,
      )
      doc.setFont('helvetica', 'normal').setFontSize(10)
      y += 14
    }
  }

  y += 4
  room(30)
  doc.setFont('helvetica', 'bold')
  paragraph('Other add-ons')
  doc.setFont('helvetica', 'normal').setFontSize(9)
  for (const addOn of ORTHO_ADD_ONS) bullet(addOn, 6, true)
  doc.setFontSize(10)

  // --- Acknowledgment and signatures ----------------------------------
  y += 12
  room(60)
  doc.setFont('helvetica', 'bold').setFontSize(11)
  paragraph('Acknowledgment')
  doc.setFont('helvetica', 'normal').setFontSize(10)
  y += 2
  for (const line of ORTHO_ACKNOWLEDGMENTS) bullet(line, 6, true)

  // Both signature blocks stay together on one page.
  y += 16
  room(150)
  const colWidth = (TEXT_WIDTH - 30) / 2
  const leftX = MARGIN
  const rightX = MARGIN + colWidth + 30
  const imageTop = y
  const imageHeight = 64
  const imageWidth = Math.min(colWidth, imageHeight * (460 / 180))

  doc.addImage(details.patientSignatureDataUrl, 'PNG', leftX, imageTop, imageWidth, imageHeight)
  if (details.dentistSignatureDataUrl) {
    doc.addImage(details.dentistSignatureDataUrl, 'PNG', rightX, imageTop, imageWidth, imageHeight)
  }
  y = imageTop + imageHeight + 4
  doc.setDrawColor(0).line(leftX, y, leftX + colWidth, y)
  doc.line(rightX, y, rightX + colWidth, y)
  y += 13
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text("Patient's/Guardian's Signature", leftX, y)
  doc.text("Dentist's Signature", rightX, y)
  y += 13
  doc.setFont('helvetica', 'normal')
  doc.text(`${details.signedByName} (${details.signerRelationshipLabel})`, leftX, y)
  doc.text(details.dentistSignatureDataUrl ? 'Dr. Abella' : '', rightX, y)
  y += 13
  doc.text(`Date: ${details.signedOn}`, leftX, y)
  doc.text(
    details.dentistSignatureDataUrl ? `Date: ${details.signedOn}` : 'Date: ____________________',
    rightX,
    y,
  )

  // Footer: which wording this was, on every page.
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130)
    doc.text(
      `Form version ${ORTHO_CONTRACT_VERSION} - page ${i} of ${pages}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - 24,
      {
        align: 'center',
      },
    )
  }
  doc.setTextColor(0)

  return doc
}

/** The finished PDF and the name to file it under. */
export function renderOrthoContract(
  details: OrthoContractDetails,
  clinicName: string,
): { blob: Blob; fileName: string; save: () => void } {
  const doc = buildOrthoContractPdf(details, clinicName)
  const fileName = orthoContractFileName(details.patientName, details.signedOn)
  return { blob: doc.output('blob'), fileName, save: () => doc.save(fileName) }
}
