import IntakePage from './IntakePage'
import OfflineBanner from '../../../core/components/OfflineBanner'
import { intakeCodeFromHash } from '../../../core/intakeHost'
import { CLINIC_NAME } from '../../../core/branding'
import toothcoLogo from '../../../assets/toothco-logo.png'

/** The whole app, as served at the intake address.
 *
 *  No router, no AuthProvider, no login screen: whatever path is typed here,
 *  this is the only thing that renders. A login form on this address would
 *  invite somebody to sign in on it — and a session here is exactly what
 *  keeping the addresses apart exists to prevent. */
export default function IntakeApp() {
  return (
    <div className="min-h-screen bg-slate-50">
      <OfflineBanner />
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <img src={toothcoLogo} alt={CLINIC_NAME} className="h-8 w-auto" />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <IntakePage code={intakeCodeFromHash()} />
      </main>
    </div>
  )
}
