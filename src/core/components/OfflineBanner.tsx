import { useOnlineStatus } from '../useOnlineStatus'

/** Persistent, unmissable, and honest about what it means.
 *
 *  The wording matters more than it looks: staff need to know that work
 *  already on screen is safe but *not yet saved*, because this app
 *  deliberately does not queue writes behind a dropped connection. A vague
 *  "connection lost" would leave a receptionist assuming the registration
 *  they just filled in went through.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div
      className="sticky top-0 z-50 bg-amber-100 border-b border-amber-300 text-amber-900"
      role="status"
      aria-live="assertive"
    >
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-600 shrink-0" />
        <span>
          <strong className="font-semibold">You're offline.</strong> Anything on screen is still
          here, but nothing will save until the connection is back. Don't close this tab.
        </span>
      </div>
    </div>
  )
}
