import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatientRegistrationInput } from './types'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({ id: 'p-1' }),
}))

const VALUES = { name: 'Maria Clara Santos' } as PatientRegistrationInput
vi.mock('./PatientForm', () => ({
  default: ({
    onSubmit,
    submitLabel,
    defaultValues,
  }: {
    onSubmit: (v: PatientRegistrationInput) => Promise<void>
    submitLabel: string
    defaultValues: PatientRegistrationInput
  }) => (
    <div>
      <p>editing {defaultValues.name}</p>
      <p>cell {defaultValues.cell_number}</p>
      <p>asthma {String(defaultValues.conditions?.asthma)}</p>
      <button type="button" onClick={() => void onSubmit(VALUES)}>
        {submitLabel}
      </button>
    </div>
  ),
  EMPTY_PATIENT_FORM: { conditions: {}, symptoms: {}, oral_habits: {} },
}))

vi.mock('./api', () => ({
  getPatient: vi.fn(),
  getMedicalHistory: vi.fn(),
  getDentalHistory: vi.fn(),
  updatePatientHistory: vi.fn(),
}))
const api = await import('./api')
const PatientEditPage = (await import('./PatientEditPage')).default

describe('PatientEditPage', () => {
  beforeEach(() => {
    navigate.mockClear()
    vi.mocked(api.getPatient).mockResolvedValue({
      id: 'p-1',
      name: 'Maria Clara Santos',
      cell_number: '0917 555 0142',
      age: 34,
      address: null,
    } as never)
    vi.mocked(api.getMedicalHistory).mockResolvedValue({ conditions: { asthma: true } } as never)
    vi.mocked(api.getDentalHistory).mockResolvedValue(null)
    vi.mocked(api.updatePatientHistory).mockReset().mockResolvedValue(undefined)
  })

  it('loads the record into the form', async () => {
    render(<PatientEditPage />)
    expect(await screen.findByText(/editing maria clara santos/i)).toBeInTheDocument()
    expect(screen.getByText(/cell 0917 555 0142/i)).toBeInTheDocument()
  })

  // A history checkbox that was ticked must come back ticked, or editing an
  // address would silently clear someone's asthma.
  it('carries the recorded conditions back into the form', async () => {
    render(<PatientEditPage />)
    expect(await screen.findByText(/asthma true/i)).toBeInTheDocument()
  })

  // Null columns become '' because every form field is a string. Rendering
  // "null" into a text input is how that value gets saved back.
  it('turns absent values into empty strings, not the word null', async () => {
    render(<PatientEditPage />)
    await screen.findByText(/editing maria clara santos/i)
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument()
  })

  it('saves and returns to the profile', async () => {
    const user = userEvent.setup()
    render(<PatientEditPage />)
    await user.click(await screen.findByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(api.updatePatientHistory).toHaveBeenCalledWith('p-1', VALUES))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/patients/p-1'))
  })

  // The failure that had no handler at all: the rejection went unhandled, so
  // pressing Save on a refused write did nothing visible — no error, no
  // navigation — and read as success.
  it('says the save failed instead of appearing to do nothing', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePatientHistory).mockRejectedValue(
      new Error('new row violates row-level security policy'),
    )
    render(<PatientEditPage />)
    await user.click(await screen.findByRole('button', { name: /save changes/i }))
    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument()
  })

  it('stays on the form when the save failed, so the edits survive', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePatientHistory).mockRejectedValue(new Error('offline'))
    render(<PatientEditPage />)
    await user.click(await screen.findByRole('button', { name: /save changes/i }))
    await screen.findByText(/offline/i)
    expect(navigate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('surfaces a failure to load rather than spinning forever', async () => {
    vi.mocked(api.getPatient).mockRejectedValue(new Error('permission denied'))
    render(<PatientEditPage />)
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
  })
})
