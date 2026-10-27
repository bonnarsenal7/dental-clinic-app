import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import AuthLayout, { authAlertCls, authLinkCls } from './AuthLayout'
import { Field, TextInput } from '../../core/components/ui/Field'
import Button from '../../core/components/ui/Button'

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
    <AuthLayout
      title="Staff sign in"
      intro="Use the email and password for your clinic account."
      footer="For clinic staff only. You are signed out after 15 minutes without activity."
    >
      {deniedReason && (
        <p role="alert" className={authAlertCls}>
          {deniedReason}
        </p>
      )}
      {error && (
        <p role="alert" className={authAlertCls}>
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
                    password field's accessible name. Pinned to the input's
                    bottom edge at the input's own height: on a tablet the
                    touch-target rule raises both to 44px together, where an
                    inset button grew up into the label. */}
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-0 bottom-0 h-[38px] rounded-r-md px-3 text-xs font-medium text-gold-700 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-gold-500"
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

      <Link to="/forgot-password" className={authLinkCls}>
        Forgot password?
      </Link>
    </AuthLayout>
  )
}
