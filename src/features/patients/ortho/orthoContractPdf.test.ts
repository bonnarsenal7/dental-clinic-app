import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrthoContractDetails } from './orthoContract'

/** jsPDF draws to a canvas, so the page is not assertable here — but what it
 *  is asked to write is. Same double as billing's receipt test. */
const drawn = vi.hoisted(() => ({ text: [] as string[], images: 0, savedAs: '' }))

vi.mock('jspdf', () => {
  class FakeDoc {
    pages = 1
    setFont() {
      return this
    }
    setFontSize() {
      return this
    }
    setTextColor() {
      return this
    }
    setDrawColor() {
      return this
    }
    line() {
      return this
    }
    rect() {
      return this
    }
    circle() {
      return this
    }
    addPage() {
      this.pages += 1
      return this
    }
    setPage() {
      return this
    }
    getNumberOfPages() {
      return this.pages
    }
    addImage() {
      drawn.images += 1
      return this
    }
    splitTextToSize(text: string) {
      return [text]
    }
    text(value: string | string[]) {
      drawn.text.push(...(Array.isArray(value) ? value : [value]))
      return this
    }
    output() {
      return new Blob(['%PDF'])
    }
    save(name: string) {
      drawn.savedAs = name
    }
  }
  return { jsPDF: FakeDoc }
})

const { renderOrthoContract } = await import('./orthoContractPdf')
const { orthoContractFileName } = await import('./orthoContract')

const DETAILS: OrthoContractDetails = {
  patientName: 'Maria Clara Santos',
  patientAge: 15,
  packageId: 'conv-b',
  fee: 50000,
  signedByName: 'Rosa Santos',
  signerRelationshipLabel: 'Parent',
  signedOn: '2026-09-29',
  patientSignatureDataUrl: 'data:image/png;base64,P',
  dentistSignatureDataUrl: null,
}

describe('orthodontic contract PDF', () => {
  beforeEach(() => {
    drawn.text = []
    drawn.images = 0
    drawn.savedAs = ''
  })

  it('is named after the patient and the signing date', () => {
    const pdf = renderOrthoContract(DETAILS, 'ToothCo')
    expect(pdf.fileName).toBe('Maria Clara Santos - 2026-09-29.pdf')
    pdf.save()
    expect(drawn.savedAs).toBe('Maria Clara Santos - 2026-09-29.pdf')
  })

  it('drops characters a file name cannot carry', () => {
    expect(orthoContractFileName('Juan / "Jun" Dela Cruz', '2026-09-29')).toBe(
      'Juan Jun Dela Cruz - 2026-09-29.pdf',
    )
  })

  it('writes the patient, the fee, the signer and the date onto the form', () => {
    renderOrthoContract(DETAILS, 'ToothCo')
    const all = drawn.text.join('\n')
    expect(all).toMatch(/Patient's Name and Age: Maria Clara Santos, 15/)
    expect(all).toMatch(/regular fee for orthodontic treatment is P 50,000/)
    expect(all).toMatch(/Rosa Santos \(Parent\)/)
    expect(all).toMatch(/Date: 2026-09-29/)
    expect(all).not.toMatch(/\{FEE\}/)
  })

  it('carries the signature image, and the dentist line blank when unsigned', () => {
    renderOrthoContract(DETAILS, 'ToothCo')
    expect(drawn.images).toBe(1)
    expect(drawn.text).toContain('Date: ____________________')
    drawn.images = 0
    renderOrthoContract({ ...DETAILS, dentistSignatureDataUrl: 'data:image/png;base64,D' }, 'ToothCo')
    expect(drawn.images).toBe(2)
  })

  // A discount must not leave the agreed fee beside a different package
  // price with nothing explaining the gap.
  it('prints the agreed fee beside the package it discounts', () => {
    renderOrthoContract({ ...DETAILS, packageId: 'conv-b', fee: 45000 }, 'ToothCo')
    const all = drawn.text.join('\n')
    expect(all).toMatch(/regular fee for orthodontic treatment is P 45,000/)
    expect(all).toContain('Agreed fee: P 45,000 (package price P 50,000)')
  })

  it('says nothing extra when the package price is the fee', () => {
    renderOrthoContract({ ...DETAILS, packageId: 'conv-b', fee: 50000 }, 'ToothCo')
    expect(drawn.text.join('\n')).not.toMatch(/Agreed fee/)
  })

  // jsPDF's built-in Helvetica cannot draw the peso sign or typographic
  // bullets — they come out as garbage on paper.
  it('never asks Helvetica for a character it cannot draw', () => {
    renderOrthoContract(DETAILS, 'ToothCo')
    for (const t of drawn.text) expect(t).not.toMatch(/[₱•‘’“”]/)
  })
})
