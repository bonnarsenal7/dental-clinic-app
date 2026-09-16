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
const api = await import('./api')

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

  // A dentist's list is their own patients — anyone booked with them.
  it("scopes a dentist's list to their own patients", async () => {
    auth.role = 'dentist'
    renderPage()
    await screen.findByRole('link', { name: /angelica/i })
    expect(api.searchPatients).toHaveBeenCalledWith('', 's-1', undefined)
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
