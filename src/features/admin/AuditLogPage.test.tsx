import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuditLogPage from './AuditLogPage'

const { q } = vi.hoisted(() => ({
  q: { rows: [] as unknown[], filters: [] as [string, unknown][], limit: 0 },
}))

// A chainable stub that records what the screen asked the database for —
// the filters are the feature, so they are what gets asserted.
function builder() {
  const self: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'in']) {
    self[m] = (...args: unknown[]) => {
      if (m !== 'select' && m !== 'order') q.filters.push([m, args])
      return self
    }
  }
  self.range = async () => ({ data: q.rows, error: null })
  self.limit = async (n: number) => { q.limit = n; return { data: q.rows, error: null } }
  self.then = undefined
  return self
}

vi.mock('../../core/supabaseClient', () => ({
  supabase: { from: () => builder() },
}))

const ENTRY = {
  id: 'a1', staff_id: 'u1', action: 'update patients', operation: 'update',
  table_name: 'patients', record_id: 'p1', patient_id: 'p1',
  changed_fields: ['cell_number', 'remarks'], created_at: '2026-09-11T02:00:00Z',
}

describe('AuditLogPage', () => {
  beforeEach(() => { q.rows = [ENTRY]; q.filters = []; q.limit = 0 })

  it('shows what changed, not just that something did', async () => {
    render(<AuditLogPage />)
    expect(await screen.findByText('update')).toBeInTheDocument()
    expect(screen.getByText('cell_number, remarks')).toBeInTheDocument()
  })

  // Write entries come from database triggers and view entries from the
  // client, which is a real difference in how much they can be trusted.
  it('distinguishes an operation type so views and writes are not blurred', async () => {
    render(<AuditLogPage />)
    await screen.findByText('update')
    expect(screen.getByText(/writes are recorded by the database itself/i)).toBeInTheDocument()
  })

  it('filters by operation, table and date range', async () => {
    const user = userEvent.setup()
    render(<AuditLogPage />)
    await screen.findByText('update')
    await user.selectOptions(screen.getByLabelText(/operation/i), 'delete')
    await waitFor(() => expect(q.filters.some(([m, a]) => m === 'eq' && (a as unknown[])[1] === 'delete')).toBe(true))
    await user.type(screen.getByLabelText(/^table$/i), 'visit_notes')
    await waitFor(() => expect(q.filters.some(([m, a]) => m === 'eq' && (a as unknown[])[1] === 'visit_notes')).toBe(true))
  })

  // "To 5 March" must include everything that happened on the 5th.
  it('takes the "to" date to the end of that day', async () => {
    const user = userEvent.setup()
    render(<AuditLogPage />)
    await screen.findByText('update')
    await user.type(screen.getByLabelText(/^to$/i), '2026-03-05')
    await waitFor(() => {
      const lte = q.filters.find(([m]) => m === 'lte')
      expect(String((lte![1] as unknown[])[1])).toMatch(/T(15|16|23):59:59/)
    })
  })

  it('says when nothing matches instead of showing a blank table', async () => {
    q.rows = []
    render(<AuditLogPage />)
    expect(await screen.findByText(/no entries match these filters/i)).toBeInTheDocument()
  })

  // A log you cannot take away is not much use for a compliance review.
  it('offers a CSV export', async () => {
    render(<AuditLogPage />)
    await screen.findByText('update')
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
  })
})
