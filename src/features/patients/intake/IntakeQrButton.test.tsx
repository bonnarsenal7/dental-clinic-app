import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import IntakeQrButton from './IntakeQrButton'
import { clearIntakeLock } from '../../../core/intakeLock'

vi.mock('./api', () => ({ startIntake: vi.fn() }))

// The SVG itself cannot be decoded here; what matters is what it encodes.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, ...rest }: { value: string; 'aria-label'?: string }) => (
    <div role="img" aria-label={rest['aria-label']} data-value={value} />
  ),
}))

const api = await import('./api')

describe('IntakeQrButton', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_INTAKE_ORIGIN', 'https://toothco-intake.vercel.app')
    vi.mocked(api.startIntake).mockReset().mockResolvedValue('Ab-_9x')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    clearIntakeLock()
  })

  it('shows a QR code for a fresh one-time phone link', async () => {
    const user = userEvent.setup()
    render(<IntakeQrButton />)
    await user.click(screen.getByRole('button', { name: /qr code for patient’s phone/i }))

    const qr = await screen.findByRole('img', { name: /qr code for the patient’s intake form/i })
    expect(qr).toHaveAttribute('data-value', 'https://toothco-intake.vercel.app/#phone:Ab-_9x')
    expect(api.startIntake).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/works once, for two hours/i)).toBeInTheDocument()
  })

  // The patient holds their own phone, not the clinic's tablet — reception
  // keeps working.
  it('does not lock the staff screen', async () => {
    const user = userEvent.setup()
    render(<IntakeQrButton />)
    await user.click(screen.getByRole('button', { name: /qr code for patient’s phone/i }))
    await screen.findByRole('img', { name: /qr code/i })
    expect(window.localStorage.getItem('toothco.intakeLock')).toBeNull()
  })

  it('forgets the code when closed', async () => {
    const user = userEvent.setup()
    render(<IntakeQrButton />)
    await user.click(screen.getByRole('button', { name: /qr code for patient’s phone/i }))
    await screen.findByRole('img', { name: /qr code/i })
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument()
  })

  it('says why when a code cannot be issued', async () => {
    vi.mocked(api.startIntake).mockRejectedValue(new Error('Only the front desk can start a patient intake.'))
    const user = userEvent.setup()
    render(<IntakeQrButton />)
    await user.click(screen.getByRole('button', { name: /qr code for patient’s phone/i }))
    expect(await screen.findByText(/only the front desk/i)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /qr code/i })).not.toBeInTheDocument()
  })
})
