import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../core/supabaseClient'
import type { StaffProfile } from './types'

interface AuthContextValue {
  session: Session | null
  staff: StaffProfile | null
  loading: boolean
  /** Set when a session exists but no usable staff record backs it
   *  (deactivated, or an auth user with no staff row). */
  deniedReason: string | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshStaff: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [deniedReason, setDeniedReason] = useState<string | null>(null)

  async function loadStaffForSession(current: Session | null) {
    if (!current) {
      setStaff(null)
      return
    }
    const { data, error } = await supabase
      .from('staff')
      .select('id, name, email, role, active, created_at')
      .eq('id', current.user.id)
      .maybeSingle()

    if (error) {
      setStaff(null)
      setDeniedReason('Could not load your staff profile. Contact an administrator.')
      return
    }
    if (!data) {
      setStaff(null)
      setDeniedReason('This login has no staff record. Contact an administrator.')
      await supabase.auth.signOut()
      return
    }
    if (!data.active) {
      setStaff(null)
      setDeniedReason('Your account has been deactivated. Contact an administrator.')
      await supabase.auth.signOut()
      return
    }
    setDeniedReason(null)
    setStaff(data as StaffProfile)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session: initial } }) => {
      if (!mounted) return
      setSession(initial)
      await loadStaffForSession(initial)
      if (mounted) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      await loadStaffForSession(next)
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function signIn(email: string, password: string) {
    setDeniedReason(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setStaff(null)
  }

  async function refreshStaff() {
    await loadStaffForSession(session)
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, deniedReason, signIn, signOut, refreshStaff }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
