import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IntakePage from './IntakePage'

vi.mock('./api', () => ({ getIntakeStatus: vi.fn(), submitIntake: vi.fn() }))

// The 23-field form is covered by its own tests; here it only has to hand
// the page a filled-in registration.
vi.mock('../PatientForm', async () => {
  const actual = await vi.importActual<typeof import('../PatientForm')>('../PatientForm')
  return {
    ...actual,
    default: ({
      onSubmit,
      submitLabel,
      canChooseType,
    }: {
      onSubmit: (v: unknown) => Promise<void>
      submitLabel: string
      canChooseType?: boolean
    }) => (
      <div>
        {canChooseType !== false && <span>TYPE CHOOSER OFFERED</span>}
        <button onClick={() => void onSubmit({ ...actual.EMPTY_PATIENT_FORM, name: 'Maria Clara Santos' })}>
          {submitLabel}
        </button>
      </div>
    ),
  }
})

const pad = { empty: false }
vi.mock('react-signature-canvas', async () => {
  const { Component } = await import('react')
  return {
    default: class SignatureCanvasStub extends Component {
      isEmpty() {
        return pad.empty
      }
      clear() {
        pad.empty = true
      }
      toDataURL() {
        return 'data:image/png;base64,SIGNATURE'
      }
      render() {
        return null
      }
    },
  }
})

const api = await import('./api')

async function reachSignature() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Check my answers' }))
  await user.click(screen.getByRole('button', { name: /everything is correct/i }))
  return user
}

describe('IntakePage', () => {
  beforeEach(() => {
    pad.empty = false
    vi.mocked(api.getIntakeStatus).mockResolvedValue('ready')
    vi.mocked(api.submitIntake).mockReset()
  })

  // The category is reception's; the patient is never asked.
  it('does not offer the patient a type to choose', async () => {
    render(<IntakePage code="abc" />)
    await screen.findByRole('button', { name: 'Check my answers' })
    expect(screen.queryByText('TYPE CHOOSER OFFERED')).not.toBeInTheDocument()
  })

  it('refuses a spent code before anyone starts typing', async () => {
    vi.mocked(api.getIntakeStatus).mockResolvedValue('used')
    render(<IntakePage code="abc" />)
    expect(await screen.findByText(/already been submitted/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check my answers' })).not.toBeInTheDocument()
  })

  it('treats a missing code as invalid without asking the database', async () => {
    render(<IntakePage code="" />)
    expect(await screen.findByText(/not valid/i)).toBeInTheDocument()
    expect(api.getIntakeStatus).not.toHaveBeenCalled()
  })

  it('sends the form with the signature and thanks the patient by first name', async () => {
    vi.mocked(api.submitIntake).mockResolvedValue(undefined)
    render(<IntakePage code="abc" />)
    const user = await reachSignature()
    await user.click(screen.getByRole('button', { name: 'Sign and send to reception' }))

    expect(await screen.findByText('Thank you, Maria')).toBeInTheDocument()
    expect(api.submitIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'abc',
        signatureDataUrl: 'data:image/png;base64,SIGNATURE',
        signedByName: 'Maria Clara Santos',
        signerRelationship: 'self',
        values: expect.objectContaining({ name: 'Maria Clara Santos' }),
      }),
    )
  })

  // Phase 6's exit criterion, for the patient's own form: a failed send —
  // flaky Wi-Fi, an expired code — must not throw away a whole medical
  // history they have just typed.
  it('keeps every answer when sending fails', async () => {
    vi.mocked(api.submitIntake).mockRejectedValue(new Error('This form has expired.'))
    render(<IntakePage code="abc" />)
    const user = await reachSignature()
    await user.click(screen.getByRole('button', { name: 'Sign and send to reception' }))

    expect(await screen.findByText('This form has expired.')).toBeInTheDocument()
    expect(screen.queryByText(/thank you/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to my answers' }))
    expect(screen.getByText('Maria Clara Santos')).toBeInTheDocument()
  })

  // On their own phone there is no tablet to hand back, and a browser will
  // not let the page close a tab the patient opened by scanning.
  it('tells a patient on their own phone what to do, without a close button', async () => {
    vi.mocked(api.submitIntake).mockResolvedValue(undefined)
    render(<IntakePage code="abc" device="phone" />)
    const user = await reachSignature()
    await user.click(screen.getByRole('button', { name: 'Sign and send to reception' }))

    expect(await screen.findByText(/you can close this page/i)).toBeInTheDocument()
    expect(screen.queryByText(/hand the tablet back/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /close this form/i })).not.toBeInTheDocument()
  })

  it('does not ask for a tablet back when a phone reopens a spent code', async () => {
    vi.mocked(api.getIntakeStatus).mockResolvedValue('used')
    render(<IntakePage code="abc" device="phone" />)
    expect(await screen.findByText(/let the front desk know/i)).toBeInTheDocument()
    expect(screen.queryByText(/hand the tablet back/i)).not.toBeInTheDocument()
  })
})
