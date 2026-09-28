import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RegistrationReview from '../RegistrationReview'
import { EMPTY_PATIENT_FORM } from '../PatientForm'
import { searchPatients } from '../api'
import { PATIENT_TYPES, SIGNER_RELATIONSHIPS, type Patient, type PatientType } from '../types'
import { acceptIntake, discardIntake, getIntake, type IntakeSubmission } from './api'
import { toMessage } from '../../../core/errors'
import { ErrorState, LoadingState } from '../../../core/components/states'
import { PageHeader, Card } from '../../../core/components/ui/Page'
import { Field, NativeSelect } from '../../../core/components/ui/Field'
import Button from '../../../core/components/ui/Button'
import ConfirmDialog from '../../../core/components/ui/ConfirmDialog'
import { toastSaved } from '../../../core/components/ui/toast'

/** Anyone already on file who might be this person: same name, or same
 *  cell number. A returning patient filling in the new-patient form is the
 *  commonest way one person becomes two records. */
async function possibleMatches(intake: IntakeSubmission): Promise<Patient[]> {
  const p = intake.payload
  if (!p) return []
  const lookups = [searchPatients(p.name.trim())]
  if (p.cell_number.trim()) lookups.push(searchPatients(p.cell_number.trim()))
  const seen = new Map<string, Patient>()
  for (const list of await Promise.all(lookups)) for (const pt of list) seen.set(pt.id, pt)
  return [...seen.values()]
}

/** Reception reads what a patient typed before it becomes a record.
 *
 *  Accepting creates the patient, both histories and the signed consent in
 *  one transaction (accept_intake, 0026). Nothing the patient typed is
 *  editable here — correct it on the record afterwards, where the edit is an
 *  ordinary, audited change to a real patient. */
export default function IntakeReviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [intake, setIntake] = useState<IntakeSubmission | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Patient[] | null>(null)
  const [patientType, setPatientType] = useState<PatientType>('regular')
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    getIntake(id)
      .then((found) => {
        setIntake(found)
        if (found?.status === 'pending') {
          possibleMatches(found)
            .then(setMatches)
            .catch(() => setMatches([]))
        }
      })
      .catch((e) => setLoadError(toMessage(e)))
  }, [id])

  async function handleAccept() {
    if (!intake) return
    setAccepting(true)
    setAcceptError(null)
    try {
      const patientId = await acceptIntake(intake, patientType)
      toastSaved('Patient registered', intake.payload?.name)
      navigate(`/patients/${patientId}`)
    } catch (e) {
      setAcceptError(toMessage(e))
    } finally {
      setAccepting(false)
    }
  }

  if (loadError) return <ErrorState message={loadError} />
  if (intake === undefined) return <LoadingState />
  if (intake === null) return <ErrorState message="That patient form could not be found." />

  if (intake.status !== 'pending' || !intake.payload) {
    return (
      <Card title="Patient form">
        <p className="text-sm text-slate-600">
          {intake.status === 'accepted' ? 'This form was accepted' : 'This form was discarded'}
          {intake.reviewed_at ? ` on ${new Date(intake.reviewed_at).toLocaleString()}` : ''}. What the patient
          typed is no longer kept here.
        </p>
        {intake.status === 'accepted' && (
          <Link to={`/patients/${intake.patient_id}`} className="text-sm text-gold-800 hover:underline">
            Open the patient record
          </Link>
        )}
      </Card>
    )
  }

  const relationship = SIGNER_RELATIONSHIPS.find((r) => r.value === intake.signer_relationship)?.label

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <PageHeader
        title={`Patient form: ${intake.payload.name}`}
        description={`Filled in by the patient on ${new Date(intake.submitted_at).toLocaleString()}. Check it before it becomes a record.`}
      />

      {matches && matches.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-red-800">Possibly already on file</h2>
          <p className="text-sm text-red-800">
            Same name or cell number as these patients. If it is the same person, discard this form and update
            their existing record instead.
          </p>
          <ul className="text-sm flex flex-col gap-1">
            {matches.map((m) => (
              <li key={m.id}>
                <Link to={`/patients/${m.id}`} className="font-medium text-slate-800 hover:underline">
                  {m.name}
                </Link>
                <span className="text-slate-500">
                  {' '}
                  · {m.cell_number ?? 'no cell'} · {m.birthday ?? 'no birthday'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RegistrationReview values={{ ...EMPTY_PATIENT_FORM, ...intake.payload }} showType={false} />

      <Card title="Consent">
        <p className="text-sm text-slate-600">
          Signed by <strong className="font-medium text-slate-800">{intake.signed_by_name}</strong>
          {relationship ? ` (${relationship.toLowerCase()})` : ''} against wording{' '}
          {intake.consent_text_version}.
        </p>
        {intake.signature_png && (
          <img
            src={intake.signature_png}
            alt={`Signature of ${intake.signed_by_name ?? 'the signer'}`}
            className="border border-slate-200 rounded-md bg-white max-w-sm"
          />
        )}
      </Card>

      <Card title="Register this patient">
        {/* The category is the front desk's call, as at the desk (0023). */}
        <Field label="Patient type" className="max-w-xs">
          <NativeSelect value={patientType} onChange={(e) => setPatientType(e.target.value as PatientType)}>
            {PATIENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {acceptError && <ErrorState message={acceptError} />}
        <div className="flex gap-3 flex-wrap">
          <Button onClick={() => void handleAccept()} disabled={accepting}>
            {accepting ? 'Registering…' : 'Accept and register patient'}
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDiscard(true)} disabled={accepting}>
            Discard
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard this patient form?"
        description="What the patient typed and their signature are deleted, and no record is created. This cannot be undone."
        confirmLabel="Discard form"
        tone="destructive"
        onConfirm={async () => {
          await discardIntake(intake.id)
          navigate('/patients')
        }}
      />
    </div>
  )
}
