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
  const filtering = () =>
    vi
      .mocked(patientsApi.searchPatients)
      .mockImplementation(
        async (q: string) =>
          (q.trim()
            ? PATIENTS.filter(
                (p) =>
                  p.name.toLowerCase().includes(q.toLowerCase()) ||
                  (p.cell_number ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')),
              )
            : PATIENTS) as never,
      )

  /** The clickable result rows, by the name shown on each. */
  const resultNames = () =>
    screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => PATIENTS.some((p) => t.includes(p.name)))

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

  // --- The search box and the dropdown are one control -----------------

  // "No patients match that search." on a form that has not searched yet
  // says the feature is broken before it has been used.
  it('does not claim nothing matched before the first search lands', async () => {
    vi.mocked(patientsApi.searchPatients).mockResolvedValue([] as never)
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    expect(screen.queryByText(/no patients match/i)).not.toBeInTheDocument()
    expect(await screen.findByText(/no patients match/i)).toBeInTheDocument()
  })

  // The search box lives inside the booking form, so the browser's implicit
  // submission turned Enter into "book with nothing chosen".
  it('searches on Enter instead of submitting the booking', async () => {
    const user = userEvent.setup()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByText('Maria Clara Santos')
    await user.type(screen.getByLabelText(/find the patient/i), 'santos{Enter}')
    await waitFor(() => expect(patientsApi.searchPatients).toHaveBeenCalledWith('santos'))
    expect(screen.queryByText(/choose a patient first/i)).not.toBeInTheDocument()
    expect(api.bookAppointment).not.toHaveBeenCalled()
  })

  it('hides the chooser when the patient is already known', async () => {
    render(
      <BookAppointmentForm defaultDate="2026-09-12" staffId="s1" defaultPatientId="p-9" onBooked={vi.fn()} />,
    )
    await screen.findByRole('button', { name: /book appointment/i })
    expect(screen.queryByLabelText(/find the patient/i)).not.toBeInTheDocument()
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
    await user.click(await screen.findByText('Maria Clara Santos'))
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/overlapping this time/i)
  })

  // --- Finding a patient -------------------------------------------------

  // The whole point of the rebuild. A closed <select> hides its own
  // contents, so narrowing the search changed nothing anybody could see —
  // which is how this was reported as "search is not working".
  it('shows the matches on screen without opening anything', async () => {
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await waitFor(() => expect(resultNames()).toHaveLength(2))
    expect(screen.getByText('Maria Clara Santos')).toBeVisible()
    expect(screen.getByText('Jose Miguel Reyes')).toBeVisible()
  })

  it('narrows the visible list as you type a name', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await waitFor(() => expect(resultNames()).toHaveLength(2))
    await user.type(screen.getByLabelText(/find the patient/i), 'reyes')
    await waitFor(() => expect(screen.queryByText('Maria Clara Santos')).not.toBeInTheDocument())
    expect(screen.getByText('Jose Miguel Reyes')).toBeInTheDocument()
  })

  // Reception works from whichever number is to hand, which is why the query
  // goes to name, cell and landline alike.
  it('finds a patient by mobile number', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await waitFor(() => expect(resultNames()).toHaveLength(2))
    await user.type(screen.getByLabelText(/find the patient/i), '0918')
    await waitFor(() => expect(patientsApi.searchPatients).toHaveBeenCalledWith('0918'))
    await waitFor(() => expect(screen.queryByText('Maria Clara Santos')).not.toBeInTheDocument())
    expect(screen.getByText('Jose Miguel Reyes')).toBeInTheDocument()
  })

  // Seeing the number is how you tell two people with the same name apart,
  // and how you know which one your search actually matched.
  it('shows each patient’s number beside their name', async () => {
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    expect(await screen.findByText('0917 555 0142')).toBeInTheDocument()
  })

  it('says so rather than leaving a gap when a patient has no number', async () => {
    vi.mocked(patientsApi.searchPatients).mockResolvedValue([
      { id: 'p-3', name: 'Nameless Number', cell_number: null, phone_number: null },
    ] as never)
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    expect(await screen.findByText(/no contact number on file/i)).toBeInTheDocument()
  })

  // --- Choosing one -----------------------------------------------------

  it('books the patient whose name was tapped', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await user.click(await screen.findByText('Jose Miguel Reyes'))
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    await waitFor(() => expect(api.bookAppointment).toHaveBeenCalled())
    expect(vi.mocked(api.bookAppointment).mock.calls[0][0].patientId).toBe('p-2')
  })

  // Reception books with the patient's name in their ear. Losing it behind a
  // collapsed control while the rest of the form is filled in is how the
  // wrong person gets booked.
  it('keeps the chosen patient on screen while the form is filled in', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await user.click(await screen.findByText('Maria Clara Santos'))
    expect(screen.getByText(/booking for/i)).toBeInTheDocument()
    expect(screen.getByText('Maria Clara Santos')).toBeInTheDocument()
    // The chooser gives way once the question is answered.
    expect(screen.queryByLabelText(/find the patient/i)).not.toBeInTheDocument()
  })

  // The assertions above all fire inside the 250ms search debounce, so they
  // would pass even if the selection were cleared a moment later. This waits
  // the debounce out — and asserts the search does not keep running behind a
  // choice that has already been made.
  it('keeps the choice after the search debounce would have fired', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await user.click(await screen.findByText('Maria Clara Santos'))
    const callsWhenChosen = vi.mocked(patientsApi.searchPatients).mock.calls.length

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(screen.getByText(/booking for/i)).toBeInTheDocument()
    expect(screen.getByText('Maria Clara Santos')).toBeInTheDocument()
    expect(vi.mocked(patientsApi.searchPatients).mock.calls.length).toBe(callsWhenChosen)
  })

  it('lets the choice be changed', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await user.click(await screen.findByText('Maria Clara Santos'))
    await user.click(screen.getByRole('button', { name: /change/i }))
    expect(await screen.findByLabelText(/find the patient/i)).toBeInTheDocument()
    expect(screen.queryByText(/booking for/i)).not.toBeInTheDocument()
  })

  // The old form could hold an id for somebody the search had filtered out
  // and book them. Holding the whole patient rather than an id makes that
  // impossible: what it books is what is on screen.
  it('still books the chosen patient after the search moves on', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await user.click(await screen.findByText('Maria Clara Santos'))
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    await waitFor(() => expect(api.bookAppointment).toHaveBeenCalled())
    expect(vi.mocked(api.bookAppointment).mock.calls[0][0].patientId).toBe('p-1')
    expect(screen.getByText('Maria Clara Santos')).toBeInTheDocument()
  })

  it('refuses to book with nobody chosen', async () => {
    const user = userEvent.setup()
    filtering()
    render(<BookAppointmentForm defaultDate="2026-09-12" staffId="s1" onBooked={vi.fn()} />)
    await screen.findByText('Maria Clara Santos')
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a patient first/i)
    expect(api.bookAppointment).not.toHaveBeenCalled()
  })
})
