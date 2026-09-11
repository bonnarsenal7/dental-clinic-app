import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MedicalAlerts, { collectAlerts } from './MedicalAlerts'
import type { MedicalHistory } from './types'

function history(partial: Partial<MedicalHistory> = {}): MedicalHistory {
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

describe('MedicalAlerts', () => {
  // The reason this component exists: a dentist about to inject must not
  // have to go looking for this.
  it('leads with an anaesthesia allergy', () => {
    render(<MedicalAlerts medical={history({ allergic_to_anesthesia: true })} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/medical alert/i)
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
  })

  it('names the drug someone is allergic to', () => {
    render(<MedicalAlerts medical={history({ allergic_to_food_or_drug: true, allergy_details: 'Penicillin' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/penicillin/i)
  })

  // "Allergic: yes" with no detail is more dangerous than no record at all,
  // because it looks answered. Say what's missing.
  it('says to ask when an allergy has no detail', () => {
    render(<MedicalAlerts medical={history({ allergic_to_food_or_drug: true })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/ask the patient/i)
  })

  it('explains why a condition matters, not just its name', () => {
    render(<MedicalAlerts medical={history({ conditions: { excessive_bleeding: true } })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/bleeding risk/i)
  })

  it('ranks critical conditions above merely notable ones', () => {
    const alerts = collectAlerts(
      history({ conditions: { diabetes: true, epilepsy: true }, current_medications: true }),
    )
    expect(alerts[0].severity).toBe('critical')
    expect(alerts.at(-1)?.severity).toBe('notable')
  })

  it('flags medications, since anticoagulants change the plan', () => {
    render(<MedicalAlerts medical={history({ current_medications: true, medication_details: 'Clopidogrel' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/clopidogrel/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/anticoagulant/i)
  })

  it('ignores conditions with no bearing on dental treatment', () => {
    expect(collectAlerts(history({ conditions: { back_problems: true, ulcers: true } }))).toHaveLength(0)
  })

  // A missing banner is ambiguous — "nothing to worry about" or "it never
  // loaded"? Both empty cases say which, explicitly.
  it('states that a clear history was actually reviewed', () => {
    render(<MedicalAlerts medical={history()} />)
    expect(screen.getByText(/no medical alerts/i)).toBeInTheDocument()
    expect(screen.getByText(/history reviewed/i)).toBeInTheDocument()
  })

  it('warns when there is no history at all, rather than showing nothing', () => {
    render(<MedicalAlerts medical={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no medical history on file/i)
  })

  it('does not claim anything while still loading', () => {
    render(<MedicalAlerts medical={null} loading />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/checking medical history/i)).toBeInTheDocument()
  })

  // Ricardo Bautista, from scripts/seed-pilot-patients.sql — the patient
  // the pilot's scripted day puts in front of a dentist.
  it('surfaces every alert for the seeded high-risk patient', () => {
    render(
      <MedicalAlerts
        medical={history({
          allergic_to_anesthesia: true,
          under_physician_care: true,
          physician_name: 'Dr. E. Mendoza',
          conditions: { high_blood_pressure: true, angina: true },
          current_medications: true,
          medication_details: 'Amlodipine, Aspirin 80mg',
        })}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
    expect(alert).toHaveTextContent(/angina/i)
    expect(alert).toHaveTextContent(/high blood pressure/i)
    expect(alert).toHaveTextContent(/aspirin/i)
    expect(alert).toHaveTextContent(/dr\. e\. mendoza/i)
  })
})
