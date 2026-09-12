import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useParams, useSearchParams } from 'react-router-dom'
import SchedulePage from './SchedulePage'
import { anAppointment } from '../../test/fixtures'
import type { AppointmentWithPatient } from './types'

vi.mock('./api', () => ({
  listAppointmentsForDay: vi.fn(),
  setAppointmentStatus: vi.fn(),
  listDentists: vi.fn(),
  bookAppointment: vi.fn(),
}))
vi.mock('../billing/api', () => ({
  findInvoiceForVisit: vi.fn(),
  listProcedures: vi.fn(),
}))
vi.mock('../patients/api', () => ({ searchPatients: vi.fn(), getPatient: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: 'receptionist' } }),
}))

const api = await import('./api')
const billing = await import('../billing/api')
const patients = await import('../patients/api')

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/schedule" element={<SchedulePage />} />
        {/* Stand-ins, so a redirect can be asserted by what lands on screen
            rather than by spying on the router. */}
        <Route path="/patients/:id/invoices/new" element={<LandedOnBuilder />} />
        <Route path="/invoices/:id" element={<LandedOnInvoice />} />
      </Routes>
    </MemoryRouter>,
  )
}

function LandedOnBuilder() {
  const [params] = useSearchParams()
  const { id } = useParams()
  return (
    <p>
      builder for {id} appointment={params.get('appointment')} visit={params.get('visit')}
    </p>
  )
}

function LandedOnInvoice() {
  const { id } = useParams()
  return <p>existing invoice {id}</p>
}

const seated = (over: Partial<AppointmentWithPatient> = {}): AppointmentWithPatient => ({
  ...anAppointment({ id: 'a-1', status: 'in_chair', visit_id: 'v-1', patient_id: 'p-1' }),
  patients: { id: 'p-1', name: 'Maria Clara Santos', cell_number: null, phone_number: null },
  ...over,
})

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([])
    vi.mocked(api.listDentists).mockResolvedValue([{ id: 'd-1', name: 'Test Dentist' }])
    vi.mocked(billing.listProcedures).mockResolvedValue([] as never)
    vi.mocked(billing.findInvoiceForVisit).mockResolvedValue(null)
    vi.mocked(patients.searchPatients).mockResolvedValue([] as never)
    vi.mocked(patients.getPatient).mockResolvedValue({
      id: 'p-9',
      name: 'Lorna Villanueva',
    } as never)
  })

  it('opens closed, with no booking form', async () => {
    renderAt('/schedule')
    await screen.findByText(/still to come/i)
    expect(screen.queryByText(/book an appointment/i)).not.toBeInTheDocument()
  })

  // The recalls list links here as /schedule?patient=<id>. That parameter
  // was previously read by nothing, so "Book" from a recall landed on an
  // unchanged schedule with the form shut and nobody selected.
  it('opens the booking form for the patient named in the url', async () => {
    renderAt('/schedule?patient=p-9')
    expect(await screen.findByText(/book an appointment/i)).toBeInTheDocument()
    expect(await screen.findByText(/lorna villanueva/i)).toBeInTheDocument()
  })

  it('does not ask which patient when the url already says', async () => {
    renderAt('/schedule?patient=p-9')
    await screen.findByText(/book an appointment/i)
    expect(screen.queryByLabelText(/^patient$/i)).not.toBeInTheDocument()
  })

  // --- Completing leads straight into billing ---------------------------

  // Finishing treatment is when someone gets billed. Leaving a "Create
  // invoice" link on the card made that a separate step somebody has to
  // remember at a busy front desk.
  it('goes to the invoice builder when an appointment is completed', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([seated()])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(
      anAppointment({ id: 'a-1', status: 'completed', visit_id: 'v-1', patient_id: 'p-1' }),
    )
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /complete/i }))
    expect(await screen.findByText(/builder for p-1/i)).toBeInTheDocument()
  })

  // The builder needs both: the appointment to prefill the first line, the
  // visit to pull what was charted.
  it('carries the appointment and the visit through to the builder', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([seated()])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(
      anAppointment({ id: 'a-1', status: 'completed', visit_id: 'v-1', patient_id: 'p-1' }),
    )
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /complete/i }))
    const landed = await screen.findByText(/builder for p-1/i)
    expect(landed).toHaveTextContent('appointment=a-1')
    expect(landed).toHaveTextContent('visit=v-1')
  })

  // The offer can be taken twice — by the dentist at the chair and by
  // reception at checkout. Landing on a blank builder for an already-billed
  // visit is how a second invoice gets raised.
  it('opens the existing invoice rather than starting a second one', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([seated()])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(
      anAppointment({ id: 'a-1', status: 'completed', visit_id: 'v-1', patient_id: 'p-1' }),
    )
    vi.mocked(billing.findInvoiceForVisit).mockResolvedValue({ id: 'inv-7' } as never)
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /complete/i }))
    expect(await screen.findByText(/existing invoice inv-7/i)).toBeInTheDocument()
  })

  // Only completing bills. Marking someone arrived must leave you on the
  // schedule, with the next patient still in front of you.
  it('stays on the schedule for every other status change', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([seated({ status: 'arrived', visit_id: null })])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(
      anAppointment({ id: 'a-1', status: 'in_chair', visit_id: 'v-1', patient_id: 'p-1' }),
    )
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    await waitFor(() => expect(api.setAppointmentStatus).toHaveBeenCalled())
    expect(screen.queryByText(/builder for/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument()
  })

  // A failed write must not navigate away from the error.
  it('does not redirect when completing fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([seated()])
    vi.mocked(api.setAppointmentStatus).mockRejectedValue(new Error('permission denied'))
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /complete/i }))
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
    expect(screen.queryByText(/builder for/i)).not.toBeInTheDocument()
  })
})
