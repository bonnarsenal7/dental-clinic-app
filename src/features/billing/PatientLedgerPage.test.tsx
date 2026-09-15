import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PatientLedgerPage from './PatientLedgerPage'
import type { InvoiceWithDetail } from './types'

vi.mock('./api', () => ({ listInvoices: vi.fn() }))
vi.mock('../patients/api', () => ({ getPatient: vi.fn() }))
vi.mock('../../core/auditView', () => ({ logPatientView: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: 'receptionist' } }),
}))

const api = await import('./api')
const patients = await import('../patients/api')
const audit = await import('../../core/auditView')

function invoice(
  id: string,
  items: [number, string][],
  payments: number[],
  status = 'partial',
): InvoiceWithDetail {
  return {
    id,
    patient_id: 'p1',
    visit_id: null,
    status: status as InvoiceWithDetail['status'],
    total_amount: items.reduce((s, [a]) => s + a, 0),
    commission_amount: 0,
    created_by: null,
    created_at: '2026-03-01T00:00:00Z',
    invoice_items: items.map(([amount, description], i) => ({
      id: `${id}-i${i}`,
      invoice_id: id,
      description,
      amount,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: null,
      created_at: '2026-03-01T00:00:00Z',
    })),
    payments: payments.map((amount, i) => ({
      id: `${id}-p${i}`,
      invoice_id: id,
      amount,
      method: 'cash' as const,
      reference: null,
      received_by: null,
      paid_at: '2026-03-02T00:00:00Z',
    })),
  }
}

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/patients/p1/billing']}>
      <Routes>
        <Route path="/patients/:id/billing" element={<PatientLedgerPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('PatientLedgerPage', () => {
  beforeEach(() => {
    vi.mocked(patients.getPatient).mockResolvedValue({
      id: 'p1',
      name: 'Jose Miguel Reyes',
    } as never)
    vi.mocked(api.listInvoices).mockResolvedValue([
      invoice(
        'inv1',
        [
          [500, 'Consultation'],
          [700, 'Temporary filling'],
        ],
        [500],
      ),
    ])
  })

  it('runs a balance down the ledger', async () => {
    renderPage()
    await screen.findByText(/consultation/i)
    const balances = screen.getAllByText(/₱\d/).map((e) => e.textContent)
    expect(balances).toContain('₱700.00') // 1200 charged less 500 paid
  })

  it('shows the outstanding balance prominently', async () => {
    renderPage()
    expect(await screen.findByText(/outstanding balance/i)).toBeInTheDocument()
  })

  // A voided invoice was never owed; counting it would overstate the debt.
  it('leaves voided invoices out of the ledger', async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([invoice('inv2', [[5000, 'Cancelled work']], [], 'void')])
    renderPage()
    await screen.findByText(/outstanding balance/i)
    expect(screen.queryByText(/cancelled work/i)).not.toBeInTheDocument()
    expect(screen.getByText(/nothing billed yet/i)).toBeInTheDocument()
  })

  // Opening a patient's financial record is a read of their data, and the
  // Data Privacy Act asks who looked at it.
  it('logs that the record was viewed', async () => {
    renderPage()
    await screen.findByText(/consultation/i)
    expect(audit.logPatientView).toHaveBeenCalledWith('p1', 's1', 'invoices')
  })

  it('offers a new invoice and a way back to the profile', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /new invoice/i })).toHaveAttribute(
      'href',
      '/patients/p1/invoices/new',
    )
    expect(screen.getByRole('link', { name: /patient profile/i })).toHaveAttribute('href', '/patients/p1')
  })
})
