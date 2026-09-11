import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

// A single mutable double for the Supabase client: the auth layer is
// entirely about what it does with the answers this returns.
//
// vi.hoisted, because vi.mock is lifted above every other statement in the
// file — a plain const here is still in its temporal dead zone when the
// factory runs.
const { db, auth } = vi.hoisted(() => ({
  db: {
    staffRow: null as Record<string, unknown> | null,
    error: null as { message: string } | null,
  },
  auth: {
    session: null as unknown,
    signOut: vi.fn(async () => ({ error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
  },
}))

vi.mock('../../core/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.staffRow, error: db.error }) }),
      }),
    }),
    auth: {
      getSession: async () => ({ data: { session: auth.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: auth.signOut,
      signInWithPassword: auth.signInWithPassword,
    },
  },
}))

function Probe() {
  const { staff, loading, deniedReason } = useAuth()
  if (loading) return <p>loading</p>
  return (
    <div>
      <p data-testid="staff">{staff ? `${staff.name}:${staff.role}` : 'none'}</p>
      <p data-testid="denied">{deniedReason ?? 'none'}</p>
    </div>
  )
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
const SESSION = { user: { id: 'u1' } }
const ACTIVE = {
  id: 'u1',
  name: 'Test Dentist',
  email: 'd@x.com',
  role: 'dentist',
  active: true,
  created_at: '2026-01-01',
}

describe('AuthContext', () => {
  beforeEach(() => {
    db.staffRow = null
    db.error = null
    auth.session = null
    auth.signOut.mockClear()
  })

  it('settles to signed-out when there is no session', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('staff')).toHaveTextContent('none'))
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('loads the staff profile behind a session', async () => {
    auth.session = SESSION
    db.staffRow = ACTIVE
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('staff')).toHaveTextContent('Test Dentist:dentist'))
    expect(screen.getByTestId('denied')).toHaveTextContent('none')
  })

  // Deactivation is enforced at the database too, but this is the
  // client-side backstop: a still-valid token must not get a working app.
  it('signs out a deactivated account and says why', async () => {
    auth.session = SESSION
    db.staffRow = { ...ACTIVE, active: false }
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('denied')).toHaveTextContent(/deactivated/i))
    expect(screen.getByTestId('staff')).toHaveTextContent('none')
    expect(auth.signOut).toHaveBeenCalled()
  })

  // Public signup is still enabled on the project (docs/COMPLIANCE.md
  // §1.2), so a stranger can hold a valid auth session with no staff row.
  // They must land nowhere.
  it('signs out an auth user with no staff record', async () => {
    auth.session = SESSION
    db.staffRow = null
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('denied')).toHaveTextContent(/no staff record/i))
    expect(screen.getByTestId('staff')).toHaveTextContent('none')
    expect(auth.signOut).toHaveBeenCalled()
  })

  // A failed lookup is not proof of anything, so it must not grant access —
  // but nor should it silently sign someone out mid-appointment.
  it('grants nothing when the profile lookup fails', async () => {
    auth.session = SESSION
    db.error = { message: 'network' }
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('denied')).toHaveTextContent(/could not load/i))
    expect(screen.getByTestId('staff')).toHaveTextContent('none')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('refuses to be used outside the provider', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/must be used within AuthProvider/i)
    quiet.mockRestore()
  })
})
