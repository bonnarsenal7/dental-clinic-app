import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './core/components/ErrorBoundary'
import { initErrorReporting } from './core/sentry'
import { isIntakeHost } from './core/intakeHost'

// The patient intake address serves only the intake screen — no router, no
// login. Loaded on demand, so staff never download it.
const IntakeApp = lazy(() => import('./features/patients/intake/IntakeApp'))

// Before render, so a crash during the first paint is still reported.
initErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isIntakeHost() ? (
        <Suspense fallback={null}>
          <IntakeApp />
        </Suspense>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
