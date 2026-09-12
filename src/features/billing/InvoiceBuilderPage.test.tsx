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
  getVisitNote: vi.fn(),
}))
vi.mock('../scheduling/api', () => ({ getAppointment: vi.fn() }))
vi.mock('../patients/api', () => ({ getPatient: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'receptionist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Whoever', role: auth.role } }),
}))

const api = await import('./api')
const scheduling = await import('../scheduling/api')
const patients = await import('../patients/api')

const PROCEDURE = {
  id: 'proc-1',
  name: 'Oral prophylaxis (cleaning)',
  code: 'PROPHY',
  default_fee: 1200,
  chart_condition: null,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
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
    // Reset, or the role a later test sets leaks backwards into the
    // earlier ones the moment anybody reorders this file.
    auth.role = 'receptionist'
    vi.mocked(api.getVisitNote).mockResolvedValue(null)
    vi.mocked(patients.getPatient).mockResolvedValue({
      id: 'pat-1',
      name: 'Maria Clara Santos',
    } as never)
    vi.mocked(api.listProcedures).mockResolvedValue([PROCEDURE] as never)
    vi.mocked(api.listPatientVisits).mockResolvedValue([
      { id: 'visit-1', visit_date: '2026-09-11T01:30:00Z' },
    ])
    vi.mocked(api.listBillableCharting).mockResolvedValue([])
    vi.mocked(api.findInvoiceForVisit).mockResolvedValue(null)
    vi.mocked(scheduling.getAppointment).mockResolvedValue({
      id: 'appt-1',
      patient_id: 'pat-1',
      visit_id: 'visit-1',
      procedure_id: 'proc-1',
      reason: 'Oral prophylaxis',
    } as never)
  })

  // The appointment names the procedure and the price list knows its fee,
  // so neither should have to be retyped at checkout.
  it('prefills the line and the fee from the booked procedure', async () => {
    renderBuilder('?appointment=appt-1&visit=visit-1')
    await waitFor(() => expect(screen.getByDisplayValue('Oral prophylaxis (cleaning)')).toBeInTheDocument())
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
      id: 'appt-1',
      patient_id: 'pat-1',
      visit_id: 'visit-1',
      procedure_id: null,
      reason: 'Emergency toothache',
    } as never)
    renderBuilder('?appointment=appt-1&visit=visit-1')
    expect(await screen.findByDisplayValue('Emergency toothache')).toBeInTheDocument()
  })

  it('warns rather than silently raising a second invoice for the visit', async () => {
    vi.mocked(api.findInvoiceForVisit).mockResolvedValue({ id: 'inv-9' } as never)
    renderBuilder('?appointment=appt-1&visit=visit-1')
    const warning = await screen.findByRole('alert')
    expect(warning).toHaveTextContent(/already been invoiced/i)
    expect(screen.getByRole('link', { name: /open that invoice/i })).toHaveAttribute(
      'href',
      '/invoices/inv-9',
    )
  })

  it('adds nothing when opened without an appointment', async () => {
    renderBuilder('')
    await screen.findByText(/new invoice/i)
    await waitFor(() => expect(scheduling.getAppointment).not.toHaveBeenCalled())
    expect(screen.getByText(/no lines yet/i)).toBeInTheDocument()
  })

  // --- The dentist's note ------------------------------------------------

  // A chart records findings; the note records the appointment. Whoever
  // raises the invoice needs the note in front of them, not one screen away
  // — otherwise work that was done but never charted gets billed as nothing.
  it("shows the dentist's note for the visit being billed", async () => {
    auth.role = 'dentist'
    vi.mocked(api.getVisitNote).mockResolvedValue(
      'Composite filling 36 occlusal. Advised on grinding; review in 6 months.',
    )
    renderBuilder('?visit=v-1')
    expect(await screen.findByText(/composite filling 36 occlusal/i)).toBeInTheDocument()
    expect(screen.getByText(/dentist's note for this visit/i)).toBeInTheDocument()
  })

  // Silence here would read as "nothing was done", which is exactly the
  // wrong conclusion to invite on a billing screen.
  it('says plainly when no note was written', async () => {
    auth.role = 'dentist'
    vi.mocked(api.getVisitNote).mockResolvedValue(null)
    renderBuilder('?visit=v-1')
    expect(await screen.findByText(/no note was written for this visit/i)).toBeInTheDocument()
  })

  it('treats an empty note the same as no note', async () => {
    auth.role = 'dentist'
    vi.mocked(api.getVisitNote).mockResolvedValue('   ')
    renderBuilder('?visit=v-1')
    expect(await screen.findByText(/no note was written for this visit/i)).toBeInTheDocument()
  })

  // visit_notes has no policy at all for reception (0002_rls.sql). The
  // boundary is the database's, and the screen must not try to route around
  // it — it says who can see the note instead.
  it('does not show the note to reception, and says why', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.getVisitNote).mockResolvedValue('Clinical detail reception must not see')
    renderBuilder('?visit=v-1')
    await screen.findByText(/only visible to dentist\/admin accounts/i)
    expect(screen.queryByText(/clinical detail reception must not see/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dentist's note for this visit/i)).not.toBeInTheDocument()
  })

  it('does not even ask for the note as reception', async () => {
    auth.role = 'receptionist'
    renderBuilder('?visit=v-1')
    await screen.findByText(/only visible to dentist\/admin accounts/i)
    expect(api.getVisitNote).not.toHaveBeenCalled()
  })

  // A note that fails to load must not take the billing screen down with it.
  it('still bills when the note cannot be loaded', async () => {
    auth.role = 'dentist'
    vi.mocked(api.getVisitNote).mockRejectedValue(new Error('network'))
    renderBuilder('?visit=v-1')
    expect(await screen.findByText(/no note was written for this visit/i)).toBeInTheDocument()
  })
})
