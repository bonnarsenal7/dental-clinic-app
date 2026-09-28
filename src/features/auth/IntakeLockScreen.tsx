import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../core/supabaseClient'
import { clearIntakeLock } from '../../core/intakeLock'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { Field, TextInput } from '../../core/components/ui/Field'
import Button from '../../core/components/ui/Button'
import { useAuth } from './AuthContext'
import toothcoLogo from '../../assets/toothco-logo.png'
import { CLINIC_NAME } from '../../core/branding'

/** What a staff tab shows while a patient has the tablet.
 *
 *  Nothing from the app renders behind it — not the nav, not the page the
 *  receptionist was on — so there is nothing to read past it either.
 *  Unlocking checks the password against Supabase rather than a PIN kept in
 *  the browser: a PIN is four digits a patient can watch someone type. */
export default function IntakeLockScreen() {
  const { staff, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (!staff) return
    if (!password) {
      setError('Enter your password.')
      return
    }
    setChecking(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: staff.email,
        password,
      })
      if (authError) {
        setError('That password is not right.')
        return
      }
      clearIntakeLock()
      // Where the patient's form is now waiting.
      navigate('/patients')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setPassword('')
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        noValidate
        onSubmit={(e) => void handleUnlock(e)}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4"
      >
        <img src={toothcoLogo} alt={CLINIC_NAME} className="h-10 w-auto self-center" />
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Patient intake in progress</h1>
          <p className="text-sm text-slate-500 mt-1">
            A patient is filling in their details in the other tab. When the tablet is handed back, enter your
            password to continue.
          </p>
        </div>
        {error && <ErrorState message={error} />}
        <Field label={`Password for ${staff?.name ?? 'staff'}`}>
          <TextInput
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={checking}>
          {checking ? 'Checking…' : 'Unlock'}
        </Button>
        {/* Another staff member taking over, or a forgotten password: signing
            out clears the lock and leaves the login screen, which protects
            the records just as well. */}
        <Button variant="subtle" onClick={() => void signOut()}>
          Sign out instead
        </Button>
      </form>
    </div>
  )
}
