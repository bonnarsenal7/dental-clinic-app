import { useCallback, useEffect, useState } from 'react'
import PatientForm, { EMPTY_PATIENT_FORM } from '../PatientForm'
import RegistrationReview from '../RegistrationReview'
import ConsentCapture, { type CapturedConsent } from '../ConsentCapture'
import type { PatientRegistrationInput } from '../types'
import { getIntakeStatus, submitIntake, type IntakeStatus } from './api'
import type { IntakeDevice } from '../../../core/intakeHost'
import { toMessage } from '../../../core/errors'
import { ErrorState, LoadingState } from '../../../core/components/states'
import Button from '../../../core/components/ui/Button'

type Stage = 'form' | 'review' | 'consent' | 'done'

const CLOSED_MESSAGES: Record<Exclude<IntakeStatus, 'ready'>, { title: string; body: string }> = {
  used: {
    title: 'This form has already been submitted',
    // The phone wording replaces this where the patient used their own.
    body: 'Please hand the tablet back to reception.',
  },
  expired: {
    title: 'This form has expired',
    body: 'Please ask reception to start a new one.',
  },
  unknown: {
    title: 'This form link is not valid',
    body: 'Please ask reception to start a new one.',
  },
}

/** The patient's own registration, on the intake address.
 *
 *  No staff session exists here and none is needed: the only things this
 *  screen can do are ask whether its code is still good and hand in one form
 *  (0026). It never reads a record back — including the one it just wrote.
 *
 *  Same form, same review, same signature pad as reception's registration,
 *  so the patient sees exactly what they would have seen at the desk. */
export default function IntakePage({ code, device = 'tablet' }: { code: string; device?: IntakeDevice }) {
  const onPhone = device === 'phone'
  const [status, setStatus] = useState<IntakeStatus | null>(code ? null : 'unknown')
  const [statusError, setStatusError] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('form')
  const [values, setValues] = useState<PatientRegistrationInput | null>(null)
  const [firstName, setFirstName] = useState('')

  const checkStatus = useCallback(() => {
    if (!code) return
    setStatusError(null)
    getIntakeStatus(code)
      .then(setStatus)
      .catch((e) => setStatusError(toMessage(e)))
  }, [code])

  useEffect(checkStatus, [checkStatus])

  // Everything typed is still on screen until the form is handed in: closing
  // the tab by accident would lose a patient's whole medical history.
  useEffect(() => {
    if (stage === 'done' || values === null) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stage, values])

  async function handleSign(consent: CapturedConsent) {
    if (!values) return
    await submitIntake({ code, values, ...consent })
    // Only after the write has landed — a failed submit keeps every answer.
    setFirstName(values.name.trim().split(/\s+/)[0] ?? '')
    setValues(null)
    setStage('done')
    // Nothing left in the address bar to reload into.
    window.history.replaceState(null, '', window.location.pathname)
  }

  if (statusError) return <ErrorState message={statusError} onRetry={checkStatus} />
  if (status === null) return <LoadingState label="Opening the form…" />

  if (stage === 'done') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col gap-4 items-start max-w-lg">
        <h1 className="text-xl font-semibold text-slate-800">Thank you{firstName ? `, ${firstName}` : ''}</h1>
        {onPhone ? (
          // A browser will not let a page close a tab the patient opened
          // themselves (by scanning the QR code), so no button that would
          // silently do nothing — just what to do next.
          <p className="text-slate-600">
            Your details have been sent to reception. You can close this page and let the front desk know you
            are done.
          </p>
        ) : (
          <>
            <p className="text-slate-600">
              Your details have been sent to reception. Please hand the tablet back to the front desk.
            </p>
            {/* Works for a tab the app opened, which is how this one arrives.
                If the browser refuses, the page already says what to do. */}
            <Button onClick={() => window.close()}>Close this form</Button>
          </>
        )}
      </div>
    )
  }

  if (status !== 'ready') {
    const msg = CLOSED_MESSAGES[status]
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col gap-2 max-w-lg">
        <h1 className="text-lg font-semibold text-slate-800">{msg.title}</h1>
        <p className="text-slate-600">
          {status === 'used' && onPhone ? 'Please let the front desk know you are done.' : msg.body}
        </p>
      </div>
    )
  }

  if (stage === 'consent' && values) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Consent for treatment</h1>
          <p className="text-slate-500 text-sm mt-1">
            Please read the notice, then sign below. Signing sends your form to reception.
          </p>
        </div>
        <ConsentCapture
          patientName={values.name}
          save={handleSign}
          onSaved={() => undefined}
          submitLabel="Sign and send to reception"
        />
        <Button variant="subtle" className="self-start" onClick={() => setStage('review')}>
          Back to my answers
        </Button>
      </div>
    )
  }

  if (stage === 'review' && values) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Check your answers</h1>
          <p className="text-slate-500 text-sm mt-1">
            Make sure everything below is correct before you sign. Nothing has been sent yet.
          </p>
        </div>
        <RegistrationReview values={values} showType={false} />
        <div className="flex gap-3 flex-wrap">
          <Button variant="secondary" onClick={() => setStage('form')}>
            Back and edit
          </Button>
          <Button onClick={() => setStage('consent')}>Everything is correct — continue to signature</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">New patient form</h1>
        <p className="text-slate-500 text-sm mt-1">
          Please fill in your details and health history. You can check everything before you sign.
        </p>
      </div>
      <PatientForm
        defaultValues={values ?? EMPTY_PATIENT_FORM}
        canChooseType={false}
        onSubmit={async (v) => {
          setValues(v)
          setStage('review')
        }}
        submitLabel="Check my answers"
      />
    </div>
  )
}
