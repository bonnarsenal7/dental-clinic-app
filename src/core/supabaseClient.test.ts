import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The fetch wrapper in supabaseClient is what drives the offline banner for
 *  the entire app: every Supabase call goes through it, so one observer
 *  covers screens nobody thought about. It had no test at all, which means a
 *  refactor could have silently disconnected the banner from reality. */

const observer = vi.hoisted(() => ({ online: vi.fn(), offline: vi.fn() }))
vi.mock('./useOnlineStatus', () => ({
  reportOnline: observer.online,
  reportOffline: observer.offline,
}))

// Capture the fetch the client is built with, rather than reaching into the
// real supabase-js instance.
const captured = vi.hoisted(() => ({ fetch: null as typeof fetch | null }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts: { global: { fetch: typeof fetch } }) => {
    captured.fetch = opts.global.fetch
    return { __client: true }
  },
}))

await import('./supabaseClient')

describe('the observed fetch', () => {
  beforeEach(() => {
    observer.online.mockClear()
    observer.offline.mockClear()
  })

  it('is installed on the Supabase client', () => {
    expect(captured.fetch).toBeTypeOf('function')
  })

  // navigator.onLine only knows the link layer, so it reports true for a
  // tablet associated with an access point whose uplink is down. A request
  // that actually succeeded is the only proof the connection is back.
  it('treats a successful request as proof the connection is back', async () => {
    const response = new Response('ok')
    globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch
    await expect(captured.fetch!('https://x.test')).resolves.toBe(response)
    expect(observer.online).toHaveBeenCalled()
    expect(observer.offline).not.toHaveBeenCalled()
  })

  // A 4xx/5xx is a reply — the network carried it. Reporting offline here
  // would put the banner up for an RLS refusal.
  it('does not report offline for an HTTP error, which is still a reply', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch
    await captured.fetch!('https://x.test')
    expect(observer.offline).not.toHaveBeenCalled()
    expect(observer.online).toHaveBeenCalled()
  })

  it('reports offline when the request could not be made at all', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    await expect(captured.fetch!('https://x.test')).rejects.toThrow(/failed to fetch/i)
    expect(observer.offline).toHaveBeenCalled()
  })

  // An aborted request or a bug in app code is not a connectivity problem.
  it('leaves the banner alone for a non-network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('something else went wrong')
    }) as unknown as typeof fetch
    await expect(captured.fetch!('https://x.test')).rejects.toThrow()
    expect(observer.offline).not.toHaveBeenCalled()
  })

  // It observes only. Nothing is queued or retried: this app shows a clear
  // offline state rather than silently deferring a write to a health record.
  it('rethrows rather than swallowing or retrying the failure', async () => {
    const inner = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    globalThis.fetch = inner as unknown as typeof fetch
    await expect(captured.fetch!('https://x.test')).rejects.toThrow()
    expect(inner).toHaveBeenCalledTimes(1)
  })

  it('passes the request through unchanged', async () => {
    const inner = vi.fn(async () => new Response('ok'))
    globalThis.fetch = inner as unknown as typeof fetch
    const init = { method: 'POST', body: '{}' }
    await captured.fetch!('https://x.test/rest', init)
    expect(inner).toHaveBeenCalledWith('https://x.test/rest', init)
  })
})
