import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentQueue from './PaymentQueue'
import type { PaymentQueueEntry } from './paymentQueueState'

vi.mock('../scheduling/api', () => ({ checkOutWithoutCharge: vi.fn() }))
const scheduling = await import('../scheduling/api')

function entry(over: Partial<PaymentQueueEntry> = {}): PaymentQueueEntry {
  return {
    appointmentId: 'a-1',
    patientId: 'p-1',
    patientName: 'Maria Clara Santos',
    treatment: 'Composite filling',
    scheduledAt: new Date().toISOString(),
    state: 'awaiting',
    invoiceId: 'inv-1',
    balance: 1800,
    carriedOver: false,
    ...over,
  }
}

const renderQueue = (entries: PaymentQueueEntry[], onChanged = vi.fn()) => {
  render(
    <MemoryRouter>
      <PaymentQueue entries={entries} onChanged={onChanged} />
    </MemoryRouter>,
  )
  return onChanged
}

describe('PaymentQueue', () => {
  beforeEach(() => {
    vi.mocked(scheduling.checkOutWithoutCharge).mockReset().mockResolvedValue(undefined)
  })

  it('takes reception straight to that visit’s invoice', () => {
    renderQueue([entry()])
    const link = screen.getByRole('link', { name: /maria clara santos/i })
    expect(link).toHaveAttribute('href', '/invoices/inv-1')
    expect(link).toHaveTextContent('₱1,800.00 to pay')
  })

  it('counts who is still waiting', () => {
    renderQueue([entry(), entry({ appointmentId: 'a-2', state: 'paid', balance: 0 })])
    expect(screen.getByText('1 waiting')).toBeInTheDocument()
  })

  // Greyed and kept, not removed.
  it('greys a paid entry and keeps it on the list, marked Paid', () => {
    renderQueue([entry({ state: 'paid', balance: 0 })])
    const row = screen.getByRole('link', { name: /maria clara santos/i })
    expect(row).toHaveAttribute('data-state', 'paid')
    expect(row).toHaveTextContent(/paid/i)
    expect(row.className).toContain('bg-slate-50')
  })

  it('says which day a carried-over entry is from', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    renderQueue([entry({ carriedOver: true, scheduledAt: yesterday.toISOString() })])
    const weekday = yesterday.toLocaleDateString([], { weekday: 'short' })
    expect(screen.getByRole('link', { name: /maria/i })).toHaveTextContent(weekday)
  })

  it('shows money still owed after a checkout in red, not grey', () => {
    renderQueue([entry({ state: 'owing', balance: 1300 })])
    const row = screen.getByRole('link', { name: /maria/i })
    expect(row).toHaveTextContent('₱1,300.00 unpaid')
    expect(row.className).not.toContain('bg-slate-50')
  })

  describe('nothing billed', () => {
    it('offers checkout instead of an invoice that does not exist', () => {
      renderQueue([entry({ invoiceId: null, balance: null })])
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText(/nothing billed/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /check out/i })).toBeInTheDocument()
    })

    it('checks the patient out after confirming, then refreshes', async () => {
      const user = userEvent.setup()
      const onChanged = renderQueue([entry({ invoiceId: null, balance: null })])
      await user.click(screen.getByRole('button', { name: /check out/i }))
      expect(scheduling.checkOutWithoutCharge).not.toHaveBeenCalled()
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /check out/i }))
      await waitFor(() => expect(scheduling.checkOutWithoutCharge).toHaveBeenCalledWith('a-1'))
      expect(onChanged).toHaveBeenCalled()
    })

    it('greys a no-charge checkout', () => {
      renderQueue([entry({ state: 'no_charge', invoiceId: null, balance: null })])
      expect(screen.getByText(/no charge/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /check out/i })).not.toBeInTheDocument()
    })
  })

  it('says so when nothing has been finished yet today', () => {
    renderQueue([])
    expect(screen.getByText(/no finished treatments yet today/i)).toBeInTheDocument()
  })
})
