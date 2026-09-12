import { vi } from 'vitest'

/** A stand-in for the Supabase client, for testing the `api.ts` modules.
 *
 *  Those modules were the largest untested surface in the app — every one of
 *  them sat at 0% — and they are where the query itself carries the meaning:
 *  which day's bounds are asked for, whether a filter is applied, which
 *  constraint failure is translated into words a receptionist can act on.
 *  None of that is observable from a screen test that mocks the module away.
 *
 *  The builder records every chained call, so a test can assert the query
 *  rather than only its result: `.gte('scheduled_at', <local midnight>)` is
 *  the behaviour, not an implementation detail. */

export interface RecordedCall {
  method: string
  args: unknown[]
}

export interface QueryResult {
  data?: unknown
  error?: { message: string; code?: string } | null
}

export interface RecordedQuery {
  table: string
  calls: RecordedCall[]
  /** `insert`/`update` payload, for the common "what did it write?" assertion. */
  payload: unknown
  arg: (method: string, index?: number) => unknown
}

function makeBuilder(result: QueryResult, record: RecordedQuery) {
  // The real builder is a thenable that also accepts an unbounded chain of
  // filter methods, so a Proxy models it more honestly than a fixed list —
  // and a method this app starts using tomorrow needs no change here.
  const builder: Record<string | symbol, unknown> = {}
  const proxy: unknown = new Proxy(builder, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
            onFulfilled,
            onRejected,
          )
      }
      // Let vitest/inspectors probe without being handed a fake method.
      if (typeof prop !== 'string') return undefined
      if (prop === 'catch' || prop === 'finally') return undefined
      return (...args: unknown[]) => {
        record.calls.push({ method: prop, args })
        if ((prop === 'insert' || prop === 'update' || prop === 'upsert') && args.length > 0) {
          record.payload = args[0]
        }
        return proxy
      }
    },
  })
  return proxy
}

export function createSupabaseMock() {
  const queues = new Map<string, QueryResult[]>()
  const queries: RecordedQuery[] = []
  const storageOps: RecordedCall[] = []
  let storageResult: QueryResult = { data: null }
  let signedUrl = 'https://signed.example/file.png'
  const invoked: { name: string; body: unknown }[] = []
  let invokeResult: QueryResult = { data: { ok: true } }
  const rpcCalls: { name: string; args: unknown }[] = []
  const rpcResults = new Map<string, QueryResult>()

  /** Queue a result for the next query against `table`. Queue several to
   *  answer successive calls in order — `setAppointmentStatus` touches two
   *  tables in one go, and a single shared result would hide the ordering. */
  function queue(table: string, result: QueryResult) {
    const existing = queues.get(table) ?? []
    existing.push(result)
    queues.set(table, existing)
    return client
  }

  const client = {
    from(table: string) {
      const next = queues.get(table)?.shift() ?? { data: [] }
      const record: RecordedQuery = {
        table,
        calls: [],
        payload: undefined,
        arg: (method, index = 0) => record.calls.find((c) => c.method === method)?.args[index],
      }
      queries.push(record)
      return makeBuilder(next, record)
    },
    rpc(name: string, args?: unknown) {
      rpcCalls.push({ name, args })
      const result = rpcResults.get(name) ?? { data: [] }
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
    storage: {
      from(bucket: string) {
        const api = {
          upload: vi.fn(async (path: string, body: unknown, opts?: unknown) => {
            storageOps.push({ method: 'upload', args: [bucket, path, body, opts] })
            return { data: { path }, error: storageResult.error ?? null }
          }),
          createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
            storageOps.push({ method: 'createSignedUrl', args: [bucket, path, expiresIn] })
            return {
              data: storageResult.error ? null : { signedUrl },
              error: storageResult.error ?? null,
            }
          }),
          remove: vi.fn(async (paths: string[]) => {
            storageOps.push({ method: 'remove', args: [bucket, paths] })
            return { data: null, error: storageResult.error ?? null }
          }),
        }
        return api
      },
    },
    functions: {
      invoke: vi.fn(async (name: string, opts?: { body?: unknown }) => {
        invoked.push({ name, body: opts?.body })
        return { data: invokeResult.data ?? null, error: invokeResult.error ?? null }
      }),
    },
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => ({ data: { user: null } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ error: null })),
      onAuthStateChange: vi.fn(() => ({ subscription: { unsubscribe: vi.fn() } })),
    },

    // --- inspection -------------------------------------------------------
    queue,
    /** Every query, in the order the code ran them. */
    get queries() {
      return queries
    },
    /** The nth query against `table` (default: the first). */
    query(table: string, index = 0) {
      const matching = queries.filter((q) => q.table === table)
      return matching[index]
    },
    /** Method names chained onto the nth query against `table`. */
    methods(table: string, index = 0) {
      return (client.query(table, index)?.calls ?? []).map((c) => c.method)
    },
    get storageOps() {
      return storageOps
    },
    get invoked() {
      return invoked
    },
    get rpcCalls() {
      return rpcCalls
    },
    queueRpc(name: string, result: QueryResult) {
      rpcResults.set(name, result)
      return client
    },
    setStorageResult(r: QueryResult) {
      storageResult = r
    },
    setSignedUrl(url: string) {
      signedUrl = url
    },
    setInvokeResult(r: QueryResult) {
      invokeResult = r
    },
    reset() {
      queues.clear()
      queries.length = 0
      storageOps.length = 0
      invoked.length = 0
      rpcCalls.length = 0
      rpcResults.clear()
      storageResult = { data: null }
      invokeResult = { data: { ok: true } }
    },
  }

  return client
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>
