import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PatientsPage from './PatientsPage'

vi.mock('./api', () => ({ searchPatients: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'receptionist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's-1', name: 'Test', role: auth.role } }),
}))
vi.mock('./intake/api', () => ({ listPendingIntakes: vi.fn(), startIntake: vi.fn() }))
const api = await import('./api')
const intakeApi = await import('./intake/api')

const PATIENTS = [
  {
    id: 'p1',
    name: 'Angelica Dela Cruz',
    cell_number: '0920 555 0388',
    phone_number: null,
    created_at: '2026-01-05T00:00:00Z',
  },
  {
    id: 'p2',
    name: 'Ricardo Bautista',
    cell_number: '0927 555 0411',
    phone_number: '(02) 8724 1190',
    created_at: '2026-02-11T00:00:00Z',
  },
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <PatientsPage />
    </MemoryRouter>,
  )

describe('PatientsPage', () => {
  beforeEach(() => {
    auth.role = 'receptionist'
    vi.mocked(api.searchPatients)
      .mockReset()
      .mockResolvedValue(PATIENTS as never)
    vi.mocked(intakeApi.listPendingIntakes).mockReset().mockResolvedValue([])
  })

  // Forms patients typed themselves wait here for reception to review.
  it('lists patient forms waiting for review, linked to the review screen', async () => {
    vi.mocked(intakeApi.listPendingIntakes).mockResolvedValue([
      {
        id: 'in-1',
        patient_id: 'p-new',
        payload: { name: 'Lorna Villanueva' },
        submitted_at: '2026-09-28T01:00:00Z',
        status: 'pending',
      },
    ] as never)
    renderPage()
    expect(await screen.findByText('1 patient form waiting for review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lorna Villanueva' })).toHaveAttribute('href', '/intakes/in-1')
    expect(screen.getByRole('button', { name: 'Patient fills in form' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /qr code for patient’s phone/i })).toBeInTheDocument()
  })

  // Registration is the front desk's, and so is the patient's own form.
  it('offers a dentist neither the intake nor its queue', async () => {
    auth.role = 'dentist'
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    expect(screen.queryByRole('button', { name: 'Patient fills in form' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /qr code/i })).not.toBeInTheDocument()
    expect(intakeApi.listPendingIntakes).not.toHaveBeenCalled()
  })

  it('searches the whole clinic for reception', async () => {
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    expect(api.searchPatients).toHaveBeenCalledWith('', undefined, undefined)
  })

  describe('patient type', () => {
    it('lists every type until one is chosen', async () => {
      renderPage()
      await screen.findByRole('link', { name: /angelica/i })
      expect(screen.getByLabelText(/patient type/i)).toHaveValue('')
      expect(api.searchPatients).toHaveBeenCalledWith('', undefined, undefined)
    })

    it('narrows the list to one type, and back to all', async () => {
      const user = userEvent.setup()
      renderPage()
      await screen.findByRole('link', { name: /angelica/i })
      await user.selectOptions(screen.getByLabelText(/patient type/i), 'orthodontic')
      await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('', undefined, 'orthodontic'))
      await user.selectOptions(screen.getByLabelText(/patient type/i), '')
      await waitFor(() =>
        expect(vi.mocked(api.searchPatients).mock.calls.at(-1)).toEqual(['', undefined, undefined]),
      )
    })

    it('shows each patient’s type in the list', async () => {
      vi.mocked(api.searchPatients).mockResolvedValue([
        { ...PATIENTS[0], patient_type: 'orthodontic' },
        { ...PATIENTS[1], patient_type: 'regular' },
      ] as never)
      renderPage()
      // Wait for the patients themselves: the header and the "Loading…" row
      // are already there, so findAllByRole('row') resolves before they are.
      await screen.findByRole('link', { name: /angelica/i })
      const rows = screen.getAllByRole('row')
      expect(within(rows[1]).getByText('Orthodontic')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Regular')).toBeInTheDocument()
    })
  })

  // A dentist's list is today's patients — anyone booked with them today.
  it("scopes a dentist's list to their own patients", async () => {
    auth.role = 'dentist'
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    expect(api.searchPatients).toHaveBeenCalledWith('', 's-1', undefined)
  })

  // An empty day is not a failed search: it says why the list is empty.
  it('tells a dentist with no bookings today that nobody is booked', async () => {
    auth.role = 'dentist'
    vi.mocked(api.searchPatients).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No patients are booked with you today.')).toBeInTheDocument()
  })

  // Registration is the front desk's, and a patient a dentist registered
  // would not be booked with them — so it would vanish from their own list.
  it('does not offer registration to a dentist', async () => {
    auth.role = 'dentist'
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    expect(screen.queryByRole('link', { name: /register patient/i })).not.toBeInTheDocument()
  })

  it('lists patients with a link into each record', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /angelica dela cruz/i })
    expect(link).toHaveAttribute('href', '/patients/p1')
    expect(screen.getByText('0927 555 0411')).toBeInTheDocument()
  })

  // The search is debounced; typing must not fire a request per keystroke.
  it('debounces the search rather than querying on every keystroke', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    vi.mocked(api.searchPatients).mockClear()
    await user.type(screen.getByPlaceholderText(/search name or contact/i), 'dela')
    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('dela', undefined, undefined))
    expect(vi.mocked(api.searchPatients).mock.calls.length).toBeLessThan(4)
  })

  it('says so when nothing matches, rather than showing an empty table', async () => {
    vi.mocked(api.searchPatients).mockResolvedValue([] as never)
    renderPage()
    expect(await screen.findByText(/no patients found/i)).toBeInTheDocument()
  })

  it('offers registration', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /register patient/i })).toHaveAttribute(
      'href',
      '/patients/new',
    )
  })

  it('reports a dropped connection in plain language', async () => {
    vi.mocked(api.searchPatients).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
  })
})
