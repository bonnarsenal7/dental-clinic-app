import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PatientChartPage from './PatientChartPage'
import type { MedicalHistory } from '../patients/types'

// The MedicalAlerts component is tested on its own. What this file protects
// is that it is actually ON the chart screen — the thing that makes it a
// safety feature rather than a component in a folder. Deleting the banner
// from this page passed every other test in the suite.

vi.mock('./api', () => ({
  listToothRecords: vi.fn().mockResolvedValue([]),
  listChartVisits: vi.fn().mockResolvedValue([]),
  createVisitToday: vi.fn(),
  saveToothMarks: vi.fn(),
}))

vi.mock('../patients/api', () => ({
  getPatient: vi.fn(),
  getMedicalHistory: vi.fn(),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 'staff-1', name: 'Test Dentist', role: 'dentist' } }),
}))

vi.mock('../../core/auditView', () => ({ logPatientView: vi.fn() }))
vi.mock('../../core/components/ui/toast', () => ({ toastSaved: vi.fn() }))

const patientsApi = await import('../patients/api')

function medical(partial: Partial<MedicalHistory>): MedicalHistory {
  return {
    id: 'mh-1',
    patient_id: 'p-1',
    under_physician_care: false,
    physician_name: null,
    physician_phone: null,
    hospitalized: false,
    hospitalized_reason: null,
    conditions: {},
    other_condition_details: null,
    allergic_to_food_or_drug: false,
    allergy_details: null,
    current_medications: false,
    medication_details: null,
    allergic_to_anesthesia: false,
    smokes: false,
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function renderChart() {
  return render(
    <MemoryRouter initialEntries={['/patients/p-1/chart']}>
      <Routes>
        <Route path="/patients/:id/chart" element={<PatientChartPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PatientChartPage medical alerts', () => {
  beforeEach(() => {
    vi.mocked(patientsApi.getPatient).mockResolvedValue({
      id: 'p-1',
      name: 'Ricardo Bautista',
    } as never)
  })

  it('shows the allergy before the dentist can chart anything', async () => {
    vi.mocked(patientsApi.getMedicalHistory).mockResolvedValue(
      medical({ allergic_to_anesthesia: true, conditions: { angina: true } }),
    )
    renderChart()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
    expect(alert).toHaveTextContent(/angina/i)
  })

  it('says the history was reviewed when the patient is clear', async () => {
    vi.mocked(patientsApi.getMedicalHistory).mockResolvedValue(medical({}))
    renderChart()
    expect(await screen.findByText(/no medical alerts/i)).toBeInTheDocument()
  })

  it('warns when the patient has no medical history at all', async () => {
    vi.mocked(patientsApi.getMedicalHistory).mockResolvedValue(null)
    renderChart()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no medical history on file/i)
  })
})
