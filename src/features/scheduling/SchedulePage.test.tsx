import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SchedulePage from './SchedulePage'

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
      </Routes>
    </MemoryRouter>,
  )
}

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
})
