import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VisitTimeline from './VisitTimeline'

// Phase 6's exit criterion — a rejected write leaves the typed note on
// screen — lives in ChairsideBilling.test.tsx, against the field that holds
// the note. This file covers how the profile puts the current visit and the
// history together.

vi.mock('../billing/api', () => ({
  listInvoices: vi.fn(),
  findDraftInvoice: vi.fn(async () => null),
  openDraftInvoice: vi.fn(),
  addDraftLine: vi.fn(),
  removeDraftLine: vi.fn(),
  listProcedures: vi.fn(async () => []),
  getVisitNote: vi.fn(async () => null),
  saveVisitNote: vi.fn(),
}))
vi.mock('./api', () => ({
  listVisits: vi.fn(),
}))
vi.mock('../scheduling/api', () => ({
  findInChairAppointmentForVisit: vi.fn(async () => null),
  finishTreatment: vi.fn(),
  setAppointmentStatus: vi.fn(),
}))

const auth = vi.hoisted(() => ({ role: 'dentist' as 'receptionist' | 'dentist' | 'admin' }))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 'staff-1', name: 'Test Dentist', role: auth.role } }),
}))

const api = await import('./api')
const billing = await import('../billing/api')
const scheduling = await import('../scheduling/api')

const renderTimeline = () =>
  render(
    <MemoryRouter>
      <VisitTimeline patientId="p1" />
    </MemoryRouter>,
  )

const aVisit = (over = {}) => ({
  id: 'v-1',
  patient_id: 'p-1',
  visit_date: '2026-03-01T00:00:00Z',
  staff_id: 's1',
  created_at: '2026-03-01T00:00:00Z',
  visit_notes: { notes: 'Composite filling 36.' },
  ...over,
})

const anInvoice = (over = {}) => ({
  id: 'inv-1',
  patient_id: 'p-1',
  visit_id: 'v-1',
  status: 'partial',
  total_amount: 1800,
  commission_amount: 0,
  created_by: 's1',
  created_at: '2026-03-01T00:00:00Z',
  invoice_items: [
    {
      id: 'i-1',
      invoice_id: 'inv-1',
      description: 'Composite filling',
      amount: 1800,
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: 36,
      created_at: '2026-03-01T00:00:00Z',
    },
  ],
  payments: [{ id: 'pm-1', invoice_id: 'inv-1', amount: 500 }],
  ...over,
})

describe('VisitTimeline', () => {
  beforeEach(() => {
    auth.role = 'dentist'
    vi.mocked(api.listVisits).mockReset().mockResolvedValue([])
    vi.mocked(billing.listInvoices).mockReset().mockResolvedValue([])
    vi.mocked(scheduling.findInChairAppointmentForVisit).mockReset().mockResolvedValue(null)
  })

  it('lists every visit in the Visit History table with what it came to', async () => {
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice()] as never)
    renderTimeline()
    expect(await screen.findByRole('heading', { name: 'Visit History' })).toBeInTheDocument()
    const cells = (await screen.findAllByRole('row'))[1].querySelectorAll('td')
    expect(cells[1]).toHaveTextContent('Composite filling (tooth 36)')
    expect(cells[2]).toHaveTextContent('₱1,800.00')
    expect(cells[3]).toHaveTextContent('₱500.00')
    expect(cells[4]).toHaveTextContent('₱1,300.00')
  })

  // The clinical record must not disappear behind a billing failure — the
  // two were briefly fetched together, and one failed invoice query hid
  // every note the dentist had written.
  it('still lists the visits, and their notes, when billing cannot be loaded', async () => {
    const user = userEvent.setup()
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockRejectedValue(new Error('permission denied'))
    renderTimeline()
    expect(await screen.findByText(/amounts could not be loaded/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.getByText('Composite filling 36.')).toBeInTheDocument()
  })

  describe("today's visit", () => {
    const today = () => aVisit({ visit_date: new Date().toISOString() })

    it('gives the dentist the chairside panel above the history', async () => {
      vi.mocked(api.listVisits).mockResolvedValue([today()] as never)
      renderTimeline()
      const add = await screen.findByRole('button', { name: /add to bill/i })
      const history = screen.getByRole('heading', { name: 'Visit History' })
      expect(add.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('puts Finish treatment directly beside Add to bill', async () => {
      vi.mocked(api.listVisits).mockResolvedValue([today()] as never)
      vi.mocked(scheduling.findInChairAppointmentForVisit).mockResolvedValue({
        id: 'a-1',
        status: 'in_chair',
      } as never)
      renderTimeline()
      const finish = await screen.findByRole('button', { name: /finish treatment/i })
      const add = screen.getByRole('button', { name: /add to bill/i })
      expect(add.nextElementSibling).toBe(finish)
    })

    // Reception may take money but never edits what was charged (0013).
    it('gives reception no line entry', async () => {
      auth.role = 'receptionist'
      vi.mocked(api.listVisits).mockResolvedValue([today()] as never)
      renderTimeline()
      await screen.findByRole('heading', { name: 'Visit History' })
      await screen.findAllByRole('row')
      expect(screen.queryByRole('button', { name: /add to bill/i })).not.toBeInTheDocument()
    })

    it('closes the panel once the visit has been billed and locked', async () => {
      vi.mocked(api.listVisits).mockResolvedValue([today()] as never)
      vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice({ status: 'unpaid' })] as never)
      renderTimeline()
      await screen.findAllByRole('row')
      expect(screen.queryByRole('button', { name: /add to bill/i })).not.toBeInTheDocument()
    })

    // The panel reports its total through a callback that refreshes this
    // component. A callback recreated each render refreshed on every render.
    it('does not refetch in a loop while the panel is open', async () => {
      // A fresh array per call, as a real fetch returns. mockResolvedValue
      // hands back one shared array, React skips a state update to an
      // identical value, and the loop never starts — this test passed with
      // the inline callback reinstated until it did this.
      vi.mocked(api.listVisits).mockImplementation(async () => [today()] as never)
      vi.mocked(billing.listInvoices).mockImplementation(async () => [])
      renderTimeline()
      await screen.findByRole('button', { name: /add to bill/i })
      await new Promise((r) => setTimeout(r, 200))
      const settled = vi.mocked(api.listVisits).mock.calls.length
      await new Promise((r) => setTimeout(r, 300))
      expect(vi.mocked(api.listVisits).mock.calls.length).toBe(settled)
      expect(settled).toBeLessThanOrEqual(3)
    })
  })

  it('offers reception payment from the history on a visit still owing', async () => {
    const user = userEvent.setup()
    auth.role = 'receptionist'
    vi.mocked(api.listVisits).mockResolvedValue([aVisit()] as never)
    vi.mocked(billing.listInvoices).mockResolvedValue([anInvoice()] as never)
    renderTimeline()
    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getByText('₱1,300.00')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.getByRole('link', { name: /accept payment/i })).toBeInTheDocument()
  })
})
