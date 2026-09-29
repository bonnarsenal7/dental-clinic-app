import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsentCapture from '../ConsentCapture'
import { ORTHO_CONTRACT_VERSION } from './orthoContract'
import { CLINIC_NAME } from '../../../core/branding'

vi.mock('../api', () => ({ saveConsent: vi.fn(), saveOrthoContractPdf: vi.fn(), getClinicName: vi.fn() }))

const rendered = vi.hoisted(() => ({ details: null as unknown, clinicName: '', saved: 0 }))
vi.mock('./orthoContractPdf', () => ({
  renderOrthoContract: (details: { patientName: string; signedOn: string }, clinicName: string) => {
    rendered.details = details
    rendered.clinicName = clinicName
    return {
      blob: new Blob(['%PDF']),
      fileName: `${details.patientName} - ${details.signedOn}.pdf`,
      save: () => {
        rendered.saved += 1
      },
    }
  },
}))

// Same class-component stub as ConsentCapture.test.tsx — the pads are
// reached through refs. Every pad shares one "signed" flag here.
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

const api = await import('../api')

function renderOrtho(onSaved = vi.fn()) {
  render(
    <ConsentCapture
      patientId="p1"
      patientName="Maria Clara Santos"
      patientAge={15}
      staffId="s1"
      patientType="orthodontic"
      onSaved={onSaved}
    />,
  )
  return onSaved
}

async function fillAndSign(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText(/package b/i))
  await user.click(screen.getByLabelText(/agree to the terms above/i))
  pad.empty = false
}

describe('orthodontic consent form', () => {
  beforeEach(() => {
    pad.empty = true
    rendered.details = null
    rendered.saved = 0
    vi.mocked(api.saveConsent).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.saveOrthoContractPdf).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.getClinicName).mockReset().mockResolvedValue('')
  })

  it('shows the orthodontic form instead of the general consent', () => {
    renderOrtho()
    expect(screen.getByRole('heading', { name: 'Contract for orthodontic treatment' })).toBeInTheDocument()
    expect(screen.getByText('Temporomandibular Joint (TMJ)')).toBeInTheDocument()
    expect(screen.queryByText(/data privacy act/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Maria Clara Santos, 15/)).toBeInTheDocument()
  })

  it('leaves a regular patient on the general consent', () => {
    render(
      <ConsentCapture
        patientId="p1"
        patientName="Juan"
        staffId="s1"
        patientType="regular"
        onSaved={vi.fn()}
      />,
    )
    expect(screen.queryByText('Temporomandibular Joint (TMJ)')).not.toBeInTheDocument()
  })

  it('fills the fee from the package chosen', async () => {
    const user = userEvent.setup()
    renderOrtho()
    await user.click(screen.getByLabelText(/ceramic \(upper and lower\)/i))
    expect(screen.getByLabelText(/regular fee/i)).toHaveValue('70000')
    expect(screen.getByText(/regular fee for orthodontic treatment is P 70,000/)).toBeInTheDocument()
  })

  it('will not save without a package', async () => {
    const user = userEvent.setup()
    renderOrtho()
    pad.empty = false
    await user.click(screen.getByLabelText(/agree to the terms above/i))
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose the treatment package/i)
    expect(api.saveConsent).not.toHaveBeenCalled()
  })

  it('will not save without the acknowledgment', async () => {
    const user = userEvent.setup()
    renderOrtho()
    await user.click(screen.getByLabelText(/package b/i))
    pad.empty = false
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/acknowledgment/i)
    expect(api.saveConsent).not.toHaveBeenCalled()
  })

  it('will not save unsigned', async () => {
    const user = userEvent.setup()
    renderOrtho()
    await user.click(screen.getByLabelText(/package b/i))
    await user.click(screen.getByLabelText(/agree to the terms above/i))
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/please sign/i)
    expect(api.saveOrthoContractPdf).not.toHaveBeenCalled()
  })

  it('files the signed PDF under the patient name and date, then records the signing', async () => {
    const user = userEvent.setup()
    const onSaved = renderOrtho()
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    const today = new Date()
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(vi.mocked(api.saveOrthoContractPdf).mock.calls[0][0]).toMatchObject({
      patientId: 'p1',
      staffId: 's1',
      fileName: `Maria Clara Santos - ${ymd}.pdf`,
    })
    expect(vi.mocked(api.saveConsent).mock.calls[0][0]).toMatchObject({
      patientId: 'p1',
      consentTextVersion: ORTHO_CONTRACT_VERSION,
      signedByName: 'Maria Clara Santos',
      signerRelationship: 'self',
    })
    expect(rendered.details).toMatchObject({ packageId: 'conv-b', fee: 50000, patientAge: 15 })
    expect(rendered.saved).toBe(1)
  })

  // A consents row must never exist without the document it stands for.
  it('records nothing if the PDF cannot be filed', async () => {
    const user = userEvent.setup()
    const onSaved = renderOrtho()
    vi.mocked(api.saveOrthoContractPdf).mockRejectedValue(new TypeError('Failed to fetch'))
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
    expect(api.saveConsent).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(rendered.saved).toBe(0)
  })
  // Reception cannot delete or overwrite a stored file, so a retry after the
  // consents row failed must not file the same signed PDF a second time.
  it('does not file the PDF twice when only recording the signing failed', async () => {
    const user = userEvent.setup()
    const onSaved = renderOrtho()
    vi.mocked(api.saveConsent).mockRejectedValueOnce(new Error('permission denied for table consents'))
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already on the patient's record/i)
    expect(api.saveOrthoContractPdf).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.saveOrthoContractPdf).toHaveBeenCalledTimes(1)
    expect(api.saveConsent).toHaveBeenCalledTimes(2)
  })

  // A different signing is a different document, and gets its own PDF.
  it('files a new PDF when the retry is a different signing', async () => {
    const user = userEvent.setup()
    renderOrtho()
    vi.mocked(api.saveConsent).mockRejectedValueOnce(new Error('permission denied for table consents'))
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await screen.findByRole('alert')
    await user.click(screen.getByLabelText(/package c/i))
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await waitFor(() => expect(api.saveOrthoContractPdf).toHaveBeenCalledTimes(2))
  })

  it('shows a discount beside the package, and on the fee field', async () => {
    const user = userEvent.setup()
    renderOrtho()
    await user.click(screen.getByLabelText(/package b/i))
    const fee = screen.getByLabelText(/regular fee/i)
    await user.clear(fee)
    await user.type(fee, '45000')
    expect(screen.getByText('Agreed fee: P 45,000 (package price P 50,000)')).toBeInTheDocument()
    expect(screen.getByText(/discounted from P 50,000/i)).toBeInTheDocument()
  })

  // The clinic's name as an admin set it, like the nav bar and receipts.
  it('heads the PDF with the clinic name from settings', async () => {
    vi.mocked(api.getClinicName).mockResolvedValue('ToothCo Dental Clinic Davao')
    const user = userEvent.setup()
    const onSaved = renderOrtho()
    await waitFor(() => expect(api.getClinicName).toHaveBeenCalled())
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(rendered.clinicName).toBe('ToothCo Dental Clinic Davao')
  })

  it('falls back to the built-in name when the setting cannot be read', async () => {
    vi.mocked(api.getClinicName).mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    const onSaved = renderOrtho()
    await fillAndSign(user)
    await user.click(screen.getByRole('button', { name: /save signed contract/i }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(rendered.clinicName).toBe(CLINIC_NAME)
  })
})
