import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RecallsPage from './RecallsPage'

vi.mock('./api', () => ({ listDueRecalls: vi.fn(), setRecallStatus: vi.fn() }))
const api = await import('./api')

function recall(id: string, dueOffsetDays: number, name = 'Maria Clara Santos') {
  const d = new Date()
  d.setDate(d.getDate() + dueOffsetDays)
  return {
    id, patient_id: `pat-${id}`,
    due_on: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    reason: 'Six-month check-up and cleaning', interval_months: 6, status: 'due' as const,
    appointment_id: null, created_by: null, created_at: '2026-01-01T00:00:00Z', completed_at: null,
    patients: { id: `pat-${id}`, name, cell_number: '0917 555 0142', phone_number: null },
  }
}

const renderPage = () => render(<MemoryRouter><RecallsPage /></MemoryRouter>)

describe('RecallsPage', () => {
  beforeEach(() => {
    vi.mocked(api.listDueRecalls).mockResolvedValue([recall('r1', -45)] as never)
    vi.mocked(api.setRecallStatus).mockResolvedValue(undefined)
  })

  it('says how overdue someone is, not just that they are due', async () => {
    renderPage()
    expect(await screen.findByText(/45 days overdue/i)).toBeInTheDocument()
  })

  it('shows a future recall as a due date rather than as overdue', async () => {
    vi.mocked(api.listDueRecalls).mockResolvedValue([recall('r2', 14)] as never)
    renderPage()
    expect(await screen.findByText(/^due /i)).toBeInTheDocument()
    // Scoped to the badge wording: "Overdue now" is also one of the horizon
    // filter buttons, so a page-wide /overdue/i match proves nothing.
    expect(screen.queryByText(/days? overdue/i)).not.toBeInTheDocument()
  })

  // This link was dead until the schedule learned to read ?patient=.
  it('books through to the schedule for that patient', async () => {
    renderPage()
    const book = await screen.findByRole('link', { name: /^book$/i })
    expect(book).toHaveAttribute('href', '/schedule?patient=pat-r1')
  })

  it('dismisses a recall and refreshes', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/45 days overdue/i)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(api.setRecallStatus).toHaveBeenCalledWith('r1', 'dismissed'))
    expect(api.listDueRecalls).toHaveBeenCalledTimes(2)
  })

  it('widens the window when a longer horizon is chosen', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText(/45 days overdue/i)
    const before = vi.mocked(api.listDueRecalls).mock.calls.at(-1)![0] as Date
    await user.click(screen.getByRole('button', { name: /next 90 days/i }))
    await waitFor(() => {
      const after = vi.mocked(api.listDueRecalls).mock.calls.at(-1)![0] as Date
      expect(after.getTime()).toBeGreaterThan(before.getTime())
    })
  })

  it('says when nobody is due', async () => {
    vi.mocked(api.listDueRecalls).mockResolvedValue([] as never)
    renderPage()
    expect(await screen.findByText(/nobody due in this window/i)).toBeInTheDocument()
  })
})
