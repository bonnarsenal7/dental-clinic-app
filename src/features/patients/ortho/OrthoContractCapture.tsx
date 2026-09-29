import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { getClinicName, saveConsent, saveOrthoContractPdf } from '../api'
import { SIGNER_RELATIONSHIPS, type SignerRelationship } from '../types'
import { toMessage } from '../../../core/errors'
import { toLocalDateString } from '../../../core/localDate'
import { CLINIC_NAME } from '../../../core/branding'
import { ErrorState } from '../../../core/components/states'
import { Field, NativeSelect, TextInput } from '../../../core/components/ui/Field'
import Button from '../../../core/components/ui/Button'
import {
  ORTHO_ACKNOWLEDGMENTS,
  ORTHO_ADD_ONS,
  ORTHO_CONTRACT_VERSION,
  ORTHO_INTRO,
  ORTHO_PACKAGES,
  ORTHO_SECTIONS,
  ORTHO_UNDERSTANDING,
  orthoMoney,
  withFee,
} from './orthoContract'

export interface OrthoContractCaptureProps {
  patientId: string
  patientName: string
  patientAge: number | null
  staffId: string
  onSaved: () => void
  submitLabel?: string
}

/** What an orthodontic patient signs in place of the general consent: the
 *  clinic's own orthodontic treatment consent form, shown in full, with the
 *  package availed ticked and the fee filled in.
 *
 *  Saving does three things, in this order, and only reports success when
 *  all three have happened:
 *   1. renders the signed form to a PDF named "<patient> - <date>.pdf";
 *   2. files that PDF on the patient's record (Attachments, type contract);
 *   3. writes the consents row — the same signing-event log as everyone
 *      else, under ORTHO_CONTRACT_VERSION — then hands the PDF to the tablet.
 *  The PDF goes first so a consents row never exists without the document it
 *  stands for. If the PDF is filed and only the consents row fails, pressing
 *  Save again for the same signing records it without filing the PDF twice. */
export default function OrthoContractCapture({
  patientId,
  patientName,
  patientAge,
  staffId,
  onSaved,
  submitLabel,
}: OrthoContractCaptureProps) {
  const patientPad = useRef<SignatureCanvas>(null)
  const dentistPad = useRef<SignatureCanvas>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [relationship, setRelationship] = useState<SignerRelationship>('self')
  const [signedByName, setSignedByName] = useState(patientName)
  const [packageId, setPackageId] = useState('')
  const [fee, setFee] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [clinicName, setClinicName] = useState('')
  // What the PDF already on the record says, when only the consents row
  // failed after it was filed. Reception cannot delete or overwrite a stored
  // file, so a retry of the same signing must not file a second copy.
  const filedFor = useRef<string | null>(null)

  // The heading reads what an admin set at /admin/settings, like the nav bar
  // and the receipt. Failing to load it is not worth blocking a signature:
  // the built-in name is used instead.
  useEffect(() => {
    let cancelled = false
    getClinicName()
      .then((name) => {
        if (!cancelled) setClinicName(name)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  // Same rule as the general consent: the patient's own name by default,
  // cleared the moment somebody else is signing for them.
  useEffect(() => {
    setSignedByName(relationship === 'self' ? patientName : '')
  }, [relationship, patientName])

  const chosen = ORTHO_PACKAGES.find((p) => p.id === packageId)
  const feeNumber = Number(fee.replace(/,/g, ''))
  const feeText = fee.trim() && Number.isFinite(feeNumber) ? orthoMoney(feeNumber) : 'P __________'
  // A fee below the package price is a discount. The ticked package still
  // prints its own terms, so the form says both rather than leaving the
  // agreed figure beside a different one.
  const discounted = !!chosen && Number.isFinite(feeNumber) && feeNumber > 0 && feeNumber !== chosen.total

  function choosePackage(id: string) {
    setPackageId(id)
    // The regular fee follows the package; it stays editable for a discount.
    const pkg = ORTHO_PACKAGES.find((p) => p.id === id)
    if (pkg) setFee(String(pkg.total))
  }

  async function handleSave() {
    setError(null)
    if (!chosen) {
      setError('Choose the treatment package the patient is availing.')
      return
    }
    if (!fee.trim() || !Number.isFinite(feeNumber) || feeNumber <= 0) {
      setError('Enter the regular fee for the treatment.')
      return
    }
    if (!acknowledged) {
      setError('The patient must confirm the acknowledgment before signing.')
      return
    }
    if (!signedByName.trim()) {
      setError('Enter the name of the person signing.')
      return
    }
    if (!patientPad.current || patientPad.current.isEmpty()) {
      setError('Please sign before saving.')
      return
    }
    setSaving(true)
    let signingKey: string | null = null
    try {
      const signatureDataUrl = patientPad.current.toDataURL('image/png')
      const dentistSignature =
        dentistPad.current && !dentistPad.current.isEmpty() ? dentistPad.current.toDataURL('image/png') : null
      const relationshipLabel =
        SIGNER_RELATIONSHIPS.find((r) => r.value === relationship)?.label ?? relationship
      signingKey = JSON.stringify([
        chosen.id,
        feeNumber,
        signedByName.trim(),
        relationship,
        signatureDataUrl,
        dentistSignature,
      ])

      // jsPDF is large; it arrives only when somebody actually signs.
      const { renderOrthoContract } = await import('./orthoContractPdf')
      const pdf = renderOrthoContract(
        {
          patientName,
          patientAge,
          packageId: chosen.id,
          fee: feeNumber,
          signedByName: signedByName.trim(),
          signerRelationshipLabel: relationshipLabel,
          signedOn: toLocalDateString(new Date()),
          patientSignatureDataUrl: signatureDataUrl,
          dentistSignatureDataUrl: dentistSignature,
        },
        clinicName || CLINIC_NAME,
      )

      if (filedFor.current !== signingKey) {
        await saveOrthoContractPdf({ patientId, staffId, pdf: pdf.blob, fileName: pdf.fileName })
        filedFor.current = signingKey
      }
      await saveConsent({
        patientId,
        staffId,
        consentTextVersion: ORTHO_CONTRACT_VERSION,
        signatureDataUrl,
        signedByName: signedByName.trim(),
        signerRelationship: relationship,
      })
      pdf.save()
      onSaved()
    } catch (e) {
      setError(
        signingKey !== null && filedFor.current === signingKey
          ? `${toMessage(e)} The signed PDF is already on the patient's record — press Save again to finish recording the signing.`
          : toMessage(e),
      )
    } finally {
      setSaving(false)
    }
  }

  const groups = [...new Set(ORTHO_PACKAGES.map((p) => p.group))]

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-700">Contract for orthodontic treatment</h2>

      {/* The whole form scrolls in one box so the signature pad stays in
          reach on a tablet — the patient reads down to it. */}
      <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-4 max-h-[28rem] overflow-y-auto flex flex-col gap-3">
        <p className="text-center font-semibold tracking-wide">ORTHODONTIC TREATMENT CONSENT FORM</p>
        <p>{ORTHO_INTRO}</p>
        <p>
          <span className="text-slate-500">Patient's name and age:</span>{' '}
          <strong className="font-semibold">
            {patientName}
            {patientAge === null ? '' : `, ${patientAge}`}
          </strong>
        </p>
        <p>{ORTHO_UNDERSTANDING}</p>
        {ORTHO_SECTIONS.map((s) => (
          <div key={s.heading}>
            <p className="font-semibold">{s.heading}</p>
            <ul className="list-disc pl-6 flex flex-col gap-1">
              {s.points.map((p) => (
                <li key={p}>{withFee(p, feeText)}</li>
              ))}
            </ul>
          </div>
        ))}

        <p className="font-semibold mt-2">Package deals</p>
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Treatment package availed</legend>
          {groups.map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">{g}</p>
              {ORTHO_PACKAGES.filter((p) => p.group === g).map((p) => (
                <label
                  key={p.id}
                  className={`flex gap-3 items-start rounded-md border px-3 py-2 cursor-pointer ${
                    packageId === p.id ? 'border-gold-700 bg-gold-100' : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="ortho-package"
                    value={p.id}
                    checked={packageId === p.id}
                    onChange={() => choosePackage(p.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">
                      {p.label} — {orthoMoney(p.total)}
                    </span>
                    <span className="block text-xs text-slate-500">{p.terms.join(' · ')}</span>
                    {packageId === p.id && discounted && (
                      <span className="block text-xs font-medium text-slate-700">
                        Agreed fee: {orthoMoney(feeNumber)} (package price {orthoMoney(p.total)})
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>

        <p className="font-semibold mt-2">Other add-ons</p>
        <ul className="list-disc pl-6 text-xs flex flex-col gap-1">
          {ORTHO_ADD_ONS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>

        <p className="font-semibold mt-2">Acknowledgment</p>
        <ul className="list-disc pl-6 flex flex-col gap-1">
          {ORTHO_ACKNOWLEDGMENTS.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-500">Form version {ORTHO_CONTRACT_VERSION}.</p>

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        <Field
          label="Regular fee (P)"
          hint={
            chosen
              ? discounted
                ? `Discounted from ${orthoMoney(chosen.total)} — the form prints both`
                : `Package price ${orthoMoney(chosen.total)}`
              : undefined
          }
        >
          <TextInput
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="Choose a package first"
          />
        </Field>
      </div>

      <label className="flex gap-2 items-start text-sm text-slate-700">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <span>I have read this form, discussed it with Dr. Abella, and agree to the terms above.</span>
      </label>

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
          hint={relationship === 'self' ? undefined : 'The adult signing, not the patient.'}
        >
          <TextInput
            value={signedByName}
            onChange={(e) => setSignedByName(e.target.value)}
            placeholder="Printed name"
          />
        </Field>
      </div>

      <p className="text-xs font-medium text-slate-600">Patient's / guardian's signature</p>
      <div className="border border-slate-300 rounded-md bg-slate-50 w-full max-w-md">
        <SignatureCanvas
          ref={patientPad}
          penColor="black"
          canvasProps={{ width: 460, height: 180, className: 'w-full h-[180px] touch-none' }}
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => patientPad.current?.clear()}
      >
        Clear patient signature
      </Button>

      <p className="text-xs font-medium text-slate-600">
        Dentist's signature{' '}
        <span className="font-normal text-slate-400">(optional — can be signed on paper)</span>
      </p>
      <div className="border border-slate-300 rounded-md bg-slate-50 w-full max-w-md">
        <SignatureCanvas
          ref={dentistPad}
          penColor="black"
          canvasProps={{ width: 460, height: 180, className: 'w-full h-[180px] touch-none' }}
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => dentistPad.current?.clear()}
      >
        Clear dentist signature
      </Button>

      <div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : (submitLabel ?? 'Save signed contract')}
        </Button>
      </div>
    </div>
  )
}
