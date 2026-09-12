import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChairsideBilling from './ChairsideBilling'

vi.mock('./api', () => ({
  findDraftInvoice: vi.fn(),
  openDraftInvoice: vi.fn(),
  addDraftLine: vi.fn(),
  removeDraftLine: vi.fn(),
  listProcedures: vi.fn(),
  getVisitNote: vi.fn(),
  saveVisitNote: vi.fn(),
}))

const api = await import('./api')

const PROCEDURE = {
  id: 'proc-1',
  name: 'Composite filling (light cure)',
  code: 'COMP',
  default_fee: 1800,
  chart_condition: 'filled',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const draft = (items: { id: string; description: string; amount: number; tooth_number?: number }[]) =>
  ({
    id: 'inv-1',
    patient_id: 'p-1',
    visit_id: 'v-1',
    status: 'draft',
    total_amount: items.reduce((s, i) => s + i.amount, 0),
    created_by: 's-1',
    created_at: '2026-09-12T00:00:00Z',
    invoice_items: items.map((i) => ({
      ...i,
      invoice_id: 'inv-1',
      procedure_id: null,
      tooth_record_id: null,
      tooth_number: i.tooth_number ?? null,
      created_at: '2026-09-12T00:00:00Z',
    })),
  }) as never

const renderPanel = () => render(<ChairsideBilling patientId="p-1" visitId="v-1" staffId="s-1" />)

describe('ChairsideBilling', () => {
  beforeEach(() => {
    vi.mocked(api.listProcedures).mockResolvedValue([PROCEDURE] as never)
    vi.mocked(api.findDraftInvoice).mockReset().mockResolvedValue(null)
    vi.mocked(api.openDraftInvoice).mockResolvedValue(draft([]))
    vi.mocked(api.addDraftLine).mockResolvedValue(undefined)
    vi.mocked(api.removeDraftLine).mockResolvedValue(undefined)
    vi.mocked(api.getVisitNote).mockReset().mockResolvedValue(null)
    vi.mocked(api.saveVisitNote).mockReset().mockResolvedValue(undefined)
  })

  it('says plainly when nothing has been billed yet', async () => {
    renderPanel()
    expect(await screen.findByText(/nothing billed yet/i)).toBeInTheDocument()
  })

  // The draft is opened on first use, not when the patient is seated — an
  // appointment where nothing is billable should not leave an empty invoice.
  it('does not open an invoice until something is actually billed', async () => {
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    expect(api.openDraftInvoice).not.toHaveBeenCalled()
  })

  it('opens the draft when the first line is added', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.type(screen.getByLabelText(/^description$/i), 'Composite filling')
    await user.type(screen.getByLabelText(/^amount$/i), '1800')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    await waitFor(() => expect(api.openDraftInvoice).toHaveBeenCalled())
    expect(vi.mocked(api.addDraftLine).mock.calls[0][0]).toMatchObject({
      invoiceId: 'inv-1',
      description: 'Composite filling',
      amount: 1800,
    })
  })

  it('reuses the draft for a second line rather than opening another', async () => {
    const user = userEvent.setup()
    vi.mocked(api.findDraftInvoice).mockResolvedValue(draft([{ id: 'i-1', description: 'X', amount: 500 }]))
    renderPanel()
    await screen.findByText('X')
    await user.type(screen.getByLabelText(/^description$/i), 'Second thing')
    await user.type(screen.getByLabelText(/^amount$/i), '900')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    await waitFor(() => expect(api.addDraftLine).toHaveBeenCalled())
    expect(api.openDraftInvoice).not.toHaveBeenCalled()
  })

  // Retyping a fee is how the wrong one gets charged; the price list already
  // knows it.
  it('fills the description and fee from the price list', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.selectOptions(screen.getByLabelText(/^procedure$/i), 'proc-1')
    await waitFor(() =>
      expect(screen.getByLabelText(/^description$/i)).toHaveValue('Composite filling (light cure)'),
    )
    expect(screen.getByLabelText(/^amount$/i)).toHaveValue(1800)
  })

  it('leaves the fee editable, because the list price is not always charged', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.selectOptions(screen.getByLabelText(/^procedure$/i), 'proc-1')
    await waitFor(() => expect(screen.getByLabelText(/^amount$/i)).toHaveValue(1800))
    await user.clear(screen.getByLabelText(/^amount$/i))
    await user.type(screen.getByLabelText(/^amount$/i), '1500')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    await waitFor(() => expect(api.addDraftLine).toHaveBeenCalled())
    expect(vi.mocked(api.addDraftLine).mock.calls[0][0]).toMatchObject({ amount: 1500 })
  })

  it('shows a running total of what has been billed', async () => {
    vi.mocked(api.findDraftInvoice).mockResolvedValue(
      draft([
        { id: 'i-1', description: 'Composite filling', amount: 1800, tooth_number: 36 },
        { id: 'i-2', description: 'Oral prophylaxis', amount: 1200 },
      ]),
    )
    renderPanel()
    expect(await screen.findByText('Composite filling')).toBeInTheDocument()
    expect(screen.getByText(/tooth 36/i)).toBeInTheDocument()
    const totalRow = screen.getByText('Total').closest('div')!
    expect(within(totalRow).getByText(/3,000/)).toBeInTheDocument()
  })

  it('can take a mis-typed line back off while it is still a draft', async () => {
    const user = userEvent.setup()
    vi.mocked(api.findDraftInvoice).mockResolvedValue(
      draft([{ id: 'i-1', description: 'Wrong thing', amount: 999 }]),
    )
    renderPanel()
    await screen.findByText('Wrong thing')
    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(api.removeDraftLine).toHaveBeenCalledWith('i-1'))
  })

  // The form sets noValidate, so these are the app's own messages.
  it('will not bill an amount of nothing', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.type(screen.getByLabelText(/^description$/i), 'Something')
    await user.type(screen.getByLabelText(/^amount$/i), '0')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    expect(await screen.findByText(/more than zero/i)).toBeInTheDocument()
    expect(api.addDraftLine).not.toHaveBeenCalled()
  })

  it('will not bill without saying what for', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.type(screen.getByLabelText(/^amount$/i), '500')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    expect(await screen.findByText(/say what is being charged for/i)).toBeInTheDocument()
    expect(api.addDraftLine).not.toHaveBeenCalled()
  })

  // RLS refuses a dentist who tries to add to an invoice that has left
  // draft. The refusal has to be legible rather than a silent no-op.
  it('surfaces a refusal from the database', async () => {
    const user = userEvent.setup()
    vi.mocked(api.addDraftLine).mockRejectedValue(
      new Error('new row violates row-level security policy for table "invoice_items"'),
    )
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    await user.type(screen.getByLabelText(/^description$/i), 'Too late')
    await user.type(screen.getByLabelText(/^amount$/i), '500')
    await user.click(screen.getByRole('button', { name: /add to bill/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/row-level security/i)
  })

  // Whoever is billing needs to know the window closes.
  it('says the amounts are fixed once treatment is finished', async () => {
    renderPanel()
    await screen.findByText(/nothing billed yet/i)
    expect(screen.getByText(/only an admin can change them/i)).toBeInTheDocument()
  })

  // --- The visit note, now part of the bill ------------------------------

  // It used to be its own dentist-only section on the profile. It is part of
  // the bill now: written here, locked by the same "finish treatment", and
  // read afterwards by whoever takes the payment.
  it('offers a note field, and says it is optional', async () => {
    renderPanel()
    expect(await screen.findByLabelText(/note for this visit/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/note for this visit/i)).toHaveAccessibleName(/optional/i)
  })

  it('loads a note already written for this visit', async () => {
    vi.mocked(api.getVisitNote).mockResolvedValue('Scaling upper right, patient tolerated well.')
    renderPanel()
    await waitFor(() =>
      expect(screen.getByLabelText(/note for this visit/i)).toHaveValue(
        'Scaling upper right, patient tolerated well.',
      ),
    )
  })

  it('saves the note against the visit', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByLabelText(/note for this visit/i)
    await user.type(screen.getByLabelText(/note for this visit/i), 'Composite 36 placed.')
    await user.click(screen.getByRole('button', { name: /save note/i }))
    await waitFor(() => expect(api.saveVisitNote).toHaveBeenCalled())
    expect(vi.mocked(api.saveVisitNote).mock.calls[0][0]).toMatchObject({
      visitId: 'v-1',
      notes: 'Composite 36 placed.',
      staffId: 's-1',
    })
  })

  // Plenty of visits need no write-up, and a field that looks required gets
  // filled with "n/a".
  it('allows an empty note', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByLabelText(/note for this visit/i)
    await user.click(screen.getByRole('button', { name: /save note/i }))
    await waitFor(() => expect(api.saveVisitNote).toHaveBeenCalled())
    expect(vi.mocked(api.saveVisitNote).mock.calls[0][0]).toMatchObject({ notes: '' })
  })

  it('confirms the note saved, since nothing else would show it had', async () => {
    const user = userEvent.setup()
    renderPanel()
    await screen.findByLabelText(/note for this visit/i)
    await user.click(screen.getByRole('button', { name: /save note/i }))
    expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument()
  })

  // Phase 6's exit criterion, moved here with the note. A rejected write
  // must leave what was typed on screen — losing a clinical note because
  // the Wi-Fi dropped is the failure that test exists to prevent, and the
  // note changing sections does not change that.
  it('keeps the typed note on screen when the write fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.saveVisitNote).mockRejectedValue(new TypeError('Failed to fetch'))
    renderPanel()
    await screen.findByLabelText(/note for this visit/i)
    const field = screen.getByLabelText(/note for this visit/i)
    await user.type(field, 'Distal caries on 16, deep. Discussed options with patient.')
    await user.click(screen.getByRole('button', { name: /save note/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
    expect(field).toHaveValue('Distal caries on 16, deep. Discussed options with patient.')
  })

  // 0016 refuses the write once the visit is closed. A dentist editing after
  // finishing has to see the refusal, not lose the text silently.
  it('surfaces a refusal when the visit has already been closed', async () => {
    const user = userEvent.setup()
    vi.mocked(api.saveVisitNote).mockRejectedValue(
      new Error('new row violates row-level security policy for table "visit_notes"'),
    )
    renderPanel()
    await screen.findByLabelText(/note for this visit/i)
    await user.type(screen.getByLabelText(/note for this visit/i), 'Too late')
    await user.click(screen.getByRole('button', { name: /save note/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/row-level security/i)
  })
})
