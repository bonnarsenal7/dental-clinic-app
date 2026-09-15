import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = () => void
const rt = vi.hoisted(() => ({
  channels: [] as {
    name: string
    tables: string[]
    handlers: (() => void)[]
    status?: (s: string) => void
  }[],
  removed: [] as string[],
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    channel(name: string) {
      const record = {
        name,
        tables: [] as string[],
        handlers: [] as Handler[],
        status: undefined as undefined | ((s: string) => void),
      }
      rt.channels.push(record)
      const channel = {
        on(_type: string, filter: { table: string }, handler: Handler) {
          record.tables.push(filter.table)
          record.handlers.push(handler)
          return channel
        },
        subscribe(cb: (s: string) => void) {
          record.status = cb
          return channel
        },
        _name: name,
      }
      return channel
    },
    removeChannel(channel: { _name: string }) {
      rt.removed.push(channel._name)
      return Promise.resolve('ok')
    },
  },
}))

const { useRealtimeRefresh, REALTIME_DEBOUNCE_MS } = await import('./useRealtimeRefresh')

const TABLES = ['appointments', 'invoices', 'payments'] as const

describe('useRealtimeRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    rt.channels.length = 0
    rt.removed.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('listens to every table it is given', () => {
    renderHook(() => useRealtimeRefresh('queue', TABLES, vi.fn()))
    expect(rt.channels).toHaveLength(1)
    expect(rt.channels[0].tables).toEqual(['appointments', 'invoices', 'payments'])
  })

  // One payment changes three rows. Three refetches for one event on clinic
  // Wi-Fi would be waste.
  it('gathers a burst of changes into one refetch', () => {
    const onChange = vi.fn()
    renderHook(() => useRealtimeRefresh('queue', TABLES, onChange))
    const [ch] = rt.channels
    ch.handlers.forEach((h) => h())
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  // The screen has just loaded; the first subscribe needs no refetch. A later
  // one is a reconnect, and whatever changed while offline was not replayed.
  it('catches up after a reconnect, but not on the first subscribe', () => {
    const onChange = vi.fn()
    renderHook(() => useRealtimeRefresh('queue', TABLES, onChange))
    const [ch] = rt.channels
    ch.status!('SUBSCRIBED')
    vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS)
    expect(onChange).not.toHaveBeenCalled()

    ch.status!('CHANNEL_ERROR')
    ch.status!('SUBSCRIBED')
    vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('calls the latest callback without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useRealtimeRefresh('queue', TABLES, cb), {
      initialProps: { cb: first },
    })
    rerender({ cb: second })
    expect(rt.channels).toHaveLength(1)
    rt.channels[0].handlers[0]()
    vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe when disabled', () => {
    renderHook(() => useRealtimeRefresh('queue', TABLES, vi.fn(), false))
    expect(rt.channels).toHaveLength(0)
  })

  it('closes the channel when the screen goes', () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useRealtimeRefresh('queue', TABLES, onChange))
    rt.channels[0].handlers[0]()
    unmount()
    expect(rt.removed).toEqual(['queue'])
    // A change that arrived just before leaving does not refetch afterwards.
    vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS)
    expect(onChange).not.toHaveBeenCalled()
  })
})
