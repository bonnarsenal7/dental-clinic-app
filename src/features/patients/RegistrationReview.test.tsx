import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RegistrationReview from './RegistrationReview'
import { EMPTY_PATIENT_FORM } from './PatientForm'
import type { PatientRegistrationInput } from './types'

const renderReview = (overrides: Partial<PatientRegistrationInput> = {}) =>
  render(<RegistrationReview values={{ ...EMPTY_PATIENT_FORM, ...overrides }} />)

/** The row beneath a given label — the summary is label/value pairs, so a
 *  page-wide text lookup would match the wrong half. */
function value(label: string) {
  return screen.getByText(label).parentElement as HTMLElement
}

describe('RegistrationReview', () => {
  // This is what the patient reads before signing, so everything that will
  // be saved has to be on it — the category included.
  it('shows the patient type being registered', () => {
    renderReview({ name: 'Maria Clara Santos', patient_type: 'orthodontic' })
    expect(within(value('Patient type')).getByText('Orthodontic')).toBeInTheDocument()
  })

  it('says Regular for a regular patient', () => {
    renderReview({ name: 'Maria Clara Santos' })
    expect(within(value('Patient type')).getByText('Regular')).toBeInTheDocument()
  })

  it('shows the demographics that will be saved', () => {
    renderReview({ name: 'Maria Clara Santos', occupation: 'Teacher', cell_number: '0917 555 0142' })
    expect(within(value('Name')).getByText('Maria Clara Santos')).toBeInTheDocument()
    expect(within(value('Occupation')).getByText('Teacher')).toBeInTheDocument()
    expect(within(value('Cell number')).getByText('0917 555 0142')).toBeInTheDocument()
  })

  it('renders an unanswered field as a dash rather than blank', () => {
    renderReview({ name: 'Maria Clara Santos' })
    expect(within(value('Address')).getByText('—')).toBeInTheDocument()
  })

  // The checklists are the point of the intake form; the summary has to name
  // what was ticked, not just say "history recorded".
  it('names the conditions and habits that were ticked', () => {
    renderReview({
      conditions: { ...EMPTY_PATIENT_FORM.conditions, asthma: true, diabetes: true },
      oral_habits: { ...EMPTY_PATIENT_FORM.oral_habits, smoking: true },
    })
    expect(within(value('Conditions')).getByText(/asthma/i)).toBeInTheDocument()
    expect(within(value('Conditions')).getByText(/diabetes/i)).toBeInTheDocument()
  })

  it('says None reported rather than leaving a checklist blank', () => {
    renderReview({ name: 'Maria Clara Santos' })
    expect(within(value('Conditions')).getByText('None reported')).toBeInTheDocument()
    expect(within(value('Symptoms')).getByText('None reported')).toBeInTheDocument()
  })

  it('spells out an answer that carries a detail', () => {
    renderReview({ allergic_to_food_or_drug: true, allergy_details: 'Penicillin' })
    expect(within(value('Allergic to food/drug')).getByText(/yes — penicillin/i)).toBeInTheDocument()
  })

  it('says so when a detail was left out', () => {
    renderReview({ hospitalized: true })
    expect(within(value('Hospitalized')).getByText(/reason not given/i)).toBeInTheDocument()
  })

  // Optional rows stay off the summary entirely when there is nothing to say.
  it('leaves out remarks when there are none', () => {
    renderReview({ name: 'Maria Clara Santos' })
    expect(screen.queryByText('Remarks')).not.toBeInTheDocument()
  })
})
