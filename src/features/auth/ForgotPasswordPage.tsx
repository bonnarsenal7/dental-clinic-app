import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../core/supabaseClient'
import { toMessage } from '../../core/errors'
import { cn } from '../../core/cn'
import { Field, TextInput } from '../../core/components/ui/Field'
import Button from '../../core/components/ui/Button'
import AuthLayout, { authAlertCls, authLinkCls } from './AuthLayout'

// The case this screen cannot help with — a shared or unreachable mailbox —
// is exactly what the admin's reset on the Staff screen exists for, so the
// way out is named on both halves of the page.
const ADMIN_FALLBACK = "Can't get to that inbox? Ask an admin to reset your password from the Staff screen."

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function send(address: string) {
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setError(toMessage(error.message))
        return
      }
      setSentTo(address)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const address = email.trim()
    if (!address) {
      setError('Enter your email address.')
      return
    }
    void send(address)
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={ADMIN_FALLBACK}>
        {/* Worded the same whether or not the account exists: saying "no
            such account" would let anyone test which staff emails do. */}
        <p className="text-sm text-slate-600 mt-2">
          If an account exists for <span className="font-medium text-slate-900">{sentTo}</span>, a reset link
          has been sent to it. Open the link to choose a new password.
        </p>
        <p className="text-sm text-slate-500 mt-3">Nothing after a few minutes? Check your spam folder.</p>

        {error && (
          <p role="alert" className={cn(authAlertCls, 'mt-5 mb-0')}>
            {error}
          </p>
        )}

        <Button
          variant="secondary"
          disabled={submitting}
          onClick={() => void send(sentTo)}
          className="mt-6 w-full py-2.5"
        >
          {submitting ? 'Sending…' : 'Send it again'}
        </Button>

        <Link to="/login" className={authLinkCls}>
          Back to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Reset password"
      intro="Enter the email for your clinic account and we'll send you a link to choose a new password."
      footer={ADMIN_FALLBACK}
    >
      {error && (
        <p role="alert" className={authAlertCls}>
          {error}
        </p>
      )}

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={submitting} className="mt-2 w-full py-2.5">
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <Link to="/login" className={authLinkCls}>
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
