import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }))
vi.mock('../../core/supabaseClient', () => ({ supabase: { auth } }))

const ForgotPasswordPage = (await import('./ForgotPasswordPage')).default

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  )

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    auth.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
  })

  it('sends the reset email back to the app, not wherever Supabase defaults', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'staff@toothco.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('staff@toothco.test', {
        redirectTo: expect.stringContaining('/reset-password'),
      }),
    )
  })

  // Saying "no such account" would let anyone test which staff emails exist.
  it('does not reveal whether the account exists', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'nobody@toothco.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument()
  })

  // The form sets noValidate, so the app owns this message now.
  it('asks for an email rather than sending a reset for an empty address', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/enter your email address/i)).toBeInTheDocument()
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('shows a failure instead of claiming the email was sent', async () => {
    const user = userEvent.setup()
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: 'Email rate limit exceeded' } })
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'staff@toothco.test')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/rate limit/i)).toBeInTheDocument()
    expect(screen.queryByText(/if an account exists/i)).not.toBeInTheDocument()
  })

  it('offers a way back to sign in', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument()
  })
})
