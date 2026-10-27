import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { CLINIC_NAME } from '../../core/branding'
import toothcoLogo from '../../assets/toothco-logo.png'
import { Field, TextInput } from '../../core/components/ui/Field'
import Button from '../../core/components/ui/Button'

const alertCls = 'mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2'

export default function LoginPage() {
  const { session, staff, deniedReason, signIn } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session && staff) {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  // A tablet's on-screen keyboard reports no Caps Lock state, so this only
  // ever shows for a desk keyboard — where it is the usual cause of a
  // "wrong" password.
  function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={toothcoLogo} alt={CLINIC_NAME} className="h-16 w-auto" />
        </div>
        <h1 className="sr-only">{CLINIC_NAME}</h1>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1 bg-gold-700" />
          <div className="px-8 pt-7 pb-8">
            <h2 className="text-lg font-semibold text-slate-900">Staff sign in</h2>
            <p className="text-sm text-slate-500 mt-1 mb-6">
              Use the email and password for your clinic account.
            </p>

            {deniedReason && (
              <p role="alert" className={alertCls}>
                {deniedReason}
              </p>
            )}
            {error && (
              <p role="alert" className={alertCls}>
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Field label="Email">
                {/* iPad capitalises the first letter of a text field by
                  default, which turns a correct email into a failed login. */}
                <TextInput
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <div className="flex flex-col gap-1">
                <div className="relative">
                  <Field label="Password">
                    <TextInput
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={trackCapsLock}
                      onKeyUp={trackCapsLock}
                      className="pr-16"
                    />
                  </Field>
                  {/* Outside the <label>, so its text is not part of the
                    password field's accessible name. */}
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1 bottom-1 rounded px-2 py-1 text-xs font-medium text-gold-700 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-gold-500"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {capsLock && <p className="text-xs text-slate-600">Caps Lock is on.</p>}
              </div>

              <Button type="submit" disabled={submitting} className="mt-2 w-full py-2.5">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <Link
              to="/forgot-password"
              className="block text-center text-sm text-gold-700 hover:text-gold-800 hover:underline mt-5"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <p className="text-xs text-slate-500 text-center mt-6">
          For clinic staff only. You are signed out after 15 minutes without activity.
        </p>
      </div>
    </div>
  )
}
