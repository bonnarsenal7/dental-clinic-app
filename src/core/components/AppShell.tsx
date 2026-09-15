import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../features/auth/AuthContext'
import { supabase } from '../supabaseClient'
import OfflineBanner from './OfflineBanner'
import { Toaster } from './ui/toast'
import { LoadingState } from './states'
import { warmRoutesFor } from '../routes'
import { CLINIC_NAME } from '../branding'
import Button, { ButtonLink } from './ui/Button'
import toothcoLogo from '../../assets/toothco-logo.png'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-gold-700 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`

export default function AppShell() {
  const { staff, signOut } = useAuth()
  const [clinicName, setClinicName] = useState('')

  useEffect(() => {
    supabase
      .from('clinic_settings')
      .select('clinic_name')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.clinic_name) setClinicName(data.clinic_name)
      })
  }, [])

  // Splitting the routes means tapping "Schedule" now waits on a fetch.
  // Warming the handful this role opens first puts that back, without
  // putting the whole bundle back on the wire.
  useEffect(() => {
    if (staff) warmRoutesFor(staff.role)
  }, [staff])

  if (!staff) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <OfflineBanner />
      <header className="bg-white border-b border-slate-200">
        {/* Two rows, not one.
            As a single `justify-between` row the brand, the nav and the
            account cluster were three wrapping siblings: at an admin's eight
            nav links the cluster broke onto its own line and `justify-between`
            then spread it across the full width, which is what read as
            "out of place". Splitting identity from navigation means neither
            can push the other around. */}
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* The logo is a wordmark — it already reads "ToothCo Dental
                Clinic" — so the name is not repeated beside it. That makes
                the image the only thing naming the clinic, which is why it
                carries real alt text rather than alt="": with the text gone
                and the image decorative, the header named the clinic to
                nobody using a screen reader. */}
            <div className="flex items-center gap-2 min-w-0">
              <img src={toothcoLogo} alt={clinicName || CLINIC_NAME} className="h-8 w-auto shrink-0" />
            </div>

            {/* The name and role are read, not pressed, so they stay text —
                but both controls beside them are now the same shape and
                size. They were a bare text link next to a bordered button:
                on a tablet the `pointer: coarse` rule grows a <button> to
                44px and only matches links carrying a rounded-md utility,
                so the link stayed at text height next to a 44px button. */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right leading-tight mr-1">
                <p className="text-sm font-medium text-slate-700 whitespace-nowrap">{staff.name}</p>
                <p className="text-xs text-slate-400 capitalize">{staff.role}</p>
              </div>
              <ButtonLink to="/change-password" variant="subtle" size="sm">
                Change password
              </ButtonLink>
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>

          <nav className="flex items-center gap-1 flex-wrap">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            {/* A dentist works from the dashboard and their own patients'
                records: the diary and billing are the front desk's, and a
                chart is opened from the patient rather than picked from
                everyone. The routes refuse them too (App.tsx). */}
            {staff.role !== 'dentist' && (
              <NavLink to="/schedule" className={navLinkClass}>
                Schedule
              </NavLink>
            )}
            <NavLink to="/patients" className={navLinkClass}>
              Patients
            </NavLink>
            {staff.role === 'admin' && (
              <NavLink to="/charting" className={navLinkClass}>
                Charting
              </NavLink>
            )}
            {staff.role !== 'dentist' && (
              <NavLink to="/billing" className={navLinkClass}>
                Billing
              </NavLink>
            )}
            {staff.role === 'admin' && (
              <>
                <NavLink to="/admin/staff" className={navLinkClass}>
                  Staff
                </NavLink>
                <NavLink to="/admin/settings" className={navLinkClass}>
                  Clinic Settings
                </NavLink>
                <NavLink to="/admin/audit" className={navLinkClass}>
                  Audit Log
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Inside the shell, so the nav stays put while a lazily loaded route
          arrives instead of the whole screen blanking. */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>

      <Toaster />
    </div>
  )
}
