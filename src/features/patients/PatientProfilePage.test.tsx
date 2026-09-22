import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffRole } from '../auth/types'

const auth = vi.hoisted(() => ({ role: 'dentist' as StaffRole }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's-1', name: 'Dr Cruz', role: auth.role } }),
}))
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useParams: () => ({ id: 'p-1' }),
}))

const logPatientView = vi.fn()
vi.mock('../../core/auditView', () => ({ logPatientView }))

vi.mock('./api', () => ({
  getPatient: vi.fn(),
  getMedicalHistory: vi.fn(),
  getDentalHistory: vi.fn(),
  listConsents: vi.fn(),
}))
vi.mock('./ConsentCapture', () => ({ default: () => <p>signature pad</p> }))
vi.mock('../scheduling/PatientScheduling', () => ({ default: () => <p>scheduling panel</p> }))
vi.mock('./VisitTimeline', () => ({ default: () => <p>visit timeline</p> }))
vi.mock('./FileAttachments', () => ({ default: () => <p>attachments</p> }))
vi.mock('./PatientSummary', () => ({ default: () => <p>patient summary</p> }))

const api = await import('./api')
const PatientProfilePage = (await import('./PatientProfilePage')).default

const PATIENT = {
  id: 'p-1',
  name: 'Maria Clara Santos',
  cell_number: '0917 555 0142',
  phone_number: null,
  address: '12 Mabini St',
  birthday: '1992-03-04',
  age: 34,
  sex: 'F',
  height: null,
  weight: null,
  occupation: 'Teacher',
  spouse: null,
  remarks: null,
}

function renderPage(role: StaffRole = 'dentist') {
  auth.role = role
  return render(
    <MemoryRouter>
      <PatientProfilePage />
    </MemoryRouter>,
  )
}

describe('PatientProfilePage', () => {
  beforeEach(() => {
    logPatientView.mockClear()
    vi.mocked(api.getPatient).mockResolvedValue(PATIENT as never)
    vi.mocked(api.getMedicalHistory).mockResolvedValue(null)
    vi.mocked(api.getDentalHistory).mockResolvedValue(null)
    vi.mocked(api.listConsents).mockResolvedValue([])
  })

  it('shows the patient and their contact number', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: /maria clara santos/i })).toBeInTheDocument()
    // Once, in the header. The Cell field is inside Patient details, which
    // is folded away until somebody asks for it.
    expect(screen.getAllByText('0917 555 0142')).toHaveLength(1)
  })

  // Ten intake fields sat between the name and the clinical record. They are
  // read when somebody needs an address, which is not most visits.
  it('folds the intake fields away, and opens them on request', async () => {
    renderPage()
    const toggle = await screen.findByRole('button', { name: /patient details/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/12 Mabini St/)).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/12 Mabini St/)).toBeInTheDocument()
  })

  // Deleting the banner from the chart page once passed the whole suite —
  // the component was covered, its wiring was not. Same test, new screen.
  it('warns about the patient before anything else on the screen', async () => {
    vi.mocked(api.getMedicalHistory).mockResolvedValue({
      conditions: {},
      allergic_to_anesthesia: true,
    } as never)
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
    const details = screen.getByRole('button', { name: /patient details/i })
    expect(alert.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says a clear history was reviewed rather than showing no banner', async () => {
    vi.mocked(api.getMedicalHistory).mockResolvedValue({ conditions: {} } as never)
    renderPage()
    expect(await screen.findByText(/no medical alerts/i)).toBeInTheDocument()
  })

  // The category beside the name. Only an admin can change it, on Edit —
  // the profile just says which it is.
  it('badges an orthodontic patient as such', async () => {
    vi.mocked(api.getPatient).mockResolvedValue({ ...PATIENT, patient_type: 'orthodontic' } as never)
    renderPage()
    const heading = await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(within(heading.parentElement as HTMLElement).getByText('Orthodontic')).toBeInTheDocument()
  })

  it('badges a patient with no type recorded as regular, rather than blank', async () => {
    renderPage()
    const heading = await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(within(heading.parentElement as HTMLElement).getByText('Regular')).toBeInTheDocument()
  })

  // PostgreSQL has no SELECT trigger, so opening a record is the one audit
  // entry the client is responsible for. Losing it loses half the trail.
  it('records that the record was opened', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(logPatientView).toHaveBeenCalledWith('p-1', 's-1', 'patients')
  })

  // The chart and the ledger are tabs above this screen now
  // (AssignedPatientRoute), so repeating them here would be two ways to the
  // same place, one of which a role sometimes may not use. Editing stays: it
  // is an action on this screen, not a tab.
  it('leaves the chart and the ledger to the tabs, keeping Edit here', async () => {
    renderPage('dentist')
    await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(screen.getByRole('link', { name: /edit demographics/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dental chart/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^billing$/i })).not.toBeInTheDocument()
  })

  // "None reported" and a blank line mean different things to a clinician.
  it('says history was taken and found clear, rather than showing nothing', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(screen.getAllByText(/none reported/i).length).toBeGreaterThan(0)
  })

  it('names the reported conditions', async () => {
    vi.mocked(api.getMedicalHistory).mockResolvedValue({
      conditions: { asthma: true },
      allergic_to_anesthesia: true,
    } as never)
    renderPage()
    // Scoped to the history section: a flagged condition now also appears in
    // the alert banner above, which is the point of the banner.
    const history = (await screen.findByRole('heading', { name: /medical history/i }))
      .parentElement as HTMLElement
    expect(within(history).getByText(/asthma/i)).toBeInTheDocument()
    expect(within(history).getByText(/allergic reaction to anesthesia/i)).toBeInTheDocument()
  })

  // An allergy recorded as "yes" with no detail must not read as no allergy.
  it('marks an unspecified allergy as unspecified, not absent', async () => {
    vi.mocked(api.getMedicalHistory).mockResolvedValue({
      conditions: {},
      allergic_to_food_or_drug: true,
      allergy_details: null,
    } as never)
    renderPage()
    expect(await screen.findByText(/\(unspecified\)/i)).toBeInTheDocument()
  })

  // Consent is a log of signing events, not a flag — the paper form is
  // re-signed across visits.
  it('lists every signature with the wording version it was given against', async () => {
    vi.mocked(api.listConsents).mockResolvedValue([
      { id: 'c-1', signed_at: '2026-09-01T02:00:00Z', consent_text_version: 'v2-draft' },
    ] as never)
    renderPage()
    expect(await screen.findByText(/version v2-draft/i)).toBeInTheDocument()
  })

  it('says plainly when no consent has been signed yet', async () => {
    renderPage()
    expect(await screen.findByText(/no signed consent on file yet/i)).toBeInTheDocument()
  })

  it('opens the signature pad to re-confirm consent', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(screen.queryByText('signature pad')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /re-confirm consent/i }))
    expect(await screen.findByText('signature pad')).toBeInTheDocument()
  })

  it('shows a failure rather than an empty profile', async () => {
    vi.mocked(api.getPatient).mockRejectedValue(new Error('permission denied'))
    renderPage()
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
  })

  it('brings the scheduling, visit and attachment panels with it', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /maria clara santos/i })
    expect(screen.getByText('scheduling panel')).toBeInTheDocument()
    expect(screen.getByText('visit timeline')).toBeInTheDocument()
    expect(screen.getByText('attachments')).toBeInTheDocument()
  })

  it('says when there is no contact number rather than leaving a gap', async () => {
    vi.mocked(api.getPatient).mockResolvedValue({
      ...PATIENT,
      cell_number: null,
      phone_number: null,
    } as never)
    renderPage()
    await waitFor(() => expect(screen.getByText(/no contact number on file/i)).toBeInTheDocument())
  })
})
