import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VisitTimeline from './VisitTimeline'

// Phase 6's exit criterion, as a test: "A simulated Wi-Fi drop mid-entry
// causes no crash and no lost data." The property it rests on is that
// reset() runs only after a successful await — so a rejected write leaves
// the form exactly as the dentist typed it.

vi.mock('../billing/api', () => ({
  listInvoices: vi.fn(),
  findDraftInvoice: vi.fn(async () => null),
  openDraftInvoice: vi.fn(),
  addDraftLine: vi.fn(),
  removeDraftLine: vi.fn(),
  listProcedures: vi.fn(async () => []),
}))
vi.mock('./api', () => ({
  listVisits: vi.fn(),
  addVisitWithNote: vi.fn(),
}))

const auth = vi.hoisted(() => ({ role: 'dentist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 'staff-1', name: 'Test Dentist', role: auth.role } }),
}))

const api = await import('./api')
const billing = await import('../billing/api')
const NOTE = 'Distal caries on 16, deep. Discussed options with patient.'

// VisitBilling links to the invoice, so the tree needs a router.
const renderTimeline = () =>
  render(
    <MemoryRouter>
      <VisitTimeline patientId="p1" />
    </MemoryRouter>,
  )

describe('VisitTimeline when the connection drops mid-entry', () => {
  beforeEach(() => {
    vi.mocked(api.listVisits).mockResolvedValue([])
    vi.mocked(billing.listInvoices).mockReset().mockResolvedValue([])
    vi.mocked(api.addVisitWithNote).mockReset()
    auth.role = 'dentist'
  })

  // The note form that used to live here is gone: the note is part of the
  // bill now (0016). Phase 6's exit criterion moved with it — the test that
  // a rejected write leaves the typed note on screen is in
  // ChairsideBilling.test.tsx, against the field that now holds it.

  // --- Billing moved here from the chart --------------------------------

  const aVisit = (over = {}) => ({
    id: 'v-1',
    patient_id: 'p-1',
    visit_date: new Date().toISOString(),
    staff_id: 's1',
    created_at: '2026-09-12T00:00:00Z',
    visit_notes: { notes: 'Composite filling 36.' },
    ...over,
  })

  const anInvoice = (over = {}) => ({
    id: 'inv-1',
    patient_id: 'p-1',
    visit_id: 'v-1',
    status: 'unpaid',
    total_amount: 1800,
    created_by: 's1',
    created_at: '2026-09-12T00:00:00Z',
    invoice_items: [
      {
        id: 'i-1',
        invoice_id: 'inv-1',
        description: 'Composite filling',
        amount: 1800,
        procedure_id: null,
        tooth_record_id: null,
        tooth_number: 36,
        created_at: '2026-09-12T00:00:00Z',
      },
    ],
    payments: [],
    ...over,
  })

  it('shows what a visit cost beside what was done at it', async () => {
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice()] as never)
    renderTimeline()
    expect(await screen.findByText(/billing for this visit/i)).toBeInTheDocument()
    expect(screen.getByText('Composite filling')).toBeInTheDocument()
    expect(screen.getByText(/awaiting payment/i)).toBeInTheDocument()
  })

  it('says so when a visit was never billed', async () => {
    vi.mocked(api.listVisits).mockResolvedValue([aVisit({ visit_date: '2020-01-01T00:00:00Z' })] as never)
    renderTimeline()
    expect(await screen.findByText(/nothing billed for this visit/i)).toBeInTheDocument()
  })

  // The clinical record must not disappear behind a billing failure — the
  // two were briefly fetched together, and one failed invoice query hid
  // every note the dentist had written.
  it('still shows the history when billing cannot be loaded', async () => {
    vi.mocked(api.listVisits).mockResolvedValue([aVisit({ visit_date: '2026-03-01T00:00:00Z' })] as never)
    vi.mocked(billing.listInvoices).mockRejectedValue(new Error('permission denied'))
    renderTimeline()
    expect(await screen.findByText('Composite filling 36.')).toBeInTheDocument()
  })

  // Reception may take money but never edits what was charged (0013).
  it('offers reception the payment action, not an editable bill', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice()] as never)
    renderTimeline()
    expect(await screen.findByRole('link', { name: /accept payment/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to bill/i })).not.toBeInTheDocument()
  })

  it('does not offer payment on a bill that is settled', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([
      anInvoice({ status: 'paid', payments: [{ id: 'p1', invoice_id: 'inv-1', amount: 1800 }] }),
    ] as never)
    renderTimeline()
    await screen.findByText(/billing for this visit/i)
    expect(screen.queryByRole('link', { name: /accept payment/i })).not.toBeInTheDocument()
    expect(screen.getByText(/paid/i)).toBeInTheDocument()
  })

  // A draft is the dentist's working total, not a bill anybody can be asked
  // to pay.
  it('tells reception a draft is not ready rather than showing a total', async () => {
    auth.role = 'receptionist'
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice({ status: 'draft' })] as never)
    renderTimeline()
    expect(await screen.findByText(/still adding to this visit/i)).toBeInTheDocument()
  })
})
