import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VisitTimeline from './VisitTimeline'

// Phase 6's exit criterion, as a test: "A simulated Wi-Fi drop mid-entry
// causes no crash and no lost data." The property it rests on is that
// reset() runs only after a successful await — so a rejected write leaves
// the form exactly as the dentist typed it.

vi.mock('./api', () => ({
  listVisits: vi.fn(),
  addVisitWithNote: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 'staff-1', name: 'Test Dentist', role: 'dentist' } }),
}))

const api = await import('./api')
const NOTE = 'Distal caries on 16, deep. Discussed options with patient.'

describe('VisitTimeline when the connection drops mid-entry', () => {
  beforeEach(() => {
    vi.mocked(api.listVisits).mockResolvedValue([])
    vi.mocked(api.addVisitWithNote).mockReset()
  })

  it('keeps the typed note on screen when the write fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addVisitWithNote).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<VisitTimeline patientId="p1" />)
    const notes = await screen.findByLabelText(/notes/i)
    await user.type(notes, NOTE)
    await user.click(screen.getByRole('button', { name: /add visit note/i }))

    // The note is still there to retry with — nothing typed was discarded.
    await waitFor(() => expect(notes).toHaveValue(NOTE))
  })

  it('explains the failure as a connection problem, not a raw fetch error', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addVisitWithNote).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<VisitTimeline patientId="p1" />)
    await user.type(await screen.findByLabelText(/notes/i), NOTE)
    await user.click(screen.getByRole('button', { name: /add visit note/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/you're offline/i)
    expect(alert).not.toHaveTextContent(/failed to fetch/i)
  })

  it('does not crash the screen', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addVisitWithNote).mockRejectedValue(new TypeError('Failed to fetch'))

    render(<VisitTimeline patientId="p1" />)
    await user.type(await screen.findByLabelText(/notes/i), NOTE)
    await user.click(screen.getByRole('button', { name: /add visit note/i }))

    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: /add visit note/i })).toBeEnabled()
  })

  // A real database error must keep its own wording — sending staff to
  // check the Wi-Fi over an RLS refusal would waste everyone's time.
  it('passes a real database error through unchanged', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addVisitWithNote).mockRejectedValue(
      new Error('new row violates row-level security policy for table "visit_notes"'),
    )

    render(<VisitTimeline patientId="p1" />)
    await user.type(await screen.findByLabelText(/notes/i), NOTE)
    await user.click(screen.getByRole('button', { name: /add visit note/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/row-level security/i)
  })

  it('clears the form once the write succeeds', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addVisitWithNote).mockResolvedValue(undefined)

    render(<VisitTimeline patientId="p1" />)
    const notes = await screen.findByLabelText(/notes/i)
    await user.type(notes, NOTE)
    await user.click(screen.getByRole('button', { name: /add visit note/i }))

    await waitFor(() => expect(notes).toHaveValue(''))
  })
})
