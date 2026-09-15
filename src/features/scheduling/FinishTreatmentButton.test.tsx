import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FinishTreatmentButton from './FinishTreatmentButton'
import type { Appointment } from './types'

vi.mock('./api', () => ({
  findInChairAppointmentForVisit: vi.fn(),
  finishTreatment: vi.fn(),
  setAppointmentStatus: vi.fn(),
}))
vi.mock('../billing/api', () => ({ findDraftInvoice: vi.fn() }))
vi.mock('../../core/components/ui/toast', () => ({ toastSaved: vi.fn() }))

const api = await import('./api')
const billing = await import('../billing/api')

const IN_CHAIR = { id: 'a-1', visit_id: 'v-1', status: 'in_chair' } as Appointment

const renderButton = (role: 'dentist' | 'receptionist' | 'admin' = 'dentist', onFinished = vi.fn()) => {
  render(<FinishTreatmentButton visitId="v-1" staffId="s-1" role={role} onFinished={onFinished} />)
  return onFinished
}

async function finish(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /finish treatment/i }))
  const dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: /finish treatment/i }))
}

describe('FinishTreatmentButton', () => {
  beforeEach(() => {
    vi.mocked(api.findInChairAppointmentForVisit).mockReset().mockResolvedValue(IN_CHAIR)
    vi.mocked(api.finishTreatment).mockReset().mockResolvedValue(IN_CHAIR)
    vi.mocked(api.setAppointmentStatus).mockReset().mockResolvedValue(IN_CHAIR)
    vi.mocked(billing.findDraftInvoice)
      .mockReset()
      .mockResolvedValue({ id: 'inv-1' } as never)
  })

  // Finishing treatment is the dentist's alone (0013, 0015); offering it to
  // reception would be a button the database refuses.
  it('is not offered to reception, and does not even look', async () => {
    renderButton('receptionist')
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole('button', { name: /finish treatment/i })).not.toBeInTheDocument()
    expect(api.findInChairAppointmentForVisit).not.toHaveBeenCalled()
  })

  it('is not offered when nobody is in the chair for this visit', async () => {
    vi.mocked(api.findInChairAppointmentForVisit).mockResolvedValue(null)
    renderButton()
    await waitFor(() => expect(api.findInChairAppointmentForVisit).toHaveBeenCalledWith('v-1'))
    expect(screen.queryByRole('button', { name: /finish treatment/i })).not.toBeInTheDocument()
  })

  it('locks the bill and hands the patient to reception', async () => {
    const user = userEvent.setup()
    const onFinished = renderButton()
    await finish(user)
    await waitFor(() =>
      expect(api.finishTreatment).toHaveBeenCalledWith({
        appointment: IN_CHAIR,
        staffId: 's-1',
        invoiceId: 'inv-1',
      }),
    )
    expect(onFinished).toHaveBeenCalled()
  })

  // finishTreatment sends an unbilled visit straight to `completed`, a move
  // 0015 refuses a dentist. pending_payment is the one move they have.
  it('moves an unbilled visit to the counter rather than to completed', async () => {
    const user = userEvent.setup()
    vi.mocked(billing.findDraftInvoice).mockResolvedValue(null)
    renderButton()
    await finish(user)
    await waitFor(() =>
      expect(api.setAppointmentStatus).toHaveBeenCalledWith({
        appointment: IN_CHAIR,
        status: 'pending_payment',
        staffId: 's-1',
      }),
    )
    expect(api.finishTreatment).not.toHaveBeenCalled()
  })

  it('asks before locking anything', async () => {
    const user = userEvent.setup()
    renderButton()
    await user.click(await screen.findByRole('button', { name: /finish treatment/i }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(/only an admin can change them/i)
    expect(api.finishTreatment).not.toHaveBeenCalled()
  })
})
