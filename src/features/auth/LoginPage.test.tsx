import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import { CLINIC_NAME } from '../../core/branding'

const signIn = vi.hoisted(() => vi.fn())
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: null, staff: null, deniedReason: null, signIn }),
}))

function renderPage() {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    signIn.mockReset()
    signIn.mockResolvedValue({ error: null })
  })

  // The login screen is pre-auth, so it can't read clinic_settings — its
  // name is hardcoded and free to drift from the one the rest of the app
  // shows. That drift is what this pins.
  it('shows the clinic name', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CLINIC_NAME)
  })

  it('uses the shared constant rather than its own string', () => {
    expect(CLINIC_NAME).toBe('ToothCo Dental Clinic')
  })

  it('reveals the password and hides it again', async () => {
    renderPage()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  // An iPad capitalises the first letter of a field unless told not to,
  // which turns a correct email into a failed login.
  it('does not let the keyboard capitalise or correct the email', () => {
    renderPage()
    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('autocapitalize', 'none')
    expect(email).toHaveAttribute('autocorrect', 'off')
  })

  it('signs in with a trimmed email and the password as typed', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), ' reception@clinic.ph ')
    await userEvent.type(screen.getByLabelText('Password'), ' secret pass ')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledWith('reception@clinic.ph', ' secret pass ')
  })

  it('announces a failed sign-in', async () => {
    signIn.mockResolvedValue({ error: 'Invalid login credentials' })
    renderPage()
    await userEvent.type(screen.getByLabelText('Email'), 'reception@clinic.ph')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })
})
