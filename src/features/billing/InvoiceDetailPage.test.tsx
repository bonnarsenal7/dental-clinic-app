import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvoiceDetailPage from './InvoiceDetailPage'
import type { InvoiceWithDetail } from './types'

vi.mock('./api', () => ({ getInvoice: vi.fn(), recordPayment: vi.fn(), voidInvoice: vi.fn() }))
vi.mock('./receiptPdf', () => ({ downloadReceipt: vi.fn(), receiptNumber: () => 'ABCD1234' }))
vi.mock('../patients/api', () => ({ getPatient: vi.fn() }))
vi.mock('../../core/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { clinic_name: 'ToothCo Dental Clinic', operating_hours: '' } }) }) }) }) },
}))

const role = { current: 'receptionist' as 'receptionist' | 'admin' }
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: role.current } }),
}))

const api = await import('./api')
const patients = await import('../patients/api')
const receipt = await import('./receiptPdf')

function invoice(partial: Partial<InvoiceWithDetail> = {}): InvoiceWithDetail {
  return {
    id: 'inv-1', patient_id: 'pat-1', visit_id: 'visit-1', status: 'partial',
    total_amount: 3000, created_by: null, created_at: '2026-09-11T01:00:00Z',
    invoice_items: [
      { id: 'it-1', invoice_id: 'inv-1', description: 'Composite filling', amount: 1800, procedure_id: null, tooth_record_id: null, tooth_number: 16, created_at: '2026-09-11T01:00:00Z' },
      { id: 'it-2', invoice_id: 'inv-1', description: 'Oral prophylaxis', amount: 1200, procedure_id: null, tooth_record_id: null, tooth_number: null, created_at: '2026-09-11T01:00:00Z' },
    ],
    payments: [
      { id: 'pm-1', invoice_id: 'inv-1', amount: 1000, method: 'cash', reference: 'OR-1', received_by: null, paid_at: '2026-09-11T02:00:00Z' },
    ],
    ...partial,
  }
}

const renderPage = () => render(
  <MemoryRouter initialEntries={['/invoices/inv-1']}>
    <Routes><Route path="/invoices/:id" element={<InvoiceDetailPage />} /></Routes>
  </MemoryRouter>,
)

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    role.current = 'receptionist'
    vi.mocked(api.getInvoice).mockResolvedValue(invoice())
    vi.mocked(patients.getPatient).mockResolvedValue({ id: 'pat-1', name: 'Maria Clara Santos' } as never)
    vi.mocked(api.recordPayment).mockResolvedValue(undefined)
    vi.mocked(api.voidInvoice).mockResolvedValue(undefined)
  })

  it('shows the lines, the total, and what is still owed', async () => {
    renderPage()
    expect(await screen.findByText(/composite filling/i)).toBeInTheDocument()
    expect(screen.getByText(/tooth 16/i)).toBeInTheDocument()
    expect(screen.getByText('₱3,000.00')).toBeInTheDocument()
    expect(screen.getByText('₱2,000.00')).toBeInTheDocument() // balance
  })

  it('records a payment and refetches rather than doing local arithmetic', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await user.type(screen.getByLabelText(/amount/i), '500')
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(api.recordPayment).toHaveBeenCalled())
    expect(vi.mocked(api.recordPayment).mock.calls[0][0]).toMatchObject({ amount: 500, method: 'cash' })
    // Totals are trigger-derived, so the screen must re-read them.
    expect(api.getInvoice).toHaveBeenCalledTimes(2)
  })

  // The form sets noValidate and lets react-hook-form validate, so the
  // message is the app's own and points at the field — rather than a
  // browser-native bubble, which differs per browser and can't be styled.
  it('refuses an empty payment, with a message', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter an amount/i)
    expect(api.recordPayment).not.toHaveBeenCalled()
  })

  // Zero passes "required" but is still not a payment. The screen's own
  // guard catches what the field rule can't.
  it('refuses a zero payment', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await user.type(screen.getByLabelText(/amount/i), '0')
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a payment amount/i)
    expect(api.recordPayment).not.toHaveBeenCalled()
  })

  it('offers the receipt', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await user.click(screen.getByRole('button', { name: /download receipt/i }))
    expect(receipt.downloadReceipt).toHaveBeenCalled()
  })

  it('keeps voiding to admins', async () => {
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.queryByRole('button', { name: /void/i })).not.toBeInTheDocument()
  })

  it('lets an admin void', async () => {
    role.current = 'admin'
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.getByRole('button', { name: /void/i })).toBeInTheDocument()
  })

  // A voided invoice is not owed, so taking money against it is a mistake.
  it('stops payments once the invoice is void', async () => {
    vi.mocked(api.getInvoice).mockResolvedValue(invoice({ status: 'void' }))
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
    expect(screen.getByText(/excluded from the patient's balance/i)).toBeInTheDocument()
  })

  it('shows a refund as a negative payment', async () => {
    vi.mocked(api.getInvoice).mockResolvedValue(invoice({
      payments: [{ id: 'pm-2', invoice_id: 'inv-1', amount: -250, method: 'cash', reference: null, received_by: null, paid_at: '2026-09-11T03:00:00Z' }],
    }))
    renderPage()
    expect(await screen.findAllByText(/-₱250\.00/)).not.toHaveLength(0)
  })

  it('says payments cannot be edited', async () => {
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.getByText(/can't be edited or deleted/i)).toBeInTheDocument()
  })
})
