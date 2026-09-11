import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StaffManagementPage from './StaffManagementPage'

vi.mock('./api', () => ({
  listStaff: vi.fn(),
  createStaff: vi.fn(),
  deactivateStaff: vi.fn(),
  reactivateStaff: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    staff: {
      id: 'me',
      name: 'Louie Arsenal',
      email: 'a@x.com',
      role: 'admin',
      active: true,
      created_at: '2026-01-01',
    },
  }),
}))

const api = await import('./api')

const STAFF = [
  {
    id: 'me',
    name: 'Louie Arsenal',
    email: 'a@x.com',
    role: 'admin',
    active: true,
    created_at: '2026-01-01',
  },
  {
    id: 'd1',
    name: 'Test Dentist',
    email: 'd@x.com',
    role: 'dentist',
    active: true,
    created_at: '2026-01-02',
  },
  {
    id: 'r1',
    name: 'Former Receptionist',
    email: 'r@x.com',
    role: 'receptionist',
    active: false,
    created_at: '2026-01-03',
  },
]

describe('StaffManagementPage', () => {
  beforeEach(() => {
    vi.mocked(api.listStaff).mockResolvedValue(STAFF as never)
    vi.mocked(api.createStaff).mockResolvedValue({
      staffId: 'n1',
      tempPassword: 'Tmp-9fA2xQ',
      note: 'ok',
    })
    vi.mocked(api.deactivateStaff).mockResolvedValue({ ok: true })
    vi.mocked(api.reactivateStaff).mockResolvedValue({ ok: true })
  })

  it('lists every account with its role and status', async () => {
    render(<StaffManagementPage />)
    expect(await screen.findByText('Test Dentist')).toBeInTheDocument()
    expect(screen.getByText('dentist')).toBeInTheDocument()
    expect(screen.getAllByText('Active')).toHaveLength(2)
    expect(screen.getByText('Deactivated')).toBeInTheDocument()
  })

  // An admin who deactivates their own account locks everyone out of staff
  // management, and recovery means going back to the SQL editor.
  it('will not let an admin deactivate themselves', async () => {
    render(<StaffManagementPage />)
    await screen.findByText('Louie Arsenal')
    // One button for the dentist; none for the signed-in admin or for the
    // account that is already off.
    expect(screen.getAllByRole('button', { name: /deactivate/i })).toHaveLength(1)
  })

  it('offers restore, not deactivate, on an already-inactive account', async () => {
    render(<StaffManagementPage />)
    await screen.findByText('Former Receptionist')
    const row = within(screen.getByText('Former Receptionist').closest('tr')!)
    expect(row.getByRole('button', { name: /restore access/i })).toBeInTheDocument()
    expect(row.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument()
  })

  // Deactivation sets staff.active = false AND bans the login in GoTrue, so
  // restoring has to undo both. Going through the Edge Function is the only
  // way to lift the ban — flipping the flag from the browser would produce
  // an account that reads as active here and still cannot sign in.
  it('restores through the edge function, not a direct flag change', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Former Receptionist')
    await user.click(screen.getByRole('button', { name: /restore access/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/restore access for former receptionist/i)
    expect(dialog).toHaveTextContent(/log in again immediately/i)
    await user.click(within(dialog).getByRole('button', { name: /^restore access$/i }))
    await waitFor(() => expect(api.reactivateStaff).toHaveBeenCalledWith('r1'))
  })

  it('does not restore if the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Former Receptionist')
    await user.click(screen.getByRole('button', { name: /restore access/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.reactivateStaff).not.toHaveBeenCalled()
  })

  // The person restoring needs to know the password did not come back with
  // the account, or they will tell the staff member to just log in.
  it('says the password is unchanged', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Former Receptionist')
    await user.click(screen.getByRole('button', { name: /restore access/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/password is unchanged/i)
  })

  it('refreshes so the account shows as active again', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Former Receptionist')
    await user.click(screen.getByRole('button', { name: /restore access/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^restore access$/i }))
    await waitFor(() => expect(api.listStaff).toHaveBeenCalledTimes(2))
  })

  // Deactivation signs someone out and blocks future logins, so it asks —
  // in a real dialog now, not a browser confirm that cannot be styled,
  // tested through the UI, or made to say who is being deactivated.
  it('asks in a dialog that names the account and the consequence', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /deactivate/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/deactivate test dentist/i)
    expect(dialog).toHaveTextContent(/signed out immediately/i)
    expect(api.deactivateStaff).not.toHaveBeenCalled()
  })

  it('deactivates once confirmed, and closes', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.click(screen.getByRole('button', { name: /deactivate/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^deactivate$/i }))
    await waitFor(() => expect(api.deactivateStaff).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does nothing if the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.click(screen.getByRole('button', { name: /deactivate/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deactivateStaff).not.toHaveBeenCalled()
  })

  // Escape must work, or the dialog is a trap on a keyboard.
  it('closes on Escape without deactivating', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.click(screen.getByRole('button', { name: /deactivate/i }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.deactivateStaff).not.toHaveBeenCalled()
  })

  // A failure behind the dialog is a failure nobody reads.
  it('reports a failure inside the dialog and stays open', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deactivateStaff).mockRejectedValue(
      new Error('Only an active admin may deactivate accounts'),
    )
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.click(screen.getByRole('button', { name: /deactivate/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^deactivate$/i }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/only an active admin/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // The temporary password is shown once, for the admin to relay
  // out-of-band. There is no email invite flow.
  it('shows the temporary password once, with what to do with it', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.type(screen.getByLabelText(/full name/i), 'New Receptionist')
    await user.type(screen.getByLabelText(/email/i), 'new@x.com')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(api.createStaff).toHaveBeenCalled())
    expect(vi.mocked(api.createStaff).mock.calls[0][0]).toMatchObject({
      name: 'New Receptionist',
      email: 'new@x.com',
      role: 'receptionist',
    })
    expect(await screen.findByText(/Tmp-9fA2xQ/)).toBeInTheDocument()
    expect(screen.getByText(/share this with them directly/i)).toBeInTheDocument()
  })

  it('creates with the chosen role', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.type(screen.getByLabelText(/full name/i), 'New Dentist')
    await user.type(screen.getByLabelText(/email/i), 'nd@x.com')
    await user.selectOptions(screen.getByLabelText(/role/i), 'dentist')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(api.createStaff).toHaveBeenCalled())
    expect(vi.mocked(api.createStaff).mock.calls[0][0]).toMatchObject({ role: 'dentist' })
  })

  it('refreshes the list after creating, so the new account appears', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.type(screen.getByLabelText(/full name/i), 'New Receptionist')
    await user.type(screen.getByLabelText(/email/i), 'new@x.com')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() => expect(api.listStaff).toHaveBeenCalledTimes(2))
  })

  // The form sets noValidate, so these are the app's own messages rather
  // than browser-native bubbles.
  it('names its own validation messages', async () => {
    const user = userEvent.setup()
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    expect(api.createStaff).not.toHaveBeenCalled()
  })

  // The Edge Function verifies the caller is an active admin; a refusal
  // must be legible rather than swallowed.
  it('surfaces a refusal from the edge function', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createStaff).mockRejectedValue(new Error('Only an active admin may create accounts'))
    render(<StaffManagementPage />)
    await screen.findByText('Test Dentist')
    await user.type(screen.getByLabelText(/full name/i), 'X')
    await user.type(screen.getByLabelText(/email/i), 'x@x.com')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/only an active admin/i)
  })
})
