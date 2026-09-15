import { useEffect, useRef } from 'react'
import { supabase } from './supabaseClient'

/** One payment is three row changes — the payment, the invoice the totals
 *  trigger moves, the appointment checked out — so events are gathered into
 *  a single refetch rather than three. */
export const REALTIME_DEBOUNCE_MS = 300

/** Calls `onChange` whenever a row in any of `tables` changes, live.
 *
 *  **An event means "refetch", never "here is the data".** The screen always
 *  rebuilds from its normal query, so a missed or duplicated event can make
 *  it late but never wrong, and RLS decides what the refetch returns exactly
 *  as it does on first load. Tables must be in the `supabase_realtime`
 *  publication (0019).
 *
 *  **A reconnect refetches.** Events that happened while the clinic Wi-Fi was
 *  down are not replayed, so when the channel subscribes again the screen
 *  catches up. The first subscribe does not — the screen has just loaded.
 *
 *  Nothing is queued or retried here, per the project constraint: it only
 *  tells a screen to look again. Keep a slow poll alongside it as the floor
 *  for a channel that fails outright. */
export function useRealtimeRefresh(
  name: string,
  tables: readonly string[],
  onChange: () => void,
  enabled = true,
) {
  // The latest callback, without resubscribing every time it changes.
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  }, [onChange])

  const key = tables.join(',')

  useEffect(() => {
    if (!enabled || !key) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const fire = () => {
      clearTimeout(timer)
      timer = setTimeout(() => latest.current(), REALTIME_DEBOUNCE_MS)
    }

    let channel = supabase.channel(name)
    for (const table of key.split(',')) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire)
    }

    let subscribedBefore = false
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      if (subscribedBefore) fire()
      subscribedBefore = true
    })

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [name, key, enabled])
}
