import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BookAppointmentForm from './BookAppointmentForm'

vi.mock('./api', () => ({ bookAppointment: vi.fn(), listDentists: vi.fn() }))
vi.mock('../patients/api', () => ({ searchPatients: vi.fn(), getPatient: vi.fn() }))
vi.mock('../billing/api', () => ({ listProcedures: vi.fn() }))

const api = await import('./api')
const patientsApi = await import('../patients/api')
const billingApi = await import('../billing/api')

const PATIENTS = [
  { id: 'p-1', name: 'Maria Clara Santos', cell_number: '0917 555 0142' },
  { id: 'p-2', name: 'Jose Miguel Reyes', cell_number: '0918 555 0233' },
]

describe('BookAppointmentForm', () => {
  beforeEach(() => {
    vi.mocked(patientsApi.searchPatients).mockResolvedValue(PATIENTS as never)
    vi.mocked(patientsApi.getPatient).mockResolvedValue({
      id: 'p-9',
      name: 'Lorna Villanueva',
    } as never)
    vi.mocked(billingApi.listProcedures).mockResolvedValue([
      { id: 'proc-1', name: 'Oral prophylaxis (cleaning)', default_fee: 1200 },
    ] as never)
    vi.mocked(api.listDentists).mockResolvedValue([{ id: 'd-1', name: 'Test Dentist' }])
    vi.mocked(api.bookAppointment).mockResolvedValue({ id: 'appt-1' } as never)
  })

  it('labels the patient chooser so it can be found and clicked', async () => {
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByRole('option', { name: /maria clara santos/i })
    // The label previously pointed at the search box, leaving the control a
    // user actually picks with unlabelled.
    expect(screen.getByLabelText(/^patient$/i)).toHaveProperty('tagName', 'SELECT')
    expect(screen.getByLabelText(/^search$/i)).toHaveProperty('tagName', 'INPUT')
  })

  // A `size` listbox does not open the native picker on a tablet — it
  // renders inline, is fiddly to tap, and reads as inert. This is where it
  // gets used, so it must be an ordinary dropdown.
  it('is an ordinary dropdown, not a multi-row listbox', async () => {
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByRole('option', { name: /maria clara santos/i })
    const select = screen.getByLabelText(/^patient$/i) as HTMLSelectElement
    expect(select.hasAttribute('size')).toBe(false)
    expect(select.multiple).toBe(false)
  })

  it('starts on a placeholder rather than silently preselecting someone', async () => {
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByRole('option', { name: /maria clara santos/i })
    expect((screen.getByLabelText(/^patient$/i) as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('option', { name: /choose a patient/i })).toBeInTheDocument()
  })

  it('lets a patient be chosen and books with that id', async () => {
    const user = userEvent.setup()
    const onBooked = vi.fn()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={onBooked} />)

    await screen.findByRole('option', { name: /maria clara santos/i })
    await user.selectOptions(screen.getByLabelText(/^patient$/i), 'p-1')
    await user.click(screen.getByRole('button', { name: /book appointment/i }))

    await waitFor(() => expect(api.bookAppointment).toHaveBeenCalled())
    expect(vi.mocked(api.bookAppointment).mock.calls[0][0]).toMatchObject({
      patientId: 'p-1',
    })
    expect(onBooked).toHaveBeenCalled()
  })

  it('refuses to book with no patient chosen', async () => {
    const user = userEvent.setup()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByRole('option', { name: /maria clara santos/i })
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a patient/i)
    expect(api.bookAppointment).not.toHaveBeenCalled()
  })

  it('hides the chooser when the patient is already known', async () => {
    render(
      <BookAppointmentForm defaultDate="2026-09-12" staffId="s1" defaultPatientId="p-9" onBooked={vi.fn()} />,
    )
    await screen.findByRole('button', { name: /book appointment/i })
    expect(screen.queryByLabelText(/^patient$/i)).not.toBeInTheDocument()
  })

  // With the chooser hidden there was nothing on screen saying who the
  // booking was for.
  it('names the patient it is booking for', async () => {
    render(
      <BookAppointmentForm defaultDate="2026-09-12" staffId="s1" defaultPatientId="p-9" onBooked={vi.fn()} />,
    )
    expect(await screen.findByText(/lorna villanueva/i)).toBeInTheDocument()
  })

  it('books against the preselected patient', async () => {
    const user = userEvent.setup()
    render(
      <BookAppointmentForm defaultDate="2026-09-12" staffId="s1" defaultPatientId="p-9" onBooked={vi.fn()} />,
    )
    await screen.findByText(/lorna villanueva/i)
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    await waitFor(() => expect(api.bookAppointment).toHaveBeenCalled())
    expect(vi.mocked(api.bookAppointment).mock.calls[0][0]).toMatchObject({
      patientId: 'p-9',
    })
  })

  it('says so when a search matches nobody', async () => {
    vi.mocked(patientsApi.searchPatients).mockResolvedValue([] as never)
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    expect(await screen.findByText(/no patients match/i)).toBeInTheDocument()
  })

  it('surfaces a double-booking refusal from the database', async () => {
    const user = userEvent.setup()
    vi.mocked(api.bookAppointment).mockRejectedValue(
      new Error('That dentist already has an appointment overlapping this time. Pick another slot.'),
    )
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByRole('option', { name: /maria clara santos/i })
    await user.selectOptions(screen.getByLabelText(/^patient$/i), 'p-1')
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/overlapping this time/i)
  })
})
