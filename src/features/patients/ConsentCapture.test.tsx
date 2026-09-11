import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentCapture from './ConsentCapture'
import { CONSENT_TEXT_VERSION } from './historyOptions'

vi.mock('./api', () => ({ saveConsent: vi.fn() }))

// happy-dom has no canvas, and the real pad needs one. The double keeps the
// component's own contract: the ref exposes isEmpty(), which gates saving,
// and toDataURL(), which produces what gets uploaded.
//
// It must be a real class component — ConsentCapture reaches it through a
// ref, and React only hands an instance to a ref for a class. A bare class
// is treated as a function component and called without `new`.
const pad = { empty: true }
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

describe('ConsentCapture', () => {
  beforeEach(() => {
    pad.empty = true
    vi.mocked(api.saveConsent).mockResolvedValue(undefined)
  })

  it('shows the consent wording the patient is signing', () => {
    render(<ConsentCapture patientId="p1" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByText(/consent for dental treatment/i)).toBeInTheDocument()
    expect(screen.getByText(/data privacy act/i)).toBeInTheDocument()
  })

  // Phase 5 left this text unreviewed by a lawyer. The notice must stay up
  // until that happens — see docs/COMPLIANCE.md §1.3.
  it('keeps the draft warning visible', () => {
    render(<ConsentCapture patientId="p1" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByText(/not yet reviewed by anyone qualified/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(CONSENT_TEXT_VERSION))).toBeInTheDocument()
  })

  // An unsigned consent row would assert a patient agreed when they did
  // not. This is the guard that stops it.
  it('refuses to save an unsigned consent', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<ConsentCapture patientId="p1" staffId="s1" onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /save|consent/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/please sign before saving/i)
    expect(api.saveConsent).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves the signature against the version that was on screen', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    pad.empty = false
    render(<ConsentCapture patientId="p1" staffId="s1" onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /save|consent/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      patientId: 'p1',
      staffId: 's1',
      consentTextVersion: CONSENT_TEXT_VERSION,
      signatureDataUrl: 'data:image/png;base64,SIGNATURE',
    })
    expect(onSaved).toHaveBeenCalled()
  })

  // If the upload fails the signature must not be treated as captured —
  // otherwise the flow moves on and nothing is on file.
  it('does not report success when saving fails', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    pad.empty = false
    vi.mocked(api.saveConsent).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<ConsentCapture patientId="p1" staffId="s1" onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /save|consent/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('uses the label the caller asked for', () => {
    render(
      <ConsentCapture
        patientId="p1"
        staffId="s1"
        onSaved={vi.fn()}
        submitLabel="Save re-confirmed consent"
      />,
    )
    expect(screen.getByRole('button', { name: /save re-confirmed consent/i })).toBeInTheDocument()
  })
})
