import type { StaffRole } from '../features/auth/types'

/** The dynamic imports behind every lazily loaded route.
 *
 *  They live here rather than inline in App.tsx so the shell can *warm* the
 *  ones a given role is about to need, using exactly the same import the
 *  router will use — a second, slightly different import specifier would
 *  fetch a second copy of the chunk and warm nothing. */
export const routeChunks = {
  dashboard: () => import('../features/dashboard/DashboardPage'),
  schedule: () => import('../features/scheduling/SchedulePage'),
  recalls: () => import('../features/scheduling/RecallsPage'),
  patients: () => import('../features/patients/PatientsPage'),
  patientRegister: () => import('../features/patients/PatientRegisterPage'),
  patientProfile: () => import('../features/patients/PatientProfilePage'),
  patientEdit: () => import('../features/patients/PatientEditPage'),
  billing: () => import('../features/billing/BillingPage'),
  patientLedger: () => import('../features/billing/PatientLedgerPage'),
  invoiceBuilder: () => import('../features/billing/InvoiceBuilderPage'),
  invoiceDetail: () => import('../features/billing/InvoiceDetailPage'),
  charting: () => import('../features/charting/ChartingPage'),
  patientChart: () => import('../features/charting/PatientChartPage'),
  priceList: () => import('../features/billing/PriceListPage'),
  staffManagement: () => import('../features/admin/StaffManagementPage'),
  clinicSettings: () => import('../features/admin/ClinicSettingsPage'),
  auditLog: () => import('../features/admin/AuditLogPage'),
  roster: () => import('../features/roster/RosterPage'),
} as const

/** What each role opens within the first minute of a shift.
 *
 *  Deliberately short. Warming everything would put the whole bundle back on
 *  the wire and undo the split; the point is that the two or three screens
 *  someone actually taps are already there, and the rest still arrive on
 *  demand. Invoice *detail* is included for reception because it drags in
 *  the PDF stack — the heaviest thing in the app, and the one worst to wait
 *  for with a patient standing at the desk. */
const WARM_BY_ROLE: Record<StaffRole, (keyof typeof routeChunks)[]> = {
  receptionist: ['schedule', 'patients', 'patientProfile', 'patientLedger', 'invoiceDetail'],
  // No schedule: a dentist's nav does not offer it, and the route refuses them.
  dentist: ['patients', 'patientProfile', 'patientChart'],
  admin: ['schedule', 'patients', 'patientProfile', 'patientChart', 'patientLedger'],
}

export type RouteKey = keyof typeof routeChunks

/** Which chunks a role gets warmed. Pure, so the policy can be asserted
 *  without mocking the module system. */
export function routesToWarm(role: StaffRole): RouteKey[] {
  return WARM_BY_ROLE[role] ?? []
}

/** Fetches those chunks once the browser is idle.
 *
 *  Skipped entirely when the device asks us to save data: this app is used
 *  on tablets that sometimes fall back to a phone hotspot, and speculatively
 *  downloading half a megabyte on someone's mobile data is not a trade we
 *  get to make for them. */
export function warmRoutesFor(
  role: StaffRole,
  // Injectable purely so a test can observe what was asked for without
  // reaching into the module system to replace dynamic imports.
  load: (key: RouteKey) => Promise<unknown> = (key) => routeChunks[key](),
) {
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return

  const run = () => {
    for (const key of routesToWarm(role)) {
      // Failure is fine and silent: the router will fetch it again when the
      // route is actually opened, and report the error there.
      void load(key).catch(() => {})
    }
  }

  const idle = (
    window as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
  ).requestIdleCallback
  if (idle) idle(run, { timeout: 3000 })
  else window.setTimeout(run, 1500)
}
