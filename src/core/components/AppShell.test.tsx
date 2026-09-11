import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffRole } from '../../features/auth/types'

const signOut = vi.fn()
const auth = vi.hoisted(() => ({
  staff: { id: 's-1', name: 'Louie Arsenal', email: 'a@x.com', role: 'admin', active: true } as {
    id: string
    name: string
    email: string
    role: StaffRole
    active: boolean
  } | null,
}))

vi.mock('../../features/auth/AuthContext', () => ({
  useAuth: () => ({ staff: auth.staff, signOut }),
}))
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}))
vi.mock('../routes', () => ({ warmRoutesFor: vi.fn() }))

const AppShell = (await import('./AppShell')).default

function renderShell(role: StaffRole = 'admin') {
  auth.staff = { id: 's-1', name: 'Louie Arsenal', email: 'a@x.com', role, active: true }
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
}

/** The signed-in cluster: name, role, and the two account controls. */
function accountCluster() {
  return screen.getByText('Louie Arsenal').closest('div')!.parentElement!
}

describe('AppShell', () => {
  beforeEach(() => {
    signOut.mockClear()
  })

  // --- The account cluster ------------------------------------------------

  it('shows who is signed in and in what role', () => {
    renderShell('receptionist')
    expect(screen.getByText('Louie Arsenal')).toBeInTheDocument()
    expect(screen.getByText('receptionist')).toBeInTheDocument()
  })

  // Reported as "mis align or out of place". On a tablet the
  // `pointer: coarse` rule grows every <button> to 44px, but only matches
  // links that carry a rounded-md utility — so a bare text "Change password"
  // link sat at text height beside a 44px "Sign out" button. Both controls
  // must be the same shape for the rule to treat them alike.
  it('gives both account controls the same button shape', () => {
    renderShell()
    const cluster = within(accountCluster())
    const changePassword = cluster.getByRole('link', { name: /change password/i })
    const signOutButton = cluster.getByRole('button', { name: /sign out/i })

    for (const el of [changePassword, signOutButton]) {
      expect(el.className).toContain('rounded-md')
      expect(el.className).toContain('inline-flex')
      expect(el.className).toContain('items-center')
    }
    // Same size step, so they are the same height rather than merely aligned.
    expect(changePassword.className).toContain('py-1.5')
    expect(signOutButton.className).toContain('py-1.5')
  })

  it('keeps the name and role together, beside the controls', () => {
    renderShell()
    const cluster = within(accountCluster())
    expect(cluster.getByText('Louie Arsenal')).toBeInTheDocument()
    expect(cluster.getByText('admin')).toBeInTheDocument()
    expect(cluster.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  // A long clinic name used to squeeze the account cluster; it truncates now
  // rather than wrapping the controls onto their own line.
  it('does not let the nav and the account cluster share a wrapping row', () => {
    renderShell()
    const nav = screen.getByRole('navigation')
    expect(nav.contains(screen.getByRole('button', { name: /sign out/i }))).toBe(false)
    // The nav is its own row: its parent is the header's column, not a
    // justify-between row also holding the account controls.
    expect(nav.parentElement!.className).toContain('flex-col')
  })

  it('signs out when the button is pressed', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: /sign out/i }))
    expect(signOut).toHaveBeenCalled()
  })

  // --- Role-aware navigation ----------------------------------------------

  // This mirrors an RLS boundary, so it is worth pinning: a receptionist has
  // no policy at all on tooth_records, and the admin screens manage access
  // itself. The nav is not the enforcement, but a link to a screen that will
  // refuse you is a bug report waiting to happen.
  it('hides charting from a receptionist', () => {
    renderShell('receptionist')
    expect(screen.queryByRole('link', { name: /charting/i })).not.toBeInTheDocument()
  })

  it('shows charting to a dentist', () => {
    renderShell('dentist')
    expect(screen.getByRole('link', { name: /charting/i })).toBeInTheDocument()
  })

  it.each(['receptionist', 'dentist'] as const)('hides the admin screens from a %s', (role) => {
    renderShell(role)
    expect(screen.queryByRole('link', { name: /^staff$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /clinic settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /audit log/i })).not.toBeInTheDocument()
  })

  it('shows the admin screens to an admin', () => {
    renderShell('admin')
    expect(screen.getByRole('link', { name: /^staff$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clinic settings/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /audit log/i })).toBeInTheDocument()
  })

  it.each(['receptionist', 'dentist', 'admin'] as const)(
    'gives every role the day-to-day screens (%s)',
    (role) => {
      renderShell(role)
      for (const name of [/dashboard/i, /schedule/i, /patients/i, /billing/i]) {
        expect(screen.getByRole('link', { name })).toBeInTheDocument()
      }
    },
  )

  it('renders nothing at all when nobody is signed in', () => {
    auth.staff = null
    const { container } = render(
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
