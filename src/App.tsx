import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import ProtectedRoute from './features/auth/ProtectedRoute'
import LoginPage from './features/auth/LoginPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import ResetPasswordPage from './features/auth/ResetPasswordPage'
import AppShell from './core/components/AppShell'
import { routeChunks } from './core/routes'

// Everything behind the login is loaded on demand.
//
// The whole app used to arrive in one file, so a tablet on clinic Wi-Fi
// downloaded charting, billing and the admin screens — and jsPDF, pulled in
// by the receipt generator — before the login form could paint. Nothing
// above this line is lazy: the auth screens and the shell are what someone
// waits for, and splitting those would only add a round trip.
//
// The Suspense boundary lives inside AppShell, around the outlet, so the
// nav bar stays put while a route arrives rather than the screen blanking.
const AuditLogPage = lazy(routeChunks.auditLog)
const BillingPage = lazy(routeChunks.billing)
const ChartingPage = lazy(routeChunks.charting)
const ClinicSettingsPage = lazy(routeChunks.clinicSettings)
const DashboardPage = lazy(routeChunks.dashboard)
const InvoiceBuilderPage = lazy(routeChunks.invoiceBuilder)
const InvoiceDetailPage = lazy(routeChunks.invoiceDetail)
const PatientChartPage = lazy(routeChunks.patientChart)
const PatientEditPage = lazy(routeChunks.patientEdit)
const PatientLedgerPage = lazy(routeChunks.patientLedger)
const PatientProfilePage = lazy(routeChunks.patientProfile)
const PatientRegisterPage = lazy(routeChunks.patientRegister)
const PatientsPage = lazy(routeChunks.patients)
const PriceListPage = lazy(routeChunks.priceList)
const RecallsPage = lazy(routeChunks.recalls)
const SchedulePage = lazy(routeChunks.schedule)
const StaffManagementPage = lazy(routeChunks.staffManagement)

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          {/* Public: reached via the password-reset email link, which
              carries its own temporary Supabase session. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/change-password" element={<ResetPasswordPage />} />

            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/recalls" element={<RecallsPage />} />
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/patients/new" element={<PatientRegisterPage />} />
              <Route path="/patients/:id" element={<PatientProfilePage />} />
              <Route path="/patients/:id/edit" element={<PatientEditPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/patients/:id/billing" element={<PatientLedgerPage />} />
              <Route path="/patients/:id/invoices/new" element={<InvoiceBuilderPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />

              {/* tooth_records are dentist/admin-only at the RLS level
                  (0002_rls.sql), so the chart screens are guarded to match
                  rather than showing a receptionist a chart that can't load. */}
              <Route element={<ProtectedRoute allow={['dentist', 'admin']} />}>
                <Route path="/charting" element={<ChartingPage />} />
                <Route path="/patients/:id/chart" element={<PatientChartPage />} />
              </Route>

              <Route element={<ProtectedRoute allow={['admin']} />}>
                <Route path="/billing/prices" element={<PriceListPage />} />
                <Route path="/admin/staff" element={<StaffManagementPage />} />
                <Route path="/admin/settings" element={<ClinicSettingsPage />} />
                <Route path="/admin/audit" element={<AuditLogPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
