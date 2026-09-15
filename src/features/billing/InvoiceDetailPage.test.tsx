import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvoiceDetailPage from './InvoiceDetailPage'
import type { InvoiceWithDetail } from './types'

vi.mock('./api', () => ({
  getInvoice: vi.fn(),
  recordPayment: vi.fn(),
  voidInvoice: vi.fn(),
  setInvoiceCommission: vi.fn(),
}))
vi.mock('./receiptPdf', () => ({
  downloadReceipt: vi.fn(),
  receiptNumber: () => 'ABCD1234',
}))
vi.mock('../patients/api', () => ({ getPatient: vi.fn() }))
vi.mock('../scheduling/api', () => ({ completeAwaitingForVisit: vi.fn() }))
vi.mock('../../core/components/ui/toast', () => ({ toastSaved: vi.fn() }))
vi.mock('../../core/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { clinic_name: 'ToothCo Dental Clinic', operating_hours: '' },
          }),
        }),
      }),
    }),
  },
}))

const role = { current: 'receptionist' as 'receptionist' | 'admin' }
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: role.current } }),
}))

const api = await import('./api')
const patients = await import('../patients/api')
const receipt = await import('./receiptPdf')
const toast = await import('../../core/components/ui/toast')
const scheduling = await import('../scheduling/api')

/** The amount box arrives pre-filled with the balance; typing appends to it. */
async function enterAmount(user: ReturnType<typeof userEvent.setup>, value: string) {
  const box = screen.getByLabelText(/amount/i)
  await user.clear(box)
  if (value) await user.type(box, value)
}

function invoice(partial: Partial<InvoiceWithDetail> = {}): InvoiceWithDetail {
  return {
    id: 'inv-1',
    patient_id: 'pat-1',
    visit_id: 'visit-1',
    status: 'partial',
    total_amount: 3000,
    commission_amount: 0,
    created_by: null,
    created_at: '2026-09-11T01:00:00Z',
    invoice_items: [
      {
        id: 'it-1',
        invoice_id: 'inv-1',
        description: 'Composite filling',
        amount: 1800,
        procedure_id: null,
        tooth_record_id: null,
        tooth_number: 16,
        created_at: '2026-09-11T01:00:00Z',
      },
      {
        id: 'it-2',
        invoice_id: 'inv-1',
        description: 'Oral prophylaxis',
        amount: 1200,
        procedure_id: null,
        tooth_record_id: null,
        tooth_number: null,
        created_at: '2026-09-11T01:00:00Z',
      },
    ],
    payments: [
      {
        id: 'pm-1',
        invoice_id: 'inv-1',
        amount: 1000,
        method: 'cash',
        reference: 'OR-1',
        received_by: null,
        paid_at: '2026-09-11T02:00:00Z',
      },
    ],
    ...partial,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/invoices/inv-1']}>
      <Routes>
        <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    role.current = 'receptionist'
    vi.mocked(api.getInvoice).mockResolvedValue(invoice())
    vi.mocked(patients.getPatient).mockResolvedValue({
      id: 'pat-1',
      name: 'Maria Clara Santos',
    } as never)
    vi.mocked(api.recordPayment).mockResolvedValue(undefined)
    vi.mocked(api.voidInvoice).mockResolvedValue(undefined)
    vi.mocked(scheduling.completeAwaitingForVisit).mockReset().mockResolvedValue(undefined)
  })

  // Arriving from the payment queue, the figure to take is already there.
  it('pre-fills the amount with what is owed', async () => {
    renderPage()
    await screen.findByText(/composite filling/i)
    await waitFor(() => expect(screen.getByLabelText(/amount/i)).toHaveValue(2000))
  })

  it('leaves the amount empty on a settled bill rather than suggesting zero', async () => {
    vi.mocked(api.getInvoice).mockResolvedValue(
      invoice({
        status: 'paid',
        payments: [
          {
            id: 'pm-1',
            invoice_id: 'inv-1',
            amount: 3000,
            method: 'cash',
            reference: null,
            received_by: null,
            paid_at: '2026-09-11T02:00:00Z',
          },
        ],
      }),
    )
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.getByLabelText(/amount/i)).toHaveValue(null)
  })

  describe('settling the bill', () => {
    const settled = () =>
      invoice({
        status: 'paid',
        payments: [
          {
            id: 'pm-1',
            invoice_id: 'inv-1',
            amount: 3000,
            method: 'cash',
            reference: null,
            received_by: null,
            paid_at: '2026-09-11T02:00:00Z',
          },
        ],
      })

    // So reception does not also have to press Complete on the schedule, and
    // the queue entry greys out.
    it('checks the patient out once the payment settles it', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getInvoice).mockResolvedValueOnce(invoice()).mockResolvedValueOnce(settled())
      renderPage()
      await screen.findByText(/composite filling/i)
      await user.click(screen.getByRole('button', { name: /record payment/i }))
      await waitFor(() => expect(scheduling.completeAwaitingForVisit).toHaveBeenCalledWith('visit-1'))
    })

    it('does not check anyone out while money is still owed', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByText(/composite filling/i)
      await enterAmount(user, '500')
      await user.click(screen.getByRole('button', { name: /record payment/i }))
      await waitFor(() => expect(api.recordPayment).toHaveBeenCalled())
      await waitFor(() => expect(api.getInvoice).toHaveBeenCalledTimes(2))
      expect(scheduling.completeAwaitingForVisit).not.toHaveBeenCalled()
    })

    // The money is in; the failure is only the checkout, and it has to say so.
    it('says the payment went through when only the checkout fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.getInvoice).mockResolvedValueOnce(invoice()).mockResolvedValueOnce(settled())
      vi.mocked(scheduling.completeAwaitingForVisit).mockRejectedValue(new Error('permission denied'))
      renderPage()
      await screen.findByText(/composite filling/i)
      await user.click(screen.getByRole('button', { name: /record payment/i }))
      expect(
        await screen.findByText(/payment recorded, but the patient could not be checked out/i),
      ).toBeInTheDocument()
      expect(toast.toastSaved).toHaveBeenCalled()
    })
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
    await enterAmount(user, '500')
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(api.recordPayment).toHaveBeenCalled())
    expect(vi.mocked(api.recordPayment).mock.calls[0][0]).toMatchObject({
      amount: 500,
      method: 'cash',
    })
    // Totals are trigger-derived, so the screen must re-read them.
    expect(api.getInvoice).toHaveBeenCalledTimes(2)
  })

  // The form sets noValidate and lets react-hook-form validate, so the
  // message is the app's own and points at the field — rather than a
  // browser-native bubble, which differs per browser and can't be styled.
  // Inline confirmation near the form is often already scrolled past on a
  // tablet by the time the request returns, so the answer is anchored to
  // the viewport instead — and it carries the new balance, which is the
  // number reception is about to say out loud.
  it('confirms the payment with the amount and the new balance', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await enterAmount(user, '500')
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    await waitFor(() => expect(toast.toastSaved).toHaveBeenCalled())
    const [message, description] = vi.mocked(toast.toastSaved).mock.calls[0]
    expect(message).toMatch(/₱500\.00 recorded/)
    expect(description).toMatch(/balance now/i)
  })

  it('says nothing when the payment fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.recordPayment).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()
    await screen.findByText(/composite filling/i)
    await enterAmount(user, '500')
    await user.click(screen.getByRole('button', { name: /record payment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
    expect(toast.toastSaved).not.toHaveBeenCalled()
  })

  it('refuses an empty payment, with a message', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/composite filling/i)
    await enterAmount(user, '')
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
    await enterAmount(user, '0')
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
    vi.mocked(api.getInvoice).mockResolvedValue(
      invoice({
        payments: [
          {
            id: 'pm-2',
            invoice_id: 'inv-1',
            amount: -250,
            method: 'cash',
            reference: null,
            received_by: null,
            paid_at: '2026-09-11T03:00:00Z',
          },
        ],
      }),
    )
    renderPage()
    expect(await screen.findAllByText(/-₱250\.00/)).not.toHaveLength(0)
  })

  describe('commission', () => {
    it('lets reception enter the commission, starting from 0', async () => {
      const user = userEvent.setup()
      vi.mocked(api.setInvoiceCommission).mockResolvedValue(undefined)
      renderPage()
      await screen.findByText(/composite filling/i)
      const box = screen.getByLabelText(/^commission/i)
      expect(box).toHaveValue('0')
      await user.clear(box)
      await user.type(box, '250')
      await user.click(screen.getByRole('button', { name: /save commission/i }))
      await waitFor(() => expect(api.setInvoiceCommission).toHaveBeenCalledWith('inv-1', 250))
      // Refetched so the box shows what the database now holds.
      expect(api.getInvoice).toHaveBeenCalledTimes(2)
    })

    it('refuses a negative commission', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByText(/composite filling/i)
      const box = screen.getByLabelText(/^commission/i)
      await user.clear(box)
      await user.type(box, '-5')
      await user.click(screen.getByRole('button', { name: /save commission/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/zero or more/i)
      expect(api.setInvoiceCommission).not.toHaveBeenCalled()
    })

    it('keeps the typed commission on screen when the save fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.setInvoiceCommission).mockRejectedValue(new TypeError('Failed to fetch'))
      renderPage()
      await screen.findByText(/composite filling/i)
      const box = screen.getByLabelText(/^commission/i)
      await user.clear(box)
      await user.type(box, '250')
      await user.click(screen.getByRole('button', { name: /save commission/i }))
      expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
      expect(box).toHaveValue('250')
    })

    it('is read-only on a void invoice', async () => {
      vi.mocked(api.getInvoice).mockResolvedValue(invoice({ status: 'void', commission_amount: 100 }))
      renderPage()
      await screen.findByText(/composite filling/i)
      expect(screen.queryByRole('button', { name: /save commission/i })).not.toBeInTheDocument()
    })
  })

  it('says payments cannot be edited', async () => {
    renderPage()
    await screen.findByText(/composite filling/i)
    expect(screen.getByText(/can't be edited or deleted/i)).toBeInTheDocument()
  })
})
