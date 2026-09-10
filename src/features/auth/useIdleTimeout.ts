import { useEffect, useRef } from 'react'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes — see CLAUDE.md for rationale.
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

/** Calls onIdle after IDLE_TIMEOUT_MS of no user interaction. Only wired up
 *  while a staff member is actually signed in (see ProtectedRoute). */
export function useIdleTimeout(onIdle: () => void, enabled: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(onIdle, IDLE_TIMEOUT_MS)
    }

    reset()
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, reset))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, reset))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
