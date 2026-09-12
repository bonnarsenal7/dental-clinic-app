import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import {
  CONSENT_DETAILS_COMPLETE,
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  missingConsentDetails,
} from './historyOptions'
import { saveConsent } from './api'
import { SIGNER_RELATIONSHIPS, type SignerRelationship } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'

interface ConsentCaptureProps {
  patientId: string
  staffId: string
  onSaved: () => void
  /** Shown on the button — differs for first-time vs. re-confirm. */
  submitLabel?: string
}

export default function ConsentCapture({ patientId, staffId, onSaved, submitLabel }: ConsentCaptureProps) {
  const padRef = useRef<SignatureCanvas>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [signedByName, setSignedByName] = useState('')
  const [relationship, setRelationship] = useState<SignerRelationship>('self')

  function handleClear() {
    padRef.current?.clear()
  }

  async function handleSave() {
    setError(null)
    // A signature with no printed name is the problem this form had: on
    // paper the name is legible beside the mark, on a tablet it often is not.
    if (!signedByName.trim()) {
      setError('Enter the name of the person signing.')
      return
    }
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Please sign before saving.')
      return
    }
    setSaving(true)
    try {
      // getTrimmedCanvas() pulls in the unmaintained trim-canvas package,
      // which has a known Vite production-build interop bug (works in dev,
      // throws in the deployed build). Untrimmed is functionally fine --
      // just a little transparent padding around the signature.
      const dataUrl = padRef.current.toDataURL('image/png')
      await saveConsent({
        patientId,
        staffId,
        consentTextVersion: CONSENT_TEXT_VERSION,
        signatureDataUrl: dataUrl,
        signedByName: signedByName.trim(),
        signerRelationship: relationship,
      })
      onSaved()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-700">Consent for treatment</h2>
      {/* Scrolls rather than growing: the full privacy notice would push
          the signature pad off a tablet screen, and a patient signing
          something they had to scroll past is the point of the exercise. */}
      <div className="text-xs text-slate-500 whitespace-pre-line bg-slate-50 border border-slate-200 rounded-md p-3 max-h-64 overflow-y-auto">
        {CONSENT_TEXT}
      </div>
      {/* Two separate problems, said separately. The legal review is
          somebody else's to do; the missing clinic facts are three strings
          in historyOptions.ts, and naming them is the difference between a
          warning that gets acted on and one that gets read past. */}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        Draft wording — not yet reviewed by anyone qualified in Philippine data privacy law. See
        docs/COMPLIANCE.md. Version tag: {CONSENT_TEXT_VERSION}.
      </p>
      {!CONSENT_DETAILS_COMPLETE && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <strong className="font-semibold">This notice is incomplete.</strong> It still does not say{' '}
          {missingConsentDetails().join(', ')}. A patient signing now is shown those gaps on screen. Fill them
          in <code>src/features/patients/historyOptions.ts</code> and bump the version tag.
        </p>
      )}

      {error && <ErrorState message={error} />}

      {/* Who is signing, and on what authority. The screen has always
          invited a parent or guardian to sign, but the record could not tell
          their signature from the patient's own — and the wording above is
          in the patient's voice. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        <Field label="Signing as">
          <NativeSelect
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as SignerRelationship)}
          >
            {SIGNER_RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Name of person signing"
          hint={relationship === 'self' ? undefined : 'The adult consenting, not the patient.'}
        >
          <TextInput
            value={signedByName}
            onChange={(e) => setSignedByName(e.target.value)}
            placeholder="Printed name"
          />
        </Field>
      </div>

      <div className="border border-slate-300 rounded-md bg-slate-50 w-full max-w-md">
        <SignatureCanvas
          ref={padRef}
          penColor="black"
          canvasProps={{
            width: 460,
            height: 180,
            className: 'w-full h-[180px] touch-none',
          }}
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : (submitLabel ?? 'Save signed consent')}
        </button>
      </div>
    </div>
  )
}
