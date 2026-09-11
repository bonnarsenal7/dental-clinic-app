import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PriceListPage from './PriceListPage'

vi.mock('./api', () => ({
  listProcedures: vi.fn(),
  createProcedure: vi.fn(),
  updateProcedure: vi.fn(),
}))
const api = await import('./api')

const PROCS = [
  {
    id: 'p1',
    name: 'Composite filling (light cure)',
    code: 'COMP',
    default_fee: 1800,
    chart_condition: 'filled',
    active: true,
    created_at: '2026-01-01',
  },
  {
    id: 'p2',
    name: 'Retired procedure',
    code: null,
    default_fee: 500,
    chart_condition: null,
    active: false,
    created_at: '2026-01-01',
  },
]

describe('PriceListPage', () => {
  beforeEach(() => {
    vi.mocked(api.listProcedures).mockResolvedValue(PROCS as never)
    vi.mocked(api.createProcedure).mockResolvedValue(undefined)
    vi.mocked(api.updateProcedure).mockResolvedValue(undefined)
  })

  it('shows fees as pesos and the charted condition', async () => {
    render(<PriceListPage />)
    expect(await screen.findByText('Composite filling (light cure)')).toBeInTheDocument()
    expect(screen.getByText('₱1,800.00')).toBeInTheDocument()
    expect(screen.getByText('filled')).toBeInTheDocument()
  })

  // Retired procedures stay listed so a price can be brought back without
  // losing the invoices that reference it.
  it('keeps retired procedures listed, offering to restore them', async () => {
    render(<PriceListPage />)
    expect(await screen.findByText('Retired procedure')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restore/i })).toBeInTheDocument()
    expect(vi.mocked(api.listProcedures).mock.calls[0][0]).toBe(true)
  })

  it('retires a procedure rather than deleting it', async () => {
    const user = userEvent.setup()
    render(<PriceListPage />)
    await screen.findByText('Composite filling (light cure)')
    await user.click(screen.getByRole('button', { name: /retire/i }))
    await waitFor(() => expect(api.updateProcedure).toHaveBeenCalledWith('p1', { active: false }))
  })

  it('adds a procedure with its chart link', async () => {
    const user = userEvent.setup()
    render(<PriceListPage />)
    await screen.findByText('Composite filling (light cure)')
    await user.type(screen.getByLabelText(/procedure/i), 'Zirconia crown')
    await user.type(screen.getByLabelText(/fee/i), '22000')
    await user.selectOptions(screen.getByLabelText(/charted as/i), 'crown')
    await user.click(screen.getByRole('button', { name: /add procedure/i }))
    await waitFor(() => expect(api.createProcedure).toHaveBeenCalled())
    expect(vi.mocked(api.createProcedure).mock.calls[0][0]).toMatchObject({
      name: 'Zirconia crown',
      default_fee: 22000,
      chart_condition: 'crown',
    })
  })

  // noValidate plus react-hook-form, so the message is the app's own.
  it('names its own validation messages', async () => {
    const user = userEvent.setup()
    render(<PriceListPage />)
    await screen.findByText('Composite filling (light cure)')
    await user.click(screen.getByRole('button', { name: /add procedure/i }))
    expect(await screen.findByText(/name the procedure/i)).toBeInTheDocument()
    expect(api.createProcedure).not.toHaveBeenCalled()
  })

  it('says when the list is empty, since it blocks invoicing', async () => {
    vi.mocked(api.listProcedures).mockResolvedValue([] as never)
    render(<PriceListPage />)
    expect(await screen.findByText(/no procedures yet/i)).toBeInTheDocument()
  })
})
