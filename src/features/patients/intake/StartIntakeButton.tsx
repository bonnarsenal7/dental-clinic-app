import { useState } from 'react'
import { startIntake } from './api'
import { intakeUrl } from '../../../core/intakeHost'
import { setIntakeLock } from '../../../core/intakeLock'
import { toMessage } from '../../../core/errors'
import { ErrorState } from '../../../core/components/states'
import Button, { buttonClass } from '../../../core/components/ui/Button'

/** Opens the patient's form in a new tab and locks this one.
 *
 *  The new tab is at a different address with no staff login (intakeHost.ts);
 *  this tab — which *is* signed in — locks behind the receptionist's password
 *  until the tablet comes back (intakeLock.ts).
 *
 *  The tab is opened *before* the code is fetched. A browser only allows a
 *  new tab as the direct result of a tap; opened after an await, Safari on an
 *  iPad treats it as a pop-up and blocks it. So a blank tab opens at once and
 *  is pointed at the form when the code arrives. */
export default function StartIntakeButton() {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only when the browser blocked the tab anyway: a link is a fresh tap.
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  async function handleStart() {
    setError(null)
    setFallbackUrl(null)
    const tab = window.open('about:blank', '_blank')
    setStarting(true)
    try {
      const url = intakeUrl(await startIntake())
      if (tab) {
        // The form has no business reaching back into a signed-in tab.
        tab.opener = null
        tab.location.href = url
        setIntakeLock()
      } else {
        setFallbackUrl(url)
      }
    } catch (e) {
      tab?.close()
      setError(toMessage(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="secondary" onClick={() => void handleStart()} disabled={starting}>
        {starting ? 'Opening…' : 'Patient fills in form'}
      </Button>
      {error && <ErrorState message={error} />}
      {fallbackUrl && (
        <div className="text-sm text-slate-600 flex flex-col items-end gap-1">
          <span>The browser blocked the new tab.</span>
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setIntakeLock()
              setFallbackUrl(null)
            }}
            className={buttonClass('primary', 'sm')}
          >
            Open the patient form
          </a>
        </div>
      )}
    </div>
  )
}
