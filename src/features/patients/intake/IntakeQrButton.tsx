import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { startIntake } from './api'
import { intakeUrl } from '../../../core/intakeHost'
import { toMessage } from '../../../core/errors'
import { ErrorState } from '../../../core/components/states'
import Button from '../../../core/components/ui/Button'
import { Dialog } from '../../../core/components/ui/Dialog'

/** The same patient form, on the patient's own phone: a QR code they scan
 *  with the camera.
 *
 *  Optional, beside "Patient fills in form" — some patients would rather use
 *  their phone, and some have no mobile data, which is why the tablet stays
 *  the default. It is the same one-time code (0026), valid two hours, and the
 *  phone reaches the intake address with no staff login, so nothing about
 *  what the form can do changes.
 *
 *  **The staff screen does not lock.** The lock exists because the patient is
 *  holding the clinic's tablet; here they are holding their own phone, and
 *  reception keeps working. The link carries a `phone:` marker so the form's
 *  closing words do not tell them to hand back a tablet they never had. */
export default function IntakeQrButton() {
  const [url, setUrl] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShow() {
    setError(null)
    setStarting(true)
    try {
      setUrl(intakeUrl(await startIntake(), 'phone'))
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="secondary" onClick={() => void handleShow()} disabled={starting}>
        {starting ? 'Preparing…' : 'QR code for patient’s phone'}
      </Button>
      {error && <ErrorState message={error} />}
      <Dialog
        open={url !== null}
        onOpenChange={(open) => {
          // Closing forgets the code. An unscanned one simply expires.
          if (!open) setUrl(null)
        }}
        title="Scan to fill in the form"
        description="The patient points their phone camera at this code. It works once, for two hours, and needs internet on their phone."
      >
        {url && (
          <div className="flex flex-col items-center gap-4">
            {/* Black on white with a quiet zone: what phone cameras read
                most reliably, whatever the clinic's lighting. */}
            <div className="bg-white p-3 rounded-md border border-slate-200">
              <QRCodeSVG
                value={url}
                size={240}
                level="M"
                marginSize={2}
                role="img"
                aria-label="QR code for the patient’s intake form"
              />
            </div>
            <p className="text-sm text-slate-600 text-center max-w-sm">
              When they send it, their form appears on the Patients list for review, like one filled in on the
              tablet.
            </p>
            <Button onClick={() => setUrl(null)}>Done</Button>
          </div>
        )}
      </Dialog>
    </div>
  )
}
