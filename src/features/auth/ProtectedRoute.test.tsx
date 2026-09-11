import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProtectedRoute from './ProtectedRoute'
import type { StaffRole } from './types'

const { state, idle } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    staff: null as { id: string; role: string } | null,
    loading: false,
  },
  idle: { onIdle: null as null | (() => void), enabled: false },
}))

const signOut = vi.fn()
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ ...state, signOut }),
}))
vi.mock('./useIdleTimeout', () => ({
  useIdleTimeout: (cb: () => void, enabled: boolean) => {
    idle.onIdle = cb
    idle.enabled = enabled
  },
}))

function renderAt(path: string, allow?: StaffRole[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login screen</p>} />
        <Route path="/" element={<p>dashboard</p>} />
        <Route element={<ProtectedRoute allow={allow} />}>
          <Route path="/admin/staff" element={<p>staff admin</p>} />
          <Route path="/patients" element={<p>patients</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const ACTIVE = (role: string) => ({ id: 'u1', role })

describe('ProtectedRoute', () => {
  beforeEach(() => {
    state.session = null; state.staff = null; state.loading = false
    idle.onIdle = null; idle.enabled = false
    signOut.mockClear()
  })

  it('waits rather than redirecting while auth is still resolving', () => {
    state.loading = true
    renderAt('/patients')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText(/login screen/i)).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to the login screen', () => {
    renderAt('/patients')
    expect(screen.getByText(/login screen/i)).toBeInTheDocument()
  })

  // A valid auth session with no staff row must not pass — public signup
  // is still open, so this is reachable by a stranger.
  it('sends a session with no staff record to login', () => {
    state.session = { user: { id: 'u1' } }; state.staff = null
    renderAt('/patients')
    expect(screen.getByText(/login screen/i)).toBeInTheDocument()
  })

  it('lets any signed-in staff member through an ungated route', () => {
    state.session = { user: { id: 'u1' } }; state.staff = ACTIVE('receptionist')
    renderAt('/patients')
    expect(screen.getByText('patients')).toBeInTheDocument()
  })

  // The RLS policies are the real boundary; this stops a receptionist
  // landing on an admin screen that would simply fail to load.
  it.each<[StaffRole, boolean]>([
    ['admin', true],
    ['dentist', false],
    ['receptionist', false],
  ])('admin-only route with a %s: allowed=%s', (role, allowed) => {
    state.session = { user: { id: 'u1' } }; state.staff = ACTIVE(role)
    renderAt('/admin/staff', ['admin'])
    if (allowed) {
      expect(screen.getByText('staff admin')).toBeInTheDocument()
    } else {
      expect(screen.queryByText('staff admin')).not.toBeInTheDocument()
      expect(screen.getByText('dashboard')).toBeInTheDocument()
    }
  })

  it('lets dentist and admin into a clinical route but not reception', () => {
    for (const [role, allowed] of [['dentist', true], ['admin', true], ['receptionist', false]] as const) {
      state.session = { user: { id: 'u1' } }; state.staff = ACTIVE(role)
      const { unmount } = renderAt('/patients', ['dentist', 'admin'])
      expect(screen.queryByText('patients') !== null, role).toBe(allowed)
      unmount()
    }
  })

  // Shared clinic tablets: a chart left open at the front desk must not
  // stay open.
  it('arms the idle timeout only for a signed-in staff member', () => {
    renderAt('/patients')
    expect(idle.enabled).toBe(false)

    state.session = { user: { id: 'u1' } }; state.staff = ACTIVE('dentist')
    renderAt('/patients')
    expect(idle.enabled).toBe(true)
  })

  it('signs out when the idle timeout fires', () => {
    state.session = { user: { id: 'u1' } }; state.staff = ACTIVE('dentist')
    renderAt('/patients')
    idle.onIdle?.()
    expect(signOut).toHaveBeenCalled()
  })
})
