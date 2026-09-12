import { render, screen, waitFor, within } from '@testing-library/react'
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
  finishTreatment: vi.fn(),
}))
vi.mock('../billing/api', () => ({
  findDraftInvoice: vi.fn(),
  findInvoicesForVisits: vi.fn(),
  listProcedures: vi.fn(),
}))
vi.mock('../patients/api', () => ({ searchPatients: vi.fn(), getPatient: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'receptionist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Whoever', role: auth.role } }),
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
    auth.role = 'receptionist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([])
    vi.mocked(api.listDentists).mockResolvedValue([{ id: 'd-1', name: 'Test Dentist' }])
    vi.mocked(billing.listProcedures).mockResolvedValue([] as never)
    vi.mocked(billing.findDraftInvoice).mockResolvedValue(null)
    vi.mocked(billing.findInvoicesForVisits).mockResolvedValue({})
    vi.mocked(api.finishTreatment).mockResolvedValue(anAppointment({ status: 'pending_payment' }))
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
    const seatDialog = await screen.findByRole('dialog')
    await user.click(within(seatDialog).getByRole('button', { name: /seat patient/i }))
    await waitFor(() => expect(api.setAppointmentStatus).toHaveBeenCalled())
    expect(screen.queryByText(/builder for/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument()
  })

  // --- Who is actually treating them ------------------------------------

  const waiting = (over: Partial<AppointmentWithPatient> = {}) =>
    seated({ status: 'arrived', visit_id: null, ...over })

  // Whoever was pencilled in at booking is often not who is free when the
  // patient finally sits down, and the visit is attributed to whoever is
  // named here — so seating asks rather than assuming.
  it('asks who is treating the patient before seating them', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting()])
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/who is treating maria clara santos/i)
    expect(within(dialog).getByLabelText(/treating dentist/i)).toBeInTheDocument()
    expect(api.setAppointmentStatus).not.toHaveBeenCalled()
  })

  it('offers the dentists the database says are bookable', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listDentists).mockResolvedValue([
      { id: 'd-1', name: 'Test Dentist' },
      { id: 'd-2', name: 'Dr Cruz' },
    ])
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting()])
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const select = within(await screen.findByRole('dialog')).getByLabelText(/treating dentist/i)
    expect(within(select).getByRole('option', { name: 'Dr Cruz' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Test Dentist' })).toBeInTheDocument()
  })

  // The booking is the best guess, so it is what the question opens on —
  // confirming should be one tap when nothing has changed.
  it('starts on the dentist the appointment was booked with', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listDentists).mockResolvedValue([{ id: 'd-1', name: 'Test Dentist' }])
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting({ dentist_id: 'd-1' })])
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const select = within(await screen.findByRole('dialog')).getByLabelText(/treating dentist/i)
    expect((select as HTMLSelectElement).value).toBe('d-1')
  })

  it('seats with the dentist actually chosen, not the one booked', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listDentists).mockResolvedValue([
      { id: 'd-1', name: 'Test Dentist' },
      { id: 'd-2', name: 'Dr Cruz' },
    ])
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting({ dentist_id: 'd-1' })])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(
      anAppointment({ id: 'a-1', status: 'in_chair', visit_id: 'v-1' }),
    )
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText(/treating dentist/i), 'd-2')
    await user.click(within(dialog).getByRole('button', { name: /seat patient/i }))
    await waitFor(() => expect(api.setAppointmentStatus).toHaveBeenCalled())
    expect(vi.mocked(api.setAppointmentStatus).mock.calls[0][0]).toMatchObject({
      status: 'in_chair',
      dentistId: 'd-2',
    })
  })

  // An unassigned booking is exactly the case where asking earns its keep.
  it('says so when the booking has no dentist on it', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting({ dentist_id: null })])
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/no dentist assigned/i)
  })

  it('does not seat anyone if the question is cancelled', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting()])
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.setAppointmentStatus).not.toHaveBeenCalled()
  })

  // Reassigning can collide with what that dentist is already doing. The
  // refusal belongs inside the dialog, where the person choosing is looking.
  it('reports a clash inside the dialog and stays open', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listDentists).mockResolvedValue([{ id: 'd-1', name: 'Test Dentist' }])
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([waiting()])
    vi.mocked(api.setAppointmentStatus).mockRejectedValue(
      new Error('That dentist is already with another patient at this time.'),
    )
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /chair/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /seat patient/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already with another patient/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // --- Finishing treatment, and taking the money ------------------------

  const inChair = (over: Partial<AppointmentWithPatient> = {}) =>
    seated({ status: 'in_chair', visit_id: 'v-1', ...over })

  // The invoice is written chairside, so finishing locks it rather than
  // sending anyone off to build one afterwards.
  it('locks the chairside draft when the dentist finishes treatment', async () => {
    const user = userEvent.setup()
    auth.role = 'dentist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([inChair()])
    vi.mocked(billing.findDraftInvoice).mockResolvedValue({ id: 'inv-1' } as never)
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /finish treatment/i }))
    await waitFor(() => expect(api.finishTreatment).toHaveBeenCalled())
    expect(vi.mocked(api.finishTreatment).mock.calls[0][0]).toMatchObject({ invoiceId: 'inv-1' })
  })

  it('puts the bill on screen once treatment is finished', async () => {
    const user = userEvent.setup()
    auth.role = 'dentist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([inChair()])
    vi.mocked(billing.findDraftInvoice).mockResolvedValue({ id: 'inv-1' } as never)
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /finish treatment/i }))
    expect(await screen.findByText(/existing invoice inv-1/i)).toBeInTheDocument()
  })

  // An appointment where nothing was billable has no bill to wait on.
  it('completes outright when nothing was billed', async () => {
    const user = userEvent.setup()
    auth.role = 'dentist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([inChair()])
    vi.mocked(billing.findDraftInvoice).mockResolvedValue(null)
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /finish treatment/i }))
    await waitFor(() => expect(api.finishTreatment).toHaveBeenCalled())
    expect(vi.mocked(api.finishTreatment).mock.calls[0][0]).toMatchObject({ invoiceId: null })
    expect(screen.queryByText(/existing invoice/i)).not.toBeInTheDocument()
  })

  // Mirrors 0013: the database refuses these, and a button that is going to
  // be rejected is worse than no button.
  it('does not offer reception the finish-treatment action', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([inChair()])
    renderAt('/schedule')
    await screen.findByText('Maria Clara Santos')
    expect(screen.queryByRole('button', { name: /finish treatment/i })).not.toBeInTheDocument()
  })

  it('does not offer the dentist the accept-payment action', async () => {
    auth.role = 'dentist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([
      seated({ status: 'pending_payment', visit_id: 'v-1' }),
    ])
    renderAt('/schedule')
    await screen.findByText('Maria Clara Santos')
    expect(screen.queryByRole('button', { name: /accept payment/i })).not.toBeInTheDocument()
  })

  // Reception is checking people out one after another; being thrown onto an
  // invoice screen between each one would be worse than useless.
  it('stays on the day sheet when reception accepts payment', async () => {
    const user = userEvent.setup()
    auth.role = 'receptionist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([
      seated({ status: 'pending_payment', visit_id: 'v-1' }),
    ])
    vi.mocked(api.setAppointmentStatus).mockResolvedValue(anAppointment({ status: 'completed' }))
    renderAt('/schedule')
    await user.click(await screen.findByRole('button', { name: /accept payment/i }))
    await waitFor(() => expect(api.setAppointmentStatus).toHaveBeenCalled())
    expect(vi.mocked(api.setAppointmentStatus).mock.calls[0][0]).toMatchObject({ status: 'completed' })
    expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument()
  })

  it('shows reception the bill to collect against', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.listAppointmentsForDay).mockResolvedValue([
      seated({ status: 'pending_payment', visit_id: 'v-1' }),
    ])
    vi.mocked(billing.findInvoicesForVisits).mockResolvedValue({ 'v-1': 'inv-1' })
    renderAt('/schedule')
    expect(await screen.findByRole('link', { name: /view bill/i })).toHaveAttribute('href', '/invoices/inv-1')
  })
})
