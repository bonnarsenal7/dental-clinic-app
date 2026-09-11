import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../patients/api', () => ({ searchPatients: vi.fn() }))
const api = await import('../patients/api')
const ChartingPage = (await import('./ChartingPage')).default

const PATIENTS = [
  { id: 'p-1', name: 'Maria Clara Santos', cell_number: '0917 555 0142', phone_number: null },
  { id: 'p-2', name: 'Jose Miguel Reyes', cell_number: null, phone_number: null },
]

const renderPage = () =>
  render(
    <MemoryRouter>
      <ChartingPage />
    </MemoryRouter>,
  )

describe('ChartingPage', () => {
  beforeEach(() => {
    vi.mocked(api.searchPatients)
      .mockReset()
      .mockImplementation(
        async (q: string) =>
          (q.trim()
            ? PATIENTS.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
            : PATIENTS) as never,
      )
  })

  it('opens the chart in the patient’s own record', async () => {
    renderPage()
    const row = (await screen.findByText('Maria Clara Santos')).closest('div')!.parentElement!
    expect(within(row).getByRole('link', { name: /open chart/i })).toHaveAttribute(
      'href',
      '/patients/p-1/chart',
    )
  })

  it('narrows the list as you type', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Maria Clara Santos')
    await user.type(screen.getByPlaceholderText(/search name or contact/i), 'reyes')
    // Both were listed to start with, so the assertion is that Maria goes —
    // finding Jose proves nothing on its own.
    await waitFor(() => expect(screen.queryByText('Maria Clara Santos')).not.toBeInTheDocument())
    expect(screen.getByText('Jose Miguel Reyes')).toBeInTheDocument()
  })

  // "Loading" and "none found" must not look alike, or a slow connection
  // reads as an empty patient list.
  it('distinguishes loading from nothing found', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByText(/loading…/i)).toBeInTheDocument()
    await screen.findByText('Maria Clara Santos')
    await user.type(screen.getByPlaceholderText(/search name or contact/i), 'zzz')
    expect(await screen.findByText(/no patients found/i)).toBeInTheDocument()
  })

  it('says when a patient has no number rather than leaving a gap', async () => {
    renderPage()
    expect(await screen.findByText(/no contact number on file/i)).toBeInTheDocument()
  })

  it('reports a failed search instead of an empty list', async () => {
    vi.mocked(api.searchPatients).mockRejectedValue(new Error('permission denied'))
    renderPage()
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
  })
})
