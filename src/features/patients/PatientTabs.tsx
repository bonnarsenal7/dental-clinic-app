import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** Gold-900, not the 700 used for a primary action elsewhere: this bar also
 *  renders above the odontogram, and gold-700 beside a tooth measures 1.65:1
 *  against the chart's crown amber (see the gold guard in CLAUDE.md). */
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium ${
    isActive ? 'bg-gold-100 text-gold-900 border border-gold-300' : 'text-slate-600 hover:bg-slate-100'
  }`

/** One set of tabs across every screen about a patient.
 *
 *  Each screen used to carry its own way back — "Dental chart", "Billing",
 *  "Back to ledger", "Patient profile" — which meant the way out of a screen
 *  depended on which screen you were in, and some had none. The Chart tab
 *  follows the RLS boundary on tooth_records: a receptionist has no policy
 *  at all there and the route refuses them, so offering it would be a link
 *  that bounces. */
export default function PatientTabs({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const canChart = staff?.role === 'dentist' || staff?.role === 'admin'

  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-slate-200 pb-2">
      <NavLink to="/patients" className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-800 mr-1">
        ‹ Patients
      </NavLink>
      <nav aria-label="Patient record" className="flex items-center gap-1 flex-wrap">
        <NavLink to={`/patients/${patientId}`} end className={tabClass}>
          Profile
        </NavLink>
        {canChart && (
          <NavLink to={`/patients/${patientId}/chart`} className={tabClass}>
            Dental chart
          </NavLink>
        )}
        <NavLink to={`/patients/${patientId}/billing`} className={tabClass}>
          Billing
        </NavLink>
      </nav>
    </div>
  )
}
