import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../core/supabaseClient'

/** Handles both cases: a fresh password after clicking a reset-email link
 *  (Supabase gives that click a temporary session), and a logged-in staff
 *  member proactively changing their password from the nav shell. */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-8">
        <h1 className="text-xl font-semibold text-slate-800 text-center">Set a new password</h1>

        {done ? (
          <p className="text-sm text-emerald-600 text-center mt-6">Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              New password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              Confirm new password
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-md bg-gold-700 text-white text-sm font-medium py-2 hover:bg-gold-800 disabled:opacity-50"
            >
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
