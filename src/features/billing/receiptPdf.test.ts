import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InvoiceWithDetail } from './types'

/** jsPDF draws to a canvas, so the page itself is not assertable here — but
 *  what it is asked to *write* is. The double records every string handed to
 *  `text()`, which is enough to catch the one thing that went wrong on paper:
 *  the peso sign, which jsPDF's built-in Helvetica cannot draw. */
const drawn = vi.hoisted(() => ({ text: [] as string[], savedAs: '' }))

vi.mock('jspdf', () => {
  class FakeDoc {
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
    splitTextToSize(text: string) {
      return [text]
    }
    text(value: string | string[]) {
      drawn.text.push(...(Array.isArray(value) ? value : [value]))
      return this
    }
    save(name: string) {
      drawn.savedAs = name
    }
  }
  return { jsPDF: FakeDoc }
})

const { downloadReceipt } = await import('./receiptPdf')

const INVOICE: InvoiceWithDetail = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  patient_id: 'p-1',
  visit_id: 'v-1',
  status: 'partial',
  total_amount: 4500,
  commission_amount: 0,
  created_by: null,
  created_at: '2026-09-28T02:00:00Z',
  invoice_items: [
    {
      id: 'i-1',
      invoice_id: 'a1b2c3d4-0000-0000-0000-000000000000',
      description: 'Composite filling',
      amount: 1500,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: 16,
      created_at: '2026-09-28T02:00:00Z',
    },
    {
      id: 'i-2',
      invoice_id: 'a1b2c3d4-0000-0000-0000-000000000000',
      description: 'Crown',
      amount: 3000,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: null,
      created_at: '2026-09-28T02:00:00Z',
    },
  ],
  payments: [
    {
      id: 'pay-1',
      invoice_id: 'a1b2c3d4-0000-0000-0000-000000000000',
      amount: 2000,
      method: 'cash',
      reference: null,
      received_by: null,
      paid_at: '2026-09-28T03:00:00Z',
    },
  ],
}

describe('receipt PDF', () => {
  beforeEach(() => {
    drawn.text.length = 0
    drawn.savedAs = ''
    downloadReceipt({
      invoice: INVOICE,
      patientName: 'Maria Clara Santos',
      clinicName: '',
      operatingHours: '',
    })
  })

  it('never writes the peso sign, which the PDF font cannot draw', () => {
    expect(drawn.text.join('\n')).not.toContain('₱')
  })

  // Every amount on the receipt: each line, total, paid, balance, payment.
  it('writes every amount as P and the figure', () => {
    for (const amount of ['P 1,500.00', 'P 3,000.00', 'P 4,500.00', 'P 2,000.00', 'P 2,500.00']) {
      expect(drawn.text).toContain(amount)
    }
  })

  it('saves under the short receipt number', () => {
    expect(drawn.savedAs).toBe('receipt-A1B2C3D4.pdf')
  })
})
