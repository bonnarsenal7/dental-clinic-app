import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffRole } from '../auth/types'

const auth = vi.hoisted(() => ({ role: 'receptionist' as StaffRole }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ staff: { id: 's-1', role: auth.role } }) }))
vi.mock('../patients/api', () => ({ searchPatients: vi.fn() }))

const api = await import('../patients/api')
const BillingPage = (await import('./BillingPage')).default

const PATIENTS = [{ id: 'p-1', name: 'Maria Clara Santos', cell_number: '0917 555 0142', phone_number: null }]

function renderPage(role: StaffRole = 'receptionist') {
  auth.role = role
  return render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>,
  )
}

describe('BillingPage', () => {
  beforeEach(() => {
    vi.mocked(api.searchPatients)
      .mockReset()
      .mockResolvedValue(PATIENTS as never)
  })

  it('opens the ledger inside the patient’s record', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /open ledger/i })).toHaveAttribute(
      'href',
      '/patients/p-1/billing',
    )
  })

  // The price list sets what every patient is charged, so it is admin-only.
  it.each(['receptionist', 'dentist'] as const)('hides the price list from a %s', async (role) => {
    renderPage(role)
    await screen.findByText('Maria Clara Santos')
    expect(screen.queryByRole('link', { name: /price list/i })).not.toBeInTheDocument()
  })

  it('offers the price list to an admin', async () => {
    renderPage('admin')
    expect(await screen.findByRole('link', { name: /price list/i })).toHaveAttribute(
      'href',
      '/billing/prices',
    )
  })

  it('reports a failed search instead of an empty list', async () => {
    vi.mocked(api.searchPatients).mockRejectedValue(new Error('could not connect'))
    renderPage()
    expect(await screen.findByText(/could not connect/i)).toBeInTheDocument()
  })
})
