import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../../features/auth/AuthContext'
import { supabase } from '../supabaseClient'
import OfflineBanner from './OfflineBanner'
import { CLINIC_NAME } from '../branding'
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

  if (!staff) return null

  return (
    <div className="min-h-screen bg-slate-50">
      <OfflineBanner />
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <img src={toothcoLogo} alt="" className="h-8 w-auto" />
            <p className="text-sm font-semibold text-slate-800">{clinicName || CLINIC_NAME}</p>
          </div>

          <nav className="flex items-center gap-1 flex-wrap">
            <NavLink to="/" end className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/schedule" className={navLinkClass}>
              Schedule
            </NavLink>
            <NavLink to="/patients" className={navLinkClass}>
              Patients
            </NavLink>
            {staff.role !== 'receptionist' && (
              <NavLink to="/charting" className={navLinkClass}>
                Charting
              </NavLink>
            )}
            <NavLink to="/billing" className={navLinkClass}>
              Billing
            </NavLink>
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

          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <p className="font-medium text-slate-700">{staff.name}</p>
              <p className="text-slate-400 text-xs capitalize">{staff.role}</p>
            </div>
            <NavLink to="/change-password" className="text-slate-500 hover:text-slate-700">
              Change password
            </NavLink>
            <button
              onClick={() => void signOut()}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
