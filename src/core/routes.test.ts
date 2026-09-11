import { describe, expect, it, vi } from 'vitest'
import { routeChunks, routesToWarm, warmRoutesFor } from './routes'
import type { RouteKey } from './routes'
import type { StaffRole } from '../features/auth/types'

/** Runs the warmer with the idle callback executed synchronously, and
 *  reports which chunks it asked for. */
function warmed(role: StaffRole): RouteKey[] {
  const asked: RouteKey[] = []
  // stubGlobal rather than spyOn: happy-dom has no requestIdleCallback to
  // spy on, and neither does Safari before 16.4 — the browser on an older
  // clinic iPad — so the timer fallback is a live path, not a theoretical one.
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
    cb()
    return 1
  })
  try {
    warmRoutesFor(role, async (key) => {
      asked.push(key)
    })
  } finally {
    vi.unstubAllGlobals()
  }
  return asked
}

describe('route warming', () => {
  // Every lazy route must be reachable through this map, or App.tsx and the
  // warmer import the same page by two specifiers — which fetches the chunk
  // twice and warms nothing.
  it('covers every lazily loaded route', () => {
    expect(Object.keys(routeChunks)).toHaveLength(17)
    for (const fn of Object.values(routeChunks)) expect(typeof fn).toBe('function')
  })

  // Warming everything would put the whole bundle back on the wire and undo
  // the split. Only the handful someone opens first.
  it.each<StaffRole>(['receptionist', 'dentist', 'admin'])('warms a short list for a %s', (role) => {
    const list = routesToWarm(role)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(5)
    expect(list.length).toBeLessThan(Object.keys(routeChunks).length)
    for (const key of list) expect(routeChunks[key]).toBeDefined()
  })

  // The PDF stack is the heaviest thing in the app and the worst to wait for
  // with a patient at the desk.
  it('warms the invoice screen for reception, and the chart for a dentist', () => {
    expect(warmed('receptionist')).toContain('invoiceDetail')
    expect(warmed('dentist')).toContain('patientChart')
  })

  // A dentist has no business waiting on the billing chunks, and reception
  // cannot open a chart at all — the RLS boundary makes that a dead fetch.
  it('does not warm what a role will not open', () => {
    expect(warmed('dentist')).not.toContain('invoiceDetail')
    expect(warmed('receptionist')).not.toContain('patientChart')
  })

  // Safari on iPad had no requestIdleCallback until 16.4, so the timer
  // fallback is what actually runs on an older clinic tablet.
  it('still warms on a browser with no idle callback', () => {
    vi.useFakeTimers()
    const asked: RouteKey[] = []
    try {
      warmRoutesFor('dentist', async (key) => {
        asked.push(key)
      })
      expect(asked, 'should wait rather than fetch immediately').toHaveLength(0)
      vi.advanceTimersByTime(1500)
      expect(asked.length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  // Speculatively pulling half a megabyte over someone's phone hotspot is
  // not a trade to make on their behalf.
  it('downloads nothing when the device asks to save data', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'connection')
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    })
    try {
      expect(warmed('receptionist')).toHaveLength(0)
    } finally {
      if (original) Object.defineProperty(navigator, 'connection', original)
      else delete (navigator as { connection?: unknown }).connection
    }
  })
})
