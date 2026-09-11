import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import { CLINIC_NAME } from '../../core/branding'

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: null, staff: null, deniedReason: null, signIn: vi.fn() }),
}))

describe('LoginPage', () => {
  // The login screen is pre-auth, so it can't read clinic_settings — its
  // name is hardcoded and free to drift from the one the rest of the app
  // shows. That drift is what this pins.
  it('shows the clinic name', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CLINIC_NAME)
  })

  it('uses the shared constant rather than its own string', () => {
    expect(CLINIC_NAME).toBe('ToothCo Dental Clinic')
  })
})
