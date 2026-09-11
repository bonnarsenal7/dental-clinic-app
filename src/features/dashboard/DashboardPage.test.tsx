import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'
import type { DailySummary } from './types'
import type { MedicalHistory } from '../patients/types'

vi.mock('./api', () => ({ getDailySummary: vi.fn(), listTodaysPatients: vi.fn() }))

const role = { current: 'admin' as 'admin' | 'dentist' | 'receptionist' }
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Test User', role: role.current } }),
}))

const api = await import('./api')

function summary(partial: Partial<DailySummary> = {}): DailySummary {
  return {
    today: '2026-09-11',
    appointments_today: 7, in_clinic: 2, still_to_come: 4, completed_today: 1,
    no_shows_today: 0, cancelled_today: 0, longest_wait_minutes: 12,
    collected_today: 3000, collected_cash: 3000, collected_card: 0,
    collected_transfer: 0, collected_other: 0, produced_today: 3000,
    outstanding_total: 1900, patients_owing: 2,
    recalls_overdue: 3, recalls_due_soon: 1, new_patients_today: 0,
    ...partial,
  }
}

function medical(partial: Partial<MedicalHistory>): MedicalHistory {
  return {
    id: 'mh', patient_id: 'p1', under_physician_care: false, physician_name: null,
    physician_phone: null, hospitalized: false, hospitalized_reason: null, conditions: {},
    other_condition_details: null, allergic_to_food_or_drug: false, allergy_details: null,
    current_medications: false, medication_details: null, allergic_to_anesthesia: false,
    smokes: false, updated_at: '2026-01-01T00:00:00Z', ...partial,
  }
}

const renderPage = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>)

describe('DashboardPage', () => {
  beforeEach(() => {
    role.current = 'admin'
    vi.mocked(api.getDailySummary).mockResolvedValue(summary())
    vi.mocked(api.listTodaysPatients).mockResolvedValue([])
  })

  it('leads with the queue and the day', async () => {
    renderPage()
    expect(await screen.findByText(/in the clinic/i)).toBeInTheDocument()
    expect(screen.getByText(/longest wait 12 min/i)).toBeInTheDocument()
  })

  it('shows money as pesos, not raw numbers', async () => {
    renderPage()
    // The figure appears in more than one tile by design (collected, billed,
    // and the cash breakdown), so assert presence rather than uniqueness.
    expect(await screen.findAllByText(/₱3,000\.00/)).not.toHaveLength(0)
    expect(screen.getByText(/₱1,900\.00/)).toBeInTheDocument()
    expect(screen.getByText(/2 patients owing/i)).toBeInTheDocument()
  })

  // PostgREST hands back numeric columns as strings often enough that a
  // dashboard doing arithmetic on them would render "NaN" or "30001900".
  it('copes with numerics arriving as strings', async () => {
    vi.mocked(api.getDailySummary).mockResolvedValue(
      summary({ collected_today: '3000.00' as unknown as number, in_clinic: '2' as unknown as number }),
    )
    renderPage()
    expect(await screen.findAllByText(/₱3,000\.00/)).not.toHaveLength(0)
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    // "2" concatenated rather than coerced would read as a string elsewhere.
    expect(screen.getByText(/in the clinic/i)).toBeInTheDocument()
  })

  it('flags a critical allergy for a patient due in today', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a1', patient_id: 'p1', name: 'Ricardo Bautista',
        scheduled_at: '2026-09-11T07:30:00Z', status: 'booked', reason: 'Extraction',
        medical: medical({ allergic_to_anesthesia: true }),
      },
    ])
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/ricardo bautista/i)
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
  })

  it('flags a patient booked in with no medical history at all', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      { appointment_id: 'a2', patient_id: 'p2', name: 'Walk In', scheduled_at: '2026-09-11T09:00:00Z', status: 'booked', reason: null, medical: null },
    ])
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no medical history on file/i)
  })

  // Someone who cancelled isn't coming in, so warning about them is noise
  // that makes the real warnings easier to skip past.
  it('ignores cancelled and no-show patients when flagging', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      { appointment_id: 'a3', patient_id: 'p3', name: 'Cancelled Person', scheduled_at: '2026-09-11T09:00:00Z', status: 'cancelled', reason: null, medical: medical({ allergic_to_anesthesia: true }) },
      { appointment_id: 'a4', patient_id: 'p4', name: 'Absent Person', scheduled_at: '2026-09-11T10:00:00Z', status: 'no_show', reason: null, medical: null },
    ])
    renderPage()
    await screen.findByText(/in the clinic/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('what each role sees', () => {
    it('shows money to reception', async () => {
      role.current = 'receptionist'
      renderPage()
      expect(await screen.findByText(/collected today/i)).toBeInTheDocument()
    })

    // Reception runs the front desk, not the clinic's clinical judgement;
    // the alerts panel is for whoever is about to treat someone.
    it('keeps the clinical alert panel to dentist and admin', async () => {
      role.current = 'receptionist'
      vi.mocked(api.listTodaysPatients).mockResolvedValue([
        { appointment_id: 'a1', patient_id: 'p1', name: 'Ricardo Bautista', scheduled_at: '2026-09-11T07:30:00Z', status: 'booked', reason: null, medical: medical({ allergic_to_anesthesia: true }) },
      ])
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not show takings to the dentist', async () => {
      role.current = 'dentist'
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByText(/collected today/i)).not.toBeInTheDocument()
    })

    it('shows the dentist the clinical alerts', async () => {
      role.current = 'dentist'
      vi.mocked(api.listTodaysPatients).mockResolvedValue([
        { appointment_id: 'a1', patient_id: 'p1', name: 'Ricardo Bautista', scheduled_at: '2026-09-11T07:30:00Z', status: 'booked', reason: null, medical: medical({ allergic_to_anesthesia: true }) },
      ])
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent(/ricardo bautista/i)
    })
  })
})
