import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PatientsPage from './PatientsPage'

vi.mock('./api', () => ({ searchPatients: vi.fn() }))
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
    vi.mocked(api.searchPatients).mockResolvedValue(PATIENTS as never)
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
    await waitFor(() => expect(api.searchPatients).toHaveBeenCalledWith('dela'))
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
