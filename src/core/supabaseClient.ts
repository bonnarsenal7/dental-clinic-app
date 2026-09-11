import { createClient } from '@supabase/supabase-js'
import { isNetworkError } from './errors'
import { reportOffline, reportOnline } from './useOnlineStatus'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env.local (see .env.local placeholder).',
  )
}

/** Every Supabase call goes through here, which makes it the one place that
 *  can tell whether the clinic Wi-Fi is actually carrying traffic.
 *
 *  Detecting connectivity centrally rather than at each call site means a
 *  screen nobody thought about still drives the offline banner correctly,
 *  and a request that *succeeds* is treated as proof we're back — which
 *  `navigator.onLine` can't tell us, since it reports true for a tablet
 *  associated with an access point whose uplink is down.
 *
 *  It only observes. Nothing is queued or retried here: per the project
 *  constraints this app shows a clear offline state rather than silently
 *  deferring writes to a health record. */
const observedFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init)
    reportOnline()
    return response
  } catch (error) {
    if (isNetworkError(error)) reportOffline()
    throw error
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: observedFetch },
})
