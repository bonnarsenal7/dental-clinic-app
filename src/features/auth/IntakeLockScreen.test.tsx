import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabaseMock'
import { clearIntakeLock, setIntakeLock } from '../../core/intakeLock'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const signOut = vi.fn(async () => clearIntakeLock())
vi.mock('./AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 's1' } },
    staff: { id: 's1', name: 'Rosa Reyes', email: 'rosa@clinic.test', role: 'receptionist', active: true },
    loading: false,
    signOut,
  }),
}))

const { default: ProtectedRoute } = await import('./ProtectedRoute')

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/schedule" element={<p>THE DAY SHEET</p>} />
          <Route path="/patients" element={<p>THE PATIENT LIST</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('intake lock screen', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
    signOut.mockClear()
  })
  afterEach(() => {
    clearIntakeLock()
  })

  // The point of the lock: with a patient holding the tablet, nothing from
  // the staff app is on screen behind it.
  it('renders no staff screen while a patient has the tablet', () => {
    setIntakeLock()
    renderApp()
    expect(screen.getByRole('heading', { name: 'Patient intake in progress' })).toBeInTheDocument()
    expect(screen.queryByText('THE DAY SHEET')).not.toBeInTheDocument()
  })

  it('renders the screen normally when nothing is locked', () => {
    renderApp()
    expect(screen.getByText('THE DAY SHEET')).toBeInTheDocument()
  })

  it('stays locked on a wrong password', async () => {
    vi.mocked(sb.current!.auth.signInWithPassword).mockResolvedValueOnce({
      error: { message: 'Invalid login credentials' },
    } as never)
    setIntakeLock()
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/password for rosa reyes/i), 'guess')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText('That password is not right.')).toBeInTheDocument()
    expect(screen.queryByText('THE DAY SHEET')).not.toBeInTheDocument()
  })

  // Checked against Supabase as the signed-in staff member — not a PIN kept
  // in the browser — and it opens onto the list where the form is waiting.
  it('unlocks with the staff member’s own password, onto the patient list', async () => {
    setIntakeLock()
    renderApp()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/password for rosa reyes/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText('THE PATIENT LIST')).toBeInTheDocument()
    expect(sb.current!.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'rosa@clinic.test',
      password: 'correct horse',
    })
  })

  it('offers signing out instead', async () => {
    setIntakeLock()
    renderApp()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out instead' }))
    expect(signOut).toHaveBeenCalled()
  })
})
