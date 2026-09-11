import { useEffect, useState } from 'react'

/** Whether the browser currently believes it has a connection.
 *
 *  `navigator.onLine` only knows about the link layer: it reports true for
 *  a tablet associated with a clinic access point that has lost its uplink,
 *  which is exactly the failure this phase is about. So a failed request is
 *  treated as authoritative over the flag — `reportOffline()` lets the code
 *  that actually saw a fetch fail say so, and the browser's own `online`
 *  event clears it again.
 *
 *  This is deliberately a status indicator, not a sync engine: per the
 *  project constraints, writes are never queued behind it. The app tells
 *  you it failed and keeps your input on screen.
 */

let listeners: ((online: boolean) => void)[] = []
let forcedOffline = false

function broadcast() {
  const online = navigator.onLine && !forcedOffline
  listeners.forEach((l) => l(online))
}

/** Called when a request fails in a way that looks like a dead connection. */
export function reportOffline() {
  if (!forcedOffline) {
    forcedOffline = true
    broadcast()
  }
}

/** Called when any request succeeds — proof the connection is back, which
 *  the `online` event alone can't give us on a captive or uplink-less AP. */
export function reportOnline() {
  if (forcedOffline) {
    forcedOffline = false
    broadcast()
  }
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine && !forcedOffline)

  useEffect(() => {
    const update = (value: boolean) => setOnline(value)
    listeners.push(update)

    const handleOnline = () => {
      forcedOffline = false
      broadcast()
    }
    const handleOffline = () => broadcast()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      listeners = listeners.filter((l) => l !== update)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
