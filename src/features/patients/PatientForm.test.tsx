import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PatientForm, { EMPTY_PATIENT_FORM } from './PatientForm'
import { DENTAL_SYMPTOMS, MEDICAL_CONDITIONS, ORAL_HABITS } from './historyOptions'

const renderForm = (overrides = {}, onSubmit = vi.fn()) => {
  render(
    <PatientForm
      defaultValues={{ ...EMPTY_PATIENT_FORM, ...overrides }}
      onSubmit={onSubmit}
      submitLabel="Register patient"
    />,
  )
  return onSubmit
}

describe('PatientForm', () => {
  it('asks for a name and says so when it is missing', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.click(screen.getByRole('button', { name: /register patient/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  /** The checklist group under a given prompt — needed because both the
   *  conditions list and the oral-habits list end in an option labelled
   *  "Other", so a page-wide lookup is ambiguous. */
  function group(prompt: RegExp) {
    const heading = screen.getByText(prompt)
    return within(heading.parentElement as HTMLElement)
  }

  // The whole point of the intake form is that history is a checklist, not
  // a free-text box — so every option on the paper form must be on screen,
  // in the right section.
  it('renders every condition, symptom and habit from the vocabulary', () => {
    renderForm()
    const conditions = group(/conditions \(check any that apply\)/i)
    for (const c of MEDICAL_CONDITIONS) {
      expect(conditions.getByLabelText(c.label)).toBeInTheDocument()
    }
    const symptoms = group(/symptoms \(check any that apply\)/i)
    for (const s of DENTAL_SYMPTOMS) {
      expect(symptoms.getByLabelText(s.label)).toBeInTheDocument()
    }
    const habits = group(/oral habits \(check any that apply\)/i)
    for (const h of ORAL_HABITS) {
      expect(habits.getByLabelText(h.label)).toBeInTheDocument()
    }
  })

  // "Other" exists in both lists and maps to different fields. Ticking the
  // wrong one would file a habit as a medical condition.
  it('keeps the two "Other" checkboxes on separate fields', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText(/full name/i), 'Test Patient')
    await user.click(group(/oral habits \(check any that apply\)/i).getByLabelText('Other'))
    await user.click(screen.getByRole('button', { name: /register patient/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const values = onSubmit.mock.calls[0][0]
    expect(values.oral_habits.other).toBe(true)
    expect(values.conditions.other).toBe(false)
  })

  it('submits the checked conditions as a map, not a list', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()
    await user.type(screen.getByLabelText(/full name/i), 'Maria Clara Santos')
    await user.click(screen.getByLabelText('Diabetes'))
    await user.click(screen.getByLabelText('Asthma'))
    await user.click(screen.getByRole('button', { name: /register patient/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const values = onSubmit.mock.calls[0][0]
    expect(values.name).toBe('Maria Clara Santos')
    expect(values.conditions).toMatchObject({ diabetes: true, asthma: true, angina: false })
  })

  // Asking for a physician's name before anyone says there is one is the
  // kind of clutter that slows a receptionist down forty times a day.
  it('only asks for physician details once care is declared', async () => {
    const user = userEvent.setup()
    renderForm()
    expect(screen.queryByLabelText(/physician name/i)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText(/under a physician's care/i))
    expect(screen.getByLabelText(/physician name/i)).toBeInTheDocument()
  })

  it.each([
    ['Has been hospitalized', /^reason$/i],
    ['Allergic to food or drug', /^specify$/i],
    ['Currently taking medication', /^specify$/i],
  ])('reveals the follow-up for "%s"', async (checkbox, followUp) => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByLabelText(checkbox))
    expect(screen.getAllByLabelText(followUp).length).toBeGreaterThan(0)
  })

  // Editing must show what is already on file, or staff will retype it.
  it('shows existing values when editing', () => {
    renderForm({
      name: 'Ricardo Bautista',
      occupation: 'Retired',
      allergic_to_anesthesia: true,
      conditions: { ...EMPTY_PATIENT_FORM.conditions, angina: true },
    })
    expect(screen.getByLabelText(/full name/i)).toHaveValue('Ricardo Bautista')
    expect(screen.getByLabelText(/occupation/i)).toHaveValue('Retired')
    expect(screen.getByLabelText(/allergic reaction to anesthesia/i)).toBeChecked()
    expect(screen.getByLabelText('Angina')).toBeChecked()
    expect(screen.getByLabelText('Diabetes')).not.toBeChecked()
  })

  it('keeps what was typed when validation fails', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText(/occupation/i), 'Nurse')
    await user.click(screen.getByRole('button', { name: /register patient/i }))
    await screen.findByText(/name is required/i)
    expect(screen.getByLabelText(/occupation/i)).toHaveValue('Nurse')
  })

  it('uses the caller\'s submit label', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /register patient/i })).toBeInTheDocument()
  })
})
