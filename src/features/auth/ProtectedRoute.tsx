import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useIdleTimeout } from './useIdleTimeout'
import type { StaffRole } from './types'
import { useIntakeLocked } from '../../core/intakeLock'
import IntakeLockScreen from './IntakeLockScreen'

interface ProtectedRouteProps {
  /** If set, only these roles may pass — anyone else is redirected home. */
  allow?: StaffRole[]
}

export default function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const { session, staff, loading, signOut } = useAuth()
  const location = useLocation()
  const intakeLocked = useIntakeLocked()

  useIdleTimeout(
    () => {
      void signOut()
    },
    Boolean(session && staff),
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  if (!session || !staff) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Before the role check and before any screen: while a patient has the
  // tablet, no staff route renders at all — including /change-password.
  if (intakeLocked) return <IntakeLockScreen />

  if (allow && !allow.includes(staff.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
