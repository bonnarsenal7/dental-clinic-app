import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RosterPage from './RosterPage'
import { formatDayLong, monthGrid } from './rosterWeek'
import { toLocalDateString } from '../../core/localDate'
import type { DentistShift } from './types'

vi.mock('./api', () => ({ listRoster: vi.fn(), addShift: vi.fn(), removeShift: vi.fn() }))
vi.mock('../scheduling/api', () => ({ listDentists: vi.fn() }))

const api = await import('./api')
const scheduling = await import('../scheduling/api')

const today = toLocalDateString(new Date())
const grid = monthGrid(new Date())
// A day in the shown month that is not today, for "the panel follows the tap".
const otherDay = grid.find((d) => d !== today && d.slice(0, 7) === today.slice(0, 7))!

function shift(partial: Partial<DentistShift> = {}): DentistShift {
  return {
    id: 's-1',
    dentist_id: 'd-1',
    dentist_name: 'Dr. Santos',
    shift_date: today,
    starts_at: '08:00:00',
    ends_at: '12:30:00',
    note: null,
    ...partial,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <RosterPage />
    </MemoryRouter>,
  )

/** The calendar cell for a date, found by the name it announces. */
const dayCell = (date: string) =>
  screen.getByRole('button', {
    name: new RegExp(`^${formatDayLong(date).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  })

describe('RosterPage', () => {
  beforeEach(() => {
    vi.mocked(api.listRoster).mockReset().mockResolvedValue([shift()])
    vi.mocked(api.addShift).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.removeShift).mockReset().mockResolvedValue(undefined)
    vi.mocked(scheduling.listDentists)
      .mockReset()
      .mockResolvedValue([
        { id: 'd-1', name: 'Dr. Santos' },
        { id: 'd-2', name: 'Dr. Cruz' },
      ])
  })

  // The visible grid spills into the neighbouring months, and those cells
  // must not look empty when somebody is rostered in them.
  it('loads the whole visible grid, not just the calendar month', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalledWith(grid[0], grid[41]))
  })

  it('announces each date with how many dentists are on it', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    expect(dayCell(today)).toHaveAccessibleName(/1 dentist rostered/)
    expect(dayCell(otherDay)).toHaveAccessibleName(/nobody rostered/)
  })

  // The day opens over the calendar rather than under it: on a tablet the
  // panel below was off-screen after a tap near the bottom of the month.
  it('opens the tapped day in a dialog, and nothing before that', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(dayCell(today))
    const dialog = await screen.findByRole('dialog', { name: formatDayLong(today) })
    expect(within(dialog).getByText(/8:00 AM – 12:30 PM/)).toBeInTheDocument()
  })

  it('shows the day that was tapped, not the one before it', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(otherDay))
    const dialog = await screen.findByRole('dialog', { name: formatDayLong(otherDay) })
    expect(within(dialog).getByText(/nobody is rostered for this day yet/i)).toBeInTheDocument()
  })

  it('closes on Done', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(today))
    await userEvent.click(await screen.findByRole('button', { name: /done/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  // The date comes from the calendar, not from a field in the form — tapping
  // a day and then filling the form is the whole interaction.
  it('assigns a dentist to the date that is selected', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(otherDay))
    await screen.findByRole('dialog', { name: formatDayLong(otherDay) })

    await userEvent.selectOptions(screen.getByLabelText('Dentist'), 'd-2')
    await userEvent.clear(screen.getByLabelText('From'))
    await userEvent.type(screen.getByLabelText('From'), '13:00')
    await userEvent.clear(screen.getByLabelText('To'))
    await userEvent.type(screen.getByLabelText('To'), '17:00')
    await userEvent.type(screen.getByLabelText('Note'), 'Cover')
    await userEvent.click(screen.getByRole('button', { name: /add to roster/i }))

    await waitFor(() =>
      expect(api.addShift).toHaveBeenCalledWith({
        dentist_id: 'd-2',
        shift_date: otherDay,
        starts_at: '13:00',
        ends_at: '17:00',
        note: 'Cover',
      }),
    )
  })

  // A day usually needs more than one dentist; closing after each would make
  // assigning three of them three trips through the calendar.
  it('stays open after adding, so the next dentist can go on the same day', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(otherDay))
    await screen.findByRole('dialog', { name: formatDayLong(otherDay) })

    await userEvent.selectOptions(screen.getByLabelText('Dentist'), 'd-2')
    await userEvent.click(screen.getByRole('button', { name: /add to roster/i }))

    await waitFor(() => expect(api.addShift).toHaveBeenCalled())
    expect(screen.getByRole('dialog', { name: formatDayLong(otherDay) })).toBeInTheDocument()
    // Cleared for the next one, with the hours kept — the second dentist
    // usually covers the same session.
    expect(screen.getByLabelText('Dentist')).toHaveValue('')
    expect(screen.getByLabelText('From')).toHaveValue('09:00')
  })

  it('refuses a finish time before the start, without asking the database', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(today))
    await screen.findByRole('dialog', { name: formatDayLong(today) })
    await userEvent.selectOptions(screen.getByLabelText('Dentist'), 'd-2')
    await userEvent.clear(screen.getByLabelText('To'))
    await userEvent.type(screen.getByLabelText('To'), '08:00')
    await userEvent.click(screen.getByRole('button', { name: /add to roster/i }))

    expect(await screen.findByText(/finish time has to be after the start time/i)).toBeInTheDocument()
    expect(api.addShift).not.toHaveBeenCalled()
  })

  // The overlap rule is in Postgres. What matters here is that its refusal
  // reaches the person who typed the hours.
  it('shows a refused overlap beside the form, and keeps what was typed', async () => {
    vi.mocked(api.addShift).mockRejectedValue(
      new Error('That dentist is already rostered for part of those hours.'),
    )
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(today))
    await screen.findByRole('dialog', { name: formatDayLong(today) })
    await userEvent.selectOptions(screen.getByLabelText('Dentist'), 'd-1')
    await userEvent.click(screen.getByRole('button', { name: /add to roster/i }))

    expect(await screen.findByText(/already rostered for part of those hours/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Dentist')).toHaveValue('d-1')
  })

  it('confirms before removing a shift', async () => {
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(today))
    await userEvent.click(await screen.findByRole('button', { name: /remove dr. santos from/i }))

    // Two dialogs are open — the day, and the confirmation over it.
    const confirm = await screen.findByRole('dialog', { name: /remove this shift\?/i })
    expect(within(confirm).getByText(/booked appointments are not affected/i)).toBeInTheDocument()
    expect(api.removeShift).not.toHaveBeenCalled()

    await userEvent.click(within(confirm).getByRole('button', { name: /^remove$/i }))
    await waitFor(() => expect(api.removeShift).toHaveBeenCalledWith('s-1'))
  })

  it('says so when there is no dentist to assign', async () => {
    vi.mocked(scheduling.listDentists).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(api.listRoster).toHaveBeenCalled())
    await userEvent.click(dayCell(today))
    expect(await screen.findByText(/no active dentists to assign/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to roster/i })).toBeDisabled()
  })
})
