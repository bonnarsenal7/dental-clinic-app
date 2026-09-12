import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentCapture from './ConsentCapture'
import {
  CONSENT_DETAILS_COMPLETE,
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  missingConsentDetails,
} from './historyOptions'

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
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByText(/consent for dental treatment/i)).toBeInTheDocument()
    expect(screen.getByText(/data privacy act/i)).toBeInTheDocument()
  })

  // Phase 5 left this text unreviewed by a lawyer. The notice must stay up
  // until that happens — see docs/COMPLIANCE.md §1.3.
  it('keeps the draft warning visible', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByText(/not yet reviewed by anyone qualified/i)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(CONSENT_TEXT_VERSION))).toBeInTheDocument()
  })

  // v2 shipped the literal string "[RETENTION PERIOD]" into the text a
  // patient reads. Three strings in historyOptions.ts fix it, so the warning
  // names them rather than saying "some fields need filling in".
  it('names exactly which clinic facts the notice is still missing', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    if (CONSENT_DETAILS_COMPLETE) {
      expect(screen.queryByText(/this notice is incomplete/i)).not.toBeInTheDocument()
      return
    }
    expect(screen.getByText(/this notice is incomplete/i)).toBeInTheDocument()
    for (const missing of missingConsentDetails()) {
      expect(screen.getByText(new RegExp(missing, 'i'))).toBeInTheDocument()
    }
  })

  // The unfilled value has to be unmistakable where the patient reads it,
  // not a tidy blank.
  it('marks an unset value loudly inside the notice itself', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    const unsetMarkers = (CONSENT_TEXT.match(/«[^»]+NOT SET»/g) ?? []).length
    expect(unsetMarkers).toBe(CONSENT_DETAILS_COMPLETE ? 0 : missingConsentDetails().length)
  })

  // v2 promised erasure and objection outright, then said records are kept
  // anyway. v3 states the limit rather than implying a right the clinic
  // cannot honour.
  it('does not promise a right it then takes back', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    expect(CONSENT_TEXT).toMatch(/some of these rights are limited/i)
  })

  // 0010 records who signed; the wording has to explain why it is asked.
  it('explains who may sign for a patient who cannot consent', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByText(/parent, legal guardian or authorised representative/i)).toBeInTheDocument()
  })

  // An unsigned consent row would assert a patient agreed when they did
  // not. This is the guard that stops it.
  it('refuses to save an unsigned consent', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: /save|consent/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/please sign before saving/i)
    expect(api.saveConsent).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('saves the signature against the version that was on screen', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    pad.empty = false
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={onSaved} />)
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
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={onSaved} />)
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

  // --- Who signed --------------------------------------------------------

  // The screen has always invited "the patient (or parent/guardian)" to
  // sign, while the consent text is written in the patient's voice. Without
  // recording the signer, a guardian's mark was indistinguishable from the
  // patient's own.
  it('records the name and authority of whoever signed', async () => {
    const user = userEvent.setup()
    render(
      <ConsentCapture patientId="p-1" patientName="Maria Clara Santos" staffId="s-1" onSaved={vi.fn()} />,
    )
    await user.selectOptions(screen.getByLabelText(/signing as/i), 'guardian')
    await user.type(screen.getByLabelText(/name of person signing/i), 'Rosa Santos Cruz')
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      signedByName: 'Rosa Santos Cruz',
      signerRelationship: 'guardian',
    })
  })

  it('defaults to the patient signing for themselves', async () => {
    const user = userEvent.setup()
    render(
      <ConsentCapture patientId="p-1" patientName="Maria Clara Santos" staffId="s-1" onSaved={vi.fn()} />,
    )
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({ signerRelationship: 'self' })
  })

  // A mark on a tablet is rarely legible. The printed name is what makes
  // the record answer "who agreed to this".
  it('will not save a signature with no printed name', async () => {
    const user = userEvent.setup()
    render(
      <ConsentCapture patientId="p-1" patientName="Maria Clara Santos" staffId="s-1" onSaved={vi.fn()} />,
    )
    // The field arrives filled with the patient's name now, so this has to
    // empty it to reach the guard it is about.
    await user.clear(screen.getByLabelText(/name of person signing/i))
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/enter the name of the person signing/i)).toBeInTheDocument()
    expect(api.saveConsent).not.toHaveBeenCalled()
  })

  it('trims the name rather than storing the padding', async () => {
    const user = userEvent.setup()
    render(
      <ConsentCapture patientId="p-1" patientName="Maria Clara Santos" staffId="s-1" onSaved={vi.fn()} />,
    )
    await user.clear(screen.getByLabelText(/name of person signing/i))
    await user.type(screen.getByLabelText(/name of person signing/i), '  Maria Clara Santos  ')
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      signedByName: 'Maria Clara Santos',
    })
  })

  it('offers only the authorities the database accepts', () => {
    render(
      <ConsentCapture patientId="p-1" patientName="Maria Clara Santos" staffId="s-1" onSaved={vi.fn()} />,
    )
    const values = Array.from((screen.getByLabelText(/signing as/i) as HTMLSelectElement).options).map(
      (o) => o.value,
    )
    // Matches consents_signer_relationship_check in 0010.
    expect(values).toEqual(['self', 'parent', 'guardian', 'representative'])
  })

  // The ordinary case is the patient signing for themselves, and their name
  // is already on file. Asking a receptionist to retype it is how one record
  // ends up with the name spelled two ways.
  it('fills in the patient’s own name by default', () => {
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    expect(screen.getByLabelText(/name of person signing/i)).toHaveValue('Maria Clara Santos')
  })

  it('signs with that name without anyone typing it', async () => {
    const user = userEvent.setup()
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      signedByName: 'Maria Clara Santos',
      signerRelationship: 'self',
    })
  })

  // Leaving the patient's name over a guardian's signature would be worse
  // than leaving it blank: the record would assert the wrong person agreed.
  it('clears the name when somebody else is signing', async () => {
    const user = userEvent.setup()
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText(/signing as/i), 'guardian')
    expect(screen.getByLabelText(/name of person signing/i)).toHaveValue('')
  })

  it('puts it back if they switch to the patient signing after all', async () => {
    const user = userEvent.setup()
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText(/signing as/i), 'parent')
    await user.type(screen.getByLabelText(/name of person signing/i), 'Rosa Cruz')
    await user.selectOptions(screen.getByLabelText(/signing as/i), 'self')
    expect(screen.getByLabelText(/name of person signing/i)).toHaveValue('Maria Clara Santos')
  })

  // Prefilled, not fixed: the name on file is not always the one somebody
  // signs with.
  it('still lets the name be corrected', async () => {
    const user = userEvent.setup()
    render(<ConsentCapture patientId="p1" patientName="Maria Clara Santos" staffId="s1" onSaved={vi.fn()} />)
    const field = screen.getByLabelText(/name of person signing/i)
    await user.clear(field)
    await user.type(field, 'Maria C. Santos-Reyes')
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(api.saveConsent).toHaveBeenCalled())
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      signedByName: 'Maria C. Santos-Reyes',
    })
  })
})
