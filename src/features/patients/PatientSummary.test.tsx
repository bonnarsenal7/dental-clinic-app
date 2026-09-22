import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PatientSummary, { ageOf } from './PatientSummary'
import type { Patient } from './types'
import { anAppointment } from '../../test/fixtures'

vi.mock('../billing/api', () => ({ listInvoices: vi.fn(), listPatientVisits: vi.fn() }))
vi.mock('../scheduling/api', () => ({ listPatientAppointments: vi.fn() }))

const billing = await import('../billing/api')
const scheduling = await import('../scheduling/api')

const PATIENT = {
  id: 'p-1',
  name: 'Maria Clara Santos',
  birthday: '1992-03-04',
  age: 30,
} as Patient

// The balance is derived from the lines and the payments, not from
// total_amount — that column is the database's own copy.
const invoice = (charged: number, paid: number) =>
  ({
    id: 'inv-1',
    status: 'partial',
    total_amount: charged,
    invoice_items: [{ id: 'li-1', amount: charged }],
    payments: paid ? [{ id: 'pm-1', amount: paid }] : [],
  }) as never

/** The same formatter the strip uses, so the assertion does not depend on
 *  the runner's locale. */
const shown = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

const renderStrip = (patient: Patient = PATIENT) =>
  render(
    <MemoryRouter>
      <PatientSummary patient={patient} />
    </MemoryRouter>,
  )

describe('PatientSummary', () => {
  beforeEach(() => {
    vi.mocked(billing.listInvoices).mockReset().mockResolvedValue([])
    vi.mocked(billing.listPatientVisits).mockReset().mockResolvedValue([])
    vi.mocked(scheduling.listPatientAppointments).mockReset().mockResolvedValue([])
  })

  // The stored age was true the day somebody typed it.
  describe('age', () => {
    it('is worked out from the birthday, not read off the record', () => {
      expect(ageOf({ birthday: '1992-03-04', age: 30 }, new Date(2026, 8, 22))).toBe(34)
    })

    it('has not had a birthday yet this year', () => {
      expect(ageOf({ birthday: '1992-12-31', age: 30 }, new Date(2026, 8, 22))).toBe(33)
    })

    it('falls back to the recorded age when there is no birthday', () => {
      expect(ageOf({ birthday: null, age: 30 })).toBe(30)
    })
  })

  it('shows what is owed, and links to the ledger', async () => {
    vi.mocked(billing.listInvoices).mockResolvedValue([invoice(3000, 1000)])
    renderStrip()
    const balance = await screen.findByRole('link', { name: /2,000/ })
    expect(balance).toHaveAttribute('href', '/patients/p-1/billing')
  })

  it('shows the soonest booking still to come, not the newest row', async () => {
    vi.mocked(scheduling.listPatientAppointments).mockResolvedValue([
      // Newest first, as the query returns them.
      anAppointment({ id: 'a-3', scheduled_at: '2027-01-20T02:00:00Z', status: 'booked' }),
      anAppointment({ id: 'a-2', scheduled_at: '2026-12-01T02:00:00Z', status: 'booked' }),
      anAppointment({ id: 'a-1', scheduled_at: '2020-01-01T02:00:00Z', status: 'completed' }),
    ])
    renderStrip()
    expect(await screen.findByText(shown('2026-12-01T02:00:00Z'))).toBeInTheDocument()
    expect(screen.queryByText(shown('2027-01-20T02:00:00Z'))).not.toBeInTheDocument()
  })

  it('ignores a booking that was called off', async () => {
    vi.mocked(scheduling.listPatientAppointments).mockResolvedValue([
      anAppointment({ id: 'a-1', scheduled_at: '2026-12-01T02:00:00Z', status: 'cancelled' }),
    ])
    renderStrip()
    expect(await screen.findByText(/none booked/i)).toBeInTheDocument()
  })

  it('says first visit rather than leaving the last visit blank', async () => {
    renderStrip()
    expect(await screen.findByText(/first visit/i)).toBeInTheDocument()
  })

  it('shows the last visit when there is one', async () => {
    vi.mocked(billing.listPatientVisits).mockResolvedValue([
      { id: 'v-1', visit_date: '2026-09-01' },
      { id: 'v-2', visit_date: '2026-06-01' },
    ])
    renderStrip()
    expect(await screen.findByText(shown('2026-09-01T00:00:00'))).toBeInTheDocument()
  })

  // Three separate queries: one failing must cost its own figure, not the
  // strip and not the profile behind it.
  it('keeps the figures it has when one query fails', async () => {
    vi.mocked(billing.listInvoices).mockRejectedValue(new Error('Failed to fetch'))
    vi.mocked(billing.listPatientVisits).mockResolvedValue([{ id: 'v-1', visit_date: '2026-09-01' }])
    renderStrip()
    expect(await screen.findByText(shown('2026-09-01T00:00:00'))).toBeInTheDocument()
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument()
  })
})
