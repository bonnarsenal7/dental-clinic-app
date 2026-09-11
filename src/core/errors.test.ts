import { describe, expect, it } from 'vitest'
import { OFFLINE_MESSAGE, isNetworkError, toMessage } from './errors'

describe('network error detection', () => {
  // The real strings browsers produce when the connection drops. If a
  // browser changes its wording this test fails, which is the point —
  // silently failing to match means the offline banner never appears.
  it.each([
    ['Chrome/Edge', 'Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['Safari', 'Load failed'],
    ['older WebKit', 'Network request failed'],
    ['undici', 'TypeError: fetch failed'],
    ['Chrome net stack', 'net::ERR_INTERNET_DISCONNECTED'],
    ['iOS', 'The Internet connection appears to be offline.'],
  ])('treats a %s disconnect as offline', (_browser, message) => {
    const error = new TypeError(message)
    expect(isNetworkError(error)).toBe(true)
    expect(toMessage(error)).toBe(OFFLINE_MESSAGE)
  })

  // Replacing a real failure with "you're offline" would send staff to
  // check the Wi-Fi over a constraint violation. These must pass through.
  it.each([
    ['a unique constraint', 'duplicate key value violates unique constraint "procedures_name_idx"'],
    ['an RLS refusal', 'new row violates row-level security policy for table "visit_notes"'],
    ['an expired session', 'JWT expired'],
    ['a missing relation', 'relation "invoice_items" does not exist'],
  ])('keeps the wording of %s', (_kind, message) => {
    const error = new Error(message)
    expect(isNetworkError(error)).toBe(false)
    expect(toMessage(error)).toBe(message)
  })

  it('handles non-Error throws without crashing', () => {
    expect(toMessage('something odd')).toBe('something odd')
    expect(toMessage(null)).toBe('Something went wrong.')
    expect(toMessage(undefined)).toBe('Something went wrong.')
  })
})
