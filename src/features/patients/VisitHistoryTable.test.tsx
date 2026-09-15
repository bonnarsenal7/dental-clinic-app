import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import VisitHistoryTable from './VisitHistoryTable'
import type { VisitHistoryRow } from '../billing/visitHistory'

function row(n: number, over: Partial<VisitHistoryRow> = {}): VisitHistoryRow {
  // n = 1 is the newest; rows arrive already sorted newest first.
  const d = new Date(2026, 8, 30 - n)
  return {
    visitId: `v-${n}`,
    visitDate: d.toISOString(),
    treatment: `Procedure ${n}`,
    amount: 1000,
    paid: 400,
    balance: 600,
    invoiceId: `inv-${n}`,
    invoiceStatus: 'partial',
    note: `Note ${n}`,
    ...over,
  }
}

const rows = (count: number) => Array.from({ length: count }, (_, i) => row(i + 1))

const renderTable = (r: VisitHistoryRow[], canTakePayment = false) =>
  render(
    <MemoryRouter>
      <VisitHistoryTable rows={r} canTakePayment={canTakePayment} />
    </MemoryRouter>,
  )

/** The treatment cell of every visit row on screen, in order. */
const treatments = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((tr) => tr.querySelectorAll('td')[1]?.textContent)
    .filter((t): t is string => !!t && t.startsWith('Procedure'))

describe('VisitHistoryTable', () => {
  it('has the five columns, in order', () => {
    renderTable(rows(1))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Date',
      'Treatment/Procedure',
      'Amount',
      'Paid',
      'Balance',
    ])
  })

  it('shows what was charged, what was paid, and what is left', () => {
    renderTable([row(1, { amount: 3000, paid: 1200, balance: 1800 })])
    const cells = screen.getAllByRole('row')[1].querySelectorAll('td')
    expect(cells[2]).toHaveTextContent('₱3,000.00')
    expect(cells[3]).toHaveTextContent('₱1,200.00')
    expect(cells[4]).toHaveTextContent('₱1,800.00')
  })

  it('shows ten visits to a page, newest first', () => {
    renderTable(rows(24))
    expect(treatments()).toEqual(Array.from({ length: 10 }, (_, i) => `Procedure ${i + 1}`))
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('pages forward and back', async () => {
    const user = userEvent.setup()
    renderTable(rows(24))
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(treatments()[0]).toBe('Procedure 11')
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(treatments()).toEqual(['Procedure 21', 'Procedure 22', 'Procedure 23', 'Procedure 24'])
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /previous/i }))
    expect(treatments()[0]).toBe('Procedure 11')
  })

  // In place: the same table grows. No page, no modal.
  it('lists the whole history in the same table, and folds back to pages', async () => {
    const user = userEvent.setup()
    renderTable(rows(24))
    const table = screen.getByRole('table')
    await user.click(screen.getByRole('button', { name: /list all \(24\)/i }))
    expect(screen.getByRole('table')).toBe(table)
    expect(treatments()).toHaveLength(24)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show 10 per page/i }))
    expect(treatments()).toHaveLength(10)
  })

  it('does not offer paging or List all when everything already fits', () => {
    renderTable(rows(10))
    expect(treatments()).toHaveLength(10)
    expect(screen.queryByRole('button', { name: /list all/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument()
  })

  // The note used to be inline for every visit; it is one tap away now.
  it("opens a visit to show the dentist's note", async () => {
    const user = userEvent.setup()
    renderTable([row(1, { note: 'Composite 36 placed.' })])
    expect(screen.queryByText('Composite 36 placed.')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /show details for/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByText('Composite 36 placed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide details for/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('says so when a visit has no note, rather than opening onto nothing', async () => {
    const user = userEvent.setup()
    renderTable([row(1, { note: null })])
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.getByText(/no note was written/i)).toBeInTheDocument()
  })

  it('offers reception the payment action on a visit still owing', async () => {
    const user = userEvent.setup()
    renderTable([row(1)], true)
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.getByRole('link', { name: /accept payment/i })).toHaveAttribute('href', '/invoices/inv-1')
  })

  it('does not offer payment on a settled visit', async () => {
    const user = userEvent.setup()
    renderTable([row(1, { paid: 1000, balance: 0, invoiceStatus: 'paid' })], true)
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.queryByRole('link', { name: /accept payment/i })).not.toBeInTheDocument()
  })

  // A draft is not a bill anybody can be asked to pay.
  it('shows a draft as still being billed, with no money and no invoice link', async () => {
    const user = userEvent.setup()
    renderTable([row(1, { invoiceStatus: 'draft', amount: null, paid: null, balance: null })], true)
    const cells = screen.getAllByRole('row')[1].querySelectorAll('td')
    expect(cells[1]).toHaveTextContent(/still being billed/i)
    expect(cells[2]).toHaveTextContent('—')
    await user.click(screen.getByRole('button', { name: /show details for/i }))
    expect(screen.queryByRole('link', { name: /open invoice/i })).not.toBeInTheDocument()
  })

  it('says a visit was never billed rather than leaving the cell blank', () => {
    renderTable([
      row(1, {
        treatment: null,
        amount: null,
        paid: null,
        balance: null,
        invoiceId: null,
        invoiceStatus: null,
      }),
    ])
    const cells = screen.getAllByRole('row')[1].querySelectorAll('td')
    expect(within(cells[1] as HTMLElement).getByText(/nothing billed/i)).toBeInTheDocument()
  })

  it('says plainly when there are no visits', () => {
    renderTable([])
    expect(screen.getByText(/no visits recorded yet/i)).toBeInTheDocument()
  })
})
