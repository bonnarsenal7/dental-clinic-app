import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientRegistrationInput } from './types'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's-1', name: 'Dr Cruz', role: 'dentist' } }),
}))

const VALUES = { name: 'Maria Clara Santos', cell_number: '0917 555 0142' } as PatientRegistrationInput

// The real form is 23 fields; the flow around it is what this covers.
vi.mock('./PatientForm', () => ({
  default: ({
    onSubmit,
    submitLabel,
  }: {
    onSubmit: (v: PatientRegistrationInput) => void
    submitLabel: string
  }) => (
    <button type="button" onClick={() => onSubmit(VALUES)}>
      {submitLabel}
    </button>
  ),
  EMPTY_PATIENT_FORM: {},
}))
vi.mock('./RegistrationReview', () => ({
  default: ({ values }: { values: PatientRegistrationInput }) => <p>review of {values.name}</p>,
}))
vi.mock('./ConsentCapture', () => ({
  default: ({ onSaved }: { onSaved: () => void }) => (
    <button type="button" onClick={onSaved}>
      Save signature
    </button>
  ),
}))

vi.mock('./api', () => ({ registerPatient: vi.fn() }))
const api = await import('./api')
const PatientRegisterPage = (await import('./PatientRegisterPage')).default

describe('PatientRegisterPage', () => {
  beforeEach(() => {
    navigate.mockClear()
    vi.mocked(api.registerPatient)
      .mockReset()
      .mockResolvedValue({ id: 'p-new', name: 'Maria Clara Santos' } as never)
  })

  // The registration flow's central promise: the patient checks every answer
  // before anything is written or signed for. Submitting the form must not
  // create the record.
  it('saves nothing when the form is submitted — it only moves to review', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    expect(await screen.findByText(/review of maria clara santos/i)).toBeInTheDocument()
    expect(api.registerPatient).not.toHaveBeenCalled()
    expect(screen.getByText(/nothing is saved yet/i)).toBeInTheDocument()
  })

  it('goes back to the form with the answers still there', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /back and edit/i }))
    expect(await screen.findByRole('button', { name: /review before signing/i })).toBeInTheDocument()
    expect(api.registerPatient).not.toHaveBeenCalled()
  })

  it('registers only once the answers are confirmed', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /confirmed correct/i }))
    await waitFor(() => expect(api.registerPatient).toHaveBeenCalledWith(VALUES, 's-1'))
  })

  // Registration and consent are one motion — the paper process has the
  // patient sign at the desk, not on a later visit.
  it('goes straight on to the signature once the record exists', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /confirmed correct/i }))
    expect(await screen.findByText(/consent for maria clara santos/i)).toBeInTheDocument()
  })

  it('opens the new profile once consent is signed', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /confirmed correct/i }))
    await user.click(await screen.findByRole('button', { name: /save signature/i }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/patients/p-new'))
  })

  // Consent is re-signable at any later visit, so a patient who cannot sign
  // now must not block registration.
  it('lets consent be skipped without losing the registration', async () => {
    const user = userEvent.setup()
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /confirmed correct/i }))
    await user.click(await screen.findByRole('button', { name: /skip for now/i }))
    expect(navigate).toHaveBeenCalledWith('/patients/p-new')
  })

  // No lost data: a failed write leaves the review on screen with the
  // answers intact, rather than dropping the operator back to a blank form.
  it('keeps the review on screen when the write fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.registerPatient).mockRejectedValue(new Error('duplicate patient'))
    render(<PatientRegisterPage />)
    await user.click(screen.getByRole('button', { name: /review before signing/i }))
    await user.click(screen.getByRole('button', { name: /confirmed correct/i }))
    expect(await screen.findByText(/duplicate patient/i)).toBeInTheDocument()
    expect(screen.getByText(/review of maria clara santos/i)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
