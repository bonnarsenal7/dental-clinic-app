/** Turning raw failures into something a receptionist can act on.
 *
 *  supabase-js surfaces a dropped connection as `TypeError: Failed to
 *  fetch` (or `NetworkError when attempting to fetch resource` on Firefox).
 *  Shown verbatim — which is what every screen did before Phase 6 — that
 *  reads as a bug in the app rather than as "the Wi-Fi went". The clinic's
 *  Wi-Fi is the known-flaky part of this system, so it earns a message of
 *  its own.
 */

const NETWORK_SIGNATURES = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'load failed',
  'fetch failed',
  'err_internet_disconnected',
  'err_network',
  'the internet connection appears to be offline',
]

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const haystack = message.toLowerCase()
  return NETWORK_SIGNATURES.some((sig) => haystack.includes(sig))
}

export const OFFLINE_MESSAGE =
  "You're offline — that change wasn't saved. Check the clinic Wi-Fi and try again; what you typed is still here."

/** The single place screens should call in a catch block. Keeps the
 *  original wording for real errors (a constraint violation is genuinely
 *  useful to read) and replaces only the network ones. */
export function toMessage(error: unknown): string {
  if (isNetworkError(error)) return OFFLINE_MESSAGE
  if (error instanceof Error) return error.message
  return String(error ?? 'Something went wrong.')
}
