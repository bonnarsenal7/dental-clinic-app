import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AssignedPatientRoute from './AssignedPatientRoute'

vi.mock('./api', () => ({ isAssignedToDentist: vi.fn() }))
const auth = vi.hoisted(() => ({ role: 'dentist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's-1', name: 'Dr Cruz', role: auth.role } }),
}))

const api = await import('./api')

const renderAt = (path = '/patients/p-1') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AssignedPatientRoute />}>
          <Route path="/patients/:id" element={<p>patient record</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('AssignedPatientRoute', () => {
  beforeEach(() => {
    auth.role = 'dentist'
    vi.mocked(api.isAssignedToDentist).mockReset().mockResolvedValue(true)
  })

  it.each(['receptionist', 'admin'] as const)('lets a %s straight through without asking', async (role) => {
    auth.role = role
    renderAt()
    expect(await screen.findByText('patient record')).toBeInTheDocument()
    expect(api.isAssignedToDentist).not.toHaveBeenCalled()
  })

  it("opens a dentist's own patient", async () => {
    renderAt()
    expect(await screen.findByText('patient record')).toBeInTheDocument()
    expect(api.isAssignedToDentist).toHaveBeenCalledWith('p-1', 's-1')
  })

  // The record's screen must not even mount: mounting it fetches the record
  // and logs a view, for a patient the dentist was never shown.
  it('keeps a dentist out of a patient not booked with them', async () => {
    vi.mocked(api.isAssignedToDentist).mockResolvedValue(false)
    renderAt()
    expect(await screen.findByText(/isn't assigned to you/i)).toBeInTheDocument()
    expect(screen.queryByText('patient record')).not.toBeInTheDocument()
  })

  it('does not show the record while the check is still out', () => {
    vi.mocked(api.isAssignedToDentist).mockReturnValue(new Promise(() => {}))
    renderAt()
    expect(screen.queryByText('patient record')).not.toBeInTheDocument()
  })

  it('reports a failed check rather than opening the record', async () => {
    vi.mocked(api.isAssignedToDentist).mockRejectedValue(new TypeError('Failed to fetch'))
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
    expect(screen.queryByText('patient record')).not.toBeInTheDocument()
  })

  // One way around a patient's record, on every screen about them. Each
  // screen used to carry its own, which is how some ended up with none.
  describe('the patient tabs', () => {
    it('are on every screen about the patient, pointing at that patient', async () => {
      renderAt()
      await screen.findByText('patient record')
      const tabs = within(screen.getByRole('navigation', { name: /patient record/i }))
      expect(tabs.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/patients/p-1')
      expect(tabs.getByRole('link', { name: /dental chart/i })).toHaveAttribute('href', '/patients/p-1/chart')
      expect(tabs.getByRole('link', { name: 'Billing' })).toHaveAttribute('href', '/patients/p-1/billing')
    })

    // Mirrors the RLS boundary: reception has no policy at all on
    // tooth_records, and the route refuses them — so the tab would bounce.
    it('keep the chart from a receptionist', async () => {
      auth.role = 'receptionist'
      renderAt()
      await screen.findByText('patient record')
      expect(screen.queryByRole('link', { name: /dental chart/i })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Billing' })).toBeInTheDocument()
    })

    // A dentist who may not open this record should not be handed tabs into
    // the rest of it.
    it('are not shown with the refusal', async () => {
      vi.mocked(api.isAssignedToDentist).mockResolvedValue(false)
      renderAt()
      await screen.findByText(/isn't assigned to you/i)
      expect(screen.queryByRole('navigation', { name: /patient record/i })).not.toBeInTheDocument()
    })
  })
})
