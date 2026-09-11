import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabaseMock'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const ClinicSettingsPage = (await import('./ClinicSettingsPage')).default
const db = () => sb.current!

describe('ClinicSettingsPage', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  it('shows the settings that are already saved', async () => {
    db().queue('clinic_settings', { data: { clinic_name: 'ToothCo', operating_hours: 'Mon–Sat' } })
    render(<ClinicSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/clinic name/i)).toHaveValue('ToothCo'))
    expect(screen.getByLabelText(/operating hours/i)).toHaveValue('Mon–Sat')
  })

  it('saves to the single settings row', async () => {
    const user = userEvent.setup()
    db().queue('clinic_settings', { data: { clinic_name: 'ToothCo', operating_hours: '' } })
    db().queue('clinic_settings', { data: null })
    render(<ClinicSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/clinic name/i)).toHaveValue('ToothCo'))

    await user.clear(screen.getByLabelText(/clinic name/i))
    await user.type(screen.getByLabelText(/clinic name/i), 'ToothCo Dental Clinic')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(db().query('clinic_settings', 1)).toBeDefined())
    expect(db().query('clinic_settings', 1)!.payload).toMatchObject({
      clinic_name: 'ToothCo Dental Clinic',
    })
    expect(
      db()
        .query('clinic_settings', 1)!
        .calls.find((c) => c.method === 'eq')?.args,
    ).toEqual(['id', 1])
  })

  // Saving silently is how someone leaves the screen unsure whether the
  // rename took.
  it('confirms the save', async () => {
    const user = userEvent.setup()
    db().queue('clinic_settings', { data: { clinic_name: 'ToothCo', operating_hours: '' } })
    db().queue('clinic_settings', { data: null })
    render(<ClinicSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/clinic name/i)).toHaveValue('ToothCo'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/saved\./i)).toBeInTheDocument()
  })

  it('reports a refusal instead of claiming it saved', async () => {
    const user = userEvent.setup()
    db().queue('clinic_settings', { data: { clinic_name: 'ToothCo', operating_hours: '' } })
    db().queue('clinic_settings', { error: { message: 'permission denied for table clinic_settings' } })
    render(<ClinicSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText(/clinic name/i)).toHaveValue('ToothCo'))
    await user.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
    expect(screen.queryByText(/^saved\.$/i)).not.toBeInTheDocument()
  })

  it('surfaces a failure to load rather than showing a blank form', async () => {
    db().queue('clinic_settings', { error: { message: 'could not connect' } })
    render(<ClinicSettingsPage />)
    expect(await screen.findByText(/could not connect/i)).toBeInTheDocument()
  })
})
