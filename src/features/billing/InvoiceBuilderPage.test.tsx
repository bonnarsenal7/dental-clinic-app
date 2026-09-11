import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InvoiceBuilderPage from './InvoiceBuilderPage'

vi.mock('./api', () => ({
  createInvoice: vi.fn(),
  findInvoiceForVisit: vi.fn(),
  listBillableCharting: vi.fn(),
  listPatientVisits: vi.fn(),
  listProcedures: vi.fn(),
}))
vi.mock('../scheduling/api', () => ({ getAppointment: vi.fn() }))
vi.mock('../patients/api', () => ({ getPatient: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: 'receptionist' } }),
}))

const api = await import('./api')
const scheduling = await import('../scheduling/api')
const patients = await import('../patients/api')

const PROCEDURE = {
  id: 'proc-1', name: 'Oral prophylaxis (cleaning)', code: 'PROPHY',
  default_fee: 1200, chart_condition: null, active: true, created_at: '2026-01-01T00:00:00Z',
}

function renderBuilder(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/patients/pat-1/invoices/new${search}`]}>
      <Routes>
        <Route path="/patients/:id/invoices/new" element={<InvoiceBuilderPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('arriving from a completed appointment', () => {
  beforeEach(() => {
    vi.mocked(patients.getPatient).mockResolvedValue({ id: 'pat-1', name: 'Maria Clara Santos' } as never)
    vi.mocked(api.listProcedures).mockResolvedValue([PROCEDURE] as never)
    vi.mocked(api.listPatientVisits).mockResolvedValue([{ id: 'visit-1', visit_date: '2026-09-11T01:30:00Z' }])
    vi.mocked(api.listBillableCharting).mockResolvedValue([])
    vi.mocked(api.findInvoiceForVisit).mockResolvedValue(null)
    vi.mocked(scheduling.getAppointment).mockResolvedValue({
      id: 'appt-1', patient_id: 'pat-1', visit_id: 'visit-1',
      procedure_id: 'proc-1', reason: 'Oral prophylaxis',
    } as never)
  })

  // The appointment names the procedure and the price list knows its fee,
  // so neither should have to be retyped at checkout.
  it('prefills the line and the fee from the booked procedure', async () => {
    renderBuilder('?appointment=appt-1&visit=visit-1')
    await waitFor(() =>
      expect(screen.getByDisplayValue('Oral prophylaxis (cleaning)')).toBeInTheDocument(),
    )
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument()
  })

  // The booked procedure isn't always what was done, so the amount is a
  // starting point rather than a fixed price.
  it('leaves the amount editable', async () => {
    renderBuilder('?appointment=appt-1&visit=visit-1')
    const amount = await screen.findByDisplayValue('1200')
    expect(amount).toBeEnabled()
    expect(amount).toHaveAttribute('type', 'number')
  })

  it('falls back to the appointment reason when no procedure was chosen', async () => {
    vi.mocked(scheduling.getAppointment).mockResolvedValue({
      id: 'appt-1', patient_id: 'pat-1', visit_id: 'visit-1',
      procedure_id: null, reason: 'Emergency toothache',
    } as never)
    renderBuilder('?appointment=appt-1&visit=visit-1')
    expect(await screen.findByDisplayValue('Emergency toothache')).toBeInTheDocument()
  })

  it('warns rather than silently raising a second invoice for the visit', async () => {
    vi.mocked(api.findInvoiceForVisit).mockResolvedValue({ id: 'inv-9' } as never)
    renderBuilder('?appointment=appt-1&visit=visit-1')
    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent(/already been invoiced/i)
    expect(screen.getByRole('link', { name: /open that invoice/i })).toHaveAttribute('href', '/invoices/inv-9')
  })

  it('adds nothing when opened without an appointment', async () => {
    renderBuilder('')
    await screen.findByText(/new invoice/i)
    await waitFor(() => expect(scheduling.getAppointment).not.toHaveBeenCalled())
    expect(screen.getByText(/no lines yet/i)).toBeInTheDocument()
  })
})
