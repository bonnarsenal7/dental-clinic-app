import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navigate,
}))

const auth = vi.hoisted(() => ({ updateUser: vi.fn() }))
vi.mock('../../core/supabaseClient', () => ({ supabase: { auth } }))

const ResetPasswordPage = (await import('./ResetPasswordPage')).default

const renderPage = () =>
  render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>,
  )

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    navigate.mockClear()
    auth.updateUser.mockReset().mockResolvedValue({ error: null })
  })

  it('sets the new password', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/^new password$/i), 'correct-horse')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'correct-horse' }))
  })

  // The form sets noValidate, so these are the app's own messages rather
  // than browser-native bubbles — which differ per browser, cannot be
  // styled, and sit awkwardly on a tablet.
  it('refuses a password under eight characters, in its own words', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/^new password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm new password/i), 'short')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  // Typing a password you cannot see twice is how a typo becomes a lockout.
  it('refuses a mismatch rather than setting the first one', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/^new password$/i), 'correct-horse')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correct-mouse')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('guards an empty submit now that the browser no longer does', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('shows a refusal from the server and stays on the form', async () => {
    const user = userEvent.setup()
    auth.updateUser.mockResolvedValue({ error: { message: 'New password should be different' } })
    renderPage()
    await user.type(screen.getByLabelText(/^new password$/i), 'correct-horse')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/should be different/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument()
  })

  it('confirms success rather than leaving the form looking untouched', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/^new password$/i), 'correct-horse')
    await user.type(screen.getByLabelText(/confirm new password/i), 'correct-horse')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument()
  })
})
