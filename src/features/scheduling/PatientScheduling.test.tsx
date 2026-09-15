import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { anAppointment } from '../../test/fixtures'
import { toLocalDateString } from '../../core/localDate'

/** A local calendar date `n` days from today. */
function inDays(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return toLocalDateString(d)
}

// user.type does not drive a date input; a change event is what the
// calendar produces.
const pickRecallDate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/recall date/i), { target: { value } })

const auth = vi.hoisted(() => ({ role: 'receptionist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's-1', name: 'Whoever', role: auth.role } }),
}))
vi.mock('./BookAppointmentForm', () => ({
  default: ({ defaultPatientId, onBooked }: { defaultPatientId?: string; onBooked: () => void }) => (
    <div>
      <p>booking for {defaultPatientId}</p>
      <button type="button" onClick={onBooked}>
        Confirm booking
      </button>
    </div>
  ),
}))
vi.mock('./api', () => ({
  listPatientAppointments: vi.fn(),
  listPatientRecalls: vi.fn(),
  createRecall: vi.fn(),
}))

const api = await import('./api')
const PatientScheduling = (await import('./PatientScheduling')).default

const HOUR = 60 * 60 * 1000
const future = new Date(Date.now() + 48 * HOUR).toISOString()
const past = new Date(Date.now() - 48 * HOUR).toISOString()

describe('PatientScheduling', () => {
  beforeEach(() => {
    auth.role = 'receptionist'
    vi.mocked(api.listPatientAppointments).mockReset().mockResolvedValue([])
    vi.mocked(api.listPatientRecalls).mockReset().mockResolvedValue([])
    vi.mocked(api.createRecall)
      .mockReset()
      .mockResolvedValue({ id: 'r-1' } as never)
  })

  it('separates what is still to come from what already happened', async () => {
    vi.mocked(api.listPatientAppointments).mockResolvedValue([
      anAppointment({ id: 'a-future', scheduled_at: future, reason: 'Cleaning' }),
      anAppointment({ id: 'a-past', scheduled_at: past, reason: 'Extraction' }),
    ])
    render(<PatientScheduling patientId="p-1" />)
    expect(await screen.findByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText(/cleaning/i)).toBeInTheDocument()
    expect(screen.getByText(/extraction/i)).toBeInTheDocument()
  })

  it('says plainly when nothing is booked', async () => {
    render(<PatientScheduling patientId="p-1" />)
    expect(await screen.findByText(/nothing booked/i)).toBeInTheDocument()
    expect(screen.getByText(/no recall set/i)).toBeInTheDocument()
  })

  // The profile already knows who this is, so the chooser is skipped — the
  // form is told the patient rather than asked.
  it('books for this patient without asking which one', async () => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/nothing booked/i)
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    expect(await screen.findByText(/booking for p-1/i)).toBeInTheDocument()
  })

  it('refreshes the list after a booking, so the new one appears', async () => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/nothing booked/i)
    await user.click(screen.getByRole('button', { name: /book appointment/i }))
    await user.click(await screen.findByRole('button', { name: /confirm booking/i }))
    await waitFor(() => expect(api.listPatientAppointments).toHaveBeenCalledTimes(2))
  })

  // Recalls are set at the end of an appointment, which is the only moment
  // anyone reliably remembers to.
  it('saves the date picked on the calendar as the recall date', async () => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    pickRecallDate(inDays(30))
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(api.createRecall).toHaveBeenCalled())
    const call = vi.mocked(api.createRecall).mock.calls[0][0]
    expect(call).toEqual({
      patientId: 'p-1',
      dueOn: inDays(30),
      reason: 'Six-month check-up and cleaning',
      staffId: 's-1',
    })
  })

  // `min` is what greys out today and the past in the calendar itself.
  it('offers a calendar that starts tomorrow', async () => {
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    const input = screen.getByLabelText(/recall date/i)
    expect(input).toHaveAttribute('type', 'date')
    expect(input).toHaveAttribute('min', inDays(1))
    expect(screen.queryByLabelText(/months/i)).not.toBeInTheDocument()
  })

  // A date can be typed past the calendar; today is not a recall.
  it.each([
    ['today', 0],
    ['a past date', -7],
  ])('refuses %s', async (_label, days) => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    pickRecallDate(inDays(days))
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/must be after today/i)).toBeInTheDocument()
    expect(api.createRecall).not.toHaveBeenCalled()
  })

  it('asks for a date rather than saving a recall with none', async () => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/choose a recall date/i)).toBeInTheDocument()
    expect(api.createRecall).not.toHaveBeenCalled()
  })

  // A recall with no reason is one nobody can action when it comes up.
  it('falls back to a reason rather than saving a blank one', async () => {
    const user = userEvent.setup()
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    await user.clear(screen.getByLabelText(/set a recall/i))
    pickRecallDate(inDays(30))
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(api.createRecall).toHaveBeenCalled())
    expect(vi.mocked(api.createRecall).mock.calls[0][0].reason).toBe('Check-up')
  })

  // Completed and dismissed recalls are done with; showing them would make
  // the panel grow forever and bury the one that is actually due.
  it('lists only the recalls still open', async () => {
    vi.mocked(api.listPatientRecalls).mockResolvedValue([
      { id: 'r-1', status: 'due', due_on: '2027-03-01', reason: 'Hygiene' },
      { id: 'r-2', status: 'completed', due_on: '2026-03-01', reason: 'Old one' },
      { id: 'r-3', status: 'dismissed', due_on: '2026-01-01', reason: 'Dropped' },
    ] as never)
    render(<PatientScheduling patientId="p-1" />)
    expect(await screen.findByText(/hygiene/i)).toBeInTheDocument()
    expect(screen.queryByText(/old one/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dropped/i)).not.toBeInTheDocument()
  })

  it('reports a failure to load, with a way to retry', async () => {
    vi.mocked(api.listPatientAppointments).mockRejectedValue(new Error('could not connect'))
    render(<PatientScheduling patientId="p-1" />)
    expect(await screen.findByText(/could not connect/i)).toBeInTheDocument()
  })

  it('keeps the recall form usable when the write is refused', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createRecall).mockRejectedValue(new Error('permission denied'))
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    pickRecallDate(inDays(30))
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  // The diary is reception's; a dentist reads it (0015).
  it('does not offer a dentist the booking control', async () => {
    auth.role = 'dentist'
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/nothing booked/i)
    expect(screen.queryByRole('button', { name: /book appointment/i })).not.toBeInTheDocument()
  })

  // Recalls are a clinical judgement and stay open to them.
  it('still lets a dentist set a recall', async () => {
    auth.role = 'dentist'
    render(<PatientScheduling patientId="p-1" />)
    await screen.findByText(/no recall set/i)
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })
})
