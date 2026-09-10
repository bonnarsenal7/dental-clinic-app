import { useEffect, useState } from 'react'
import { supabase } from './core/supabaseClient'

type Status = 'checking' | 'connected' | 'error'

function App() {
  const [status, setStatus] = useState<Status>('checking')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    // No tables exist yet (schema lands in Phase 1), so this just confirms
    // the client can reach the Supabase project with the configured URL/key.
    supabase.auth
      .getSession()
      .then(({ error }) => {
        if (error) {
          setStatus('error')
          setDetail(error.message)
        } else {
          setStatus('connected')
        }
      })
      .catch((err: unknown) => {
        setStatus('error')
        setDetail(err instanceof Error ? err.message : String(err))
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Dental Clinic App</h1>
        <p className="text-slate-500 mt-2">Phase 0 foundation — Vite + React + TypeScript + Supabase.</p>
        <p className="mt-4 text-sm font-medium">
          Supabase:{' '}
          {status === 'checking' && <span className="text-slate-400">checking…</span>}
          {status === 'connected' && <span className="text-emerald-600">connected ✓</span>}
          {status === 'error' && <span className="text-red-600">error — {detail}</span>}
        </p>
      </div>
    </div>
  )
}

export default App
