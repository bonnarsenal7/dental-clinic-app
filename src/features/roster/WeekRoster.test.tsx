import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WeekRoster from './WeekRoster'
import { startOfWeek, weekDates } from './rosterWeek'
import type { DentistShift } from './types'

vi.mock('./api', () => ({ listRoster: vi.fn() }))

const api = await import('./api')

const week = weekDates(startOfWeek(new Date()))

function shift(partial: Partial<DentistShift> = {}): DentistShift {
  return {
    id: 's-1',
    dentist_id: 'd-1',
    dentist_name: 'Dr. Santos',
    shift_date: week[0],
    starts_at: '08:00:00',
    ends_at: '12:30:00',
    note: null,
    ...partial,
  }
}

describe('WeekRoster', () => {
  beforeEach(() => {
    vi.mocked(api.listRoster)
      .mockReset()
      .mockResolvedValue([
        shift(),
        shift({
          id: 's-2',
          dentist_id: 'd-2',
          dentist_name: 'Dr. Cruz',
          starts_at: '13:00:00',
          ends_at: '17:00:00',
        }),
        shift({
          id: 's-3',
          shift_date: week[2],
          starts_at: '09:00:00',
          ends_at: '17:00:00',
          note: 'Half day',
        }),
      ])
  })

  it('asks for Monday to Sunday of the current week', async () => {
    render(<WeekRoster />)
    await waitFor(() => expect(api.listRoster).toHaveBeenCalledWith(week[0], week[6]))
  })

  it('shows the front desk every dentist, with their hours', async () => {
    render(<WeekRoster />)
    expect(await screen.findByText('Dr. Cruz')).toBeInTheDocument()
    expect(screen.getAllByText('Dr. Santos')).toHaveLength(2)
    expect(screen.getByText('8:00 AM – 12:30 PM')).toBeInTheDocument()
    expect(screen.getByText('Half day')).toBeInTheDocument()
  })

  // A dentist's dashboard is their own day everywhere else; the roster
  // follows. Removing the filter fails this.
  it("shows a dentist their own sessions and nobody else's", async () => {
    render(<WeekRoster dentistId="d-1" />)
    await screen.findByText('8:00 AM – 12:30 PM')
    // The hours, not the name: their own week does not repeat whose it is,
    // so a colleague's shift is only visible as its times — which is what
    // dropping the filter would put back on screen.
    expect(screen.queryByText('1:00 PM – 5:00 PM')).not.toBeInTheDocument()
    expect(screen.queryByText('Dr. Cruz')).not.toBeInTheDocument()
    expect(screen.queryByText('Dr. Santos')).not.toBeInTheDocument()
    expect(screen.getByText(/your week/i)).toBeInTheDocument()
  })

  it('says when nobody is rostered rather than showing seven blank days', async () => {
    vi.mocked(api.listRoster).mockResolvedValue([])
    render(<WeekRoster />)
    expect(await screen.findByText(/nobody is rostered this week yet/i)).toBeInTheDocument()
  })

  it('tells a dentist when they are not on this week', async () => {
    vi.mocked(api.listRoster).mockResolvedValue([])
    render(<WeekRoster dentistId="d-1" />)
    expect(await screen.findByText(/you are not rostered this week/i)).toBeInTheDocument()
  })

  // It fetches on its own, so a failure here costs the roster panel and not
  // the day's figures beside it.
  it('reports its own failure, with a way to try again', async () => {
    vi.mocked(api.listRoster).mockRejectedValue(new Error('Failed to fetch'))
    render(<WeekRoster />)
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
