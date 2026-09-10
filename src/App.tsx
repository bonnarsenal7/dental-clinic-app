import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './features/auth/AuthContext'
import ProtectedRoute from './features/auth/ProtectedRoute'
import LoginPage from './features/auth/LoginPage'
import ForgotPasswordPage from './features/auth/ForgotPasswordPage'
import ResetPasswordPage from './features/auth/ResetPasswordPage'
import AppShell from './core/components/AppShell'
import DashboardPage from './core/components/DashboardPage'
import PatientsPage from './features/patients/PatientsPage'
import PatientRegisterPage from './features/patients/PatientRegisterPage'
import PatientProfilePage from './features/patients/PatientProfilePage'
import PatientEditPage from './features/patients/PatientEditPage'
import ChartingPage from './features/charting/ChartingPage'
import BillingPage from './features/billing/BillingPage'
import StaffManagementPage from './features/admin/StaffManagementPage'
import ClinicSettingsPage from './features/admin/ClinicSettingsPage'

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
              <Route path="/patients" element={<PatientsPage />} />
              <Route path="/patients/new" element={<PatientRegisterPage />} />
              <Route path="/patients/:id" element={<PatientProfilePage />} />
              <Route path="/patients/:id/edit" element={<PatientEditPage />} />
              <Route path="/charting" element={<ChartingPage />} />
              <Route path="/billing" element={<BillingPage />} />

              <Route element={<ProtectedRoute allow={['admin']} />}>
                <Route path="/admin/staff" element={<StaffManagementPage />} />
                <Route path="/admin/settings" element={<ClinicSettingsPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
