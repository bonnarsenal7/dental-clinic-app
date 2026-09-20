import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardPage from './DashboardPage'
import type { DailySummary } from './types'
import type { MedicalHistory } from '../patients/types'

vi.mock('./api', () => ({
  getDailySummary: vi.fn(),
  listTodaysPatients: vi.fn(),
  listDentistDay: vi.fn(),
  listPaymentQueue: vi.fn(),
}))
vi.mock('../../core/useRealtimeRefresh', () => ({ useRealtimeRefresh: vi.fn() }))
vi.mock('../scheduling/api', () => ({ checkOutWithoutCharge: vi.fn() }))
vi.mock('../roster/api', () => ({ listRoster: vi.fn() }))
vi.mock('../dailyClose/DailyClosePanel', () => ({
  default: () => <section aria-label="End of day">end of day</section>,
}))

const role = { current: 'admin' as 'admin' | 'dentist' | 'receptionist' }
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Test User', role: role.current } }),
}))

const api = await import('./api')
const realtime = await import('../../core/useRealtimeRefresh')
const roster = await import('../roster/api')

function summary(partial: Partial<DailySummary> = {}): DailySummary {
  return {
    today: '2026-09-11',
    appointments_today: 7,
    in_clinic: 2,
    still_to_come: 4,
    completed_today: 1,
    no_shows_today: 0,
    cancelled_today: 0,
    longest_wait_minutes: 12,
    collected_today: 3000,
    collected_cash: 3000,
    collected_card: 0,
    collected_transfer: 0,
    collected_other: 0,
    produced_today: 3000,
    outstanding_total: 1900,
    patients_owing: 2,
    recalls_overdue: 3,
    recalls_due_soon: 1,
    new_patients_today: 0,
    ...partial,
  }
}

function medical(partial: Partial<MedicalHistory>): MedicalHistory {
  return {
    id: 'mh',
    patient_id: 'p1',
    under_physician_care: false,
    physician_name: null,
    physician_phone: null,
    hospitalized: false,
    hospitalized_reason: null,
    conditions: {},
    other_condition_details: null,
    allergic_to_food_or_drug: false,
    allergy_details: null,
    current_medications: false,
    medication_details: null,
    allergic_to_anesthesia: false,
    smokes: false,
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )

describe('DashboardPage', () => {
  beforeEach(() => {
    role.current = 'admin'
    vi.mocked(api.getDailySummary).mockResolvedValue(summary())
    vi.mocked(api.listTodaysPatients).mockResolvedValue([])
    vi.mocked(api.listDentistDay).mockResolvedValue([])
    vi.mocked(api.listPaymentQueue).mockReset().mockResolvedValue([])
    vi.mocked(realtime.useRealtimeRefresh).mockClear()
    vi.mocked(roster.listRoster).mockReset().mockResolvedValue([])
  })

  describe('end of day', () => {
    it.each(['receptionist', 'admin'] as const)(
      'gives %s the expenses, salary and Close Clinic panel',
      async (r) => {
        role.current = r
        renderPage()
        expect(await screen.findByRole('region', { name: /end of day/i })).toBeInTheDocument()
      },
    )

    // Colleagues' pay and the day's takings are not a dentist's to see.
    it('keeps it off the dentist’s dashboard', async () => {
      role.current = 'dentist'
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByRole('region', { name: /end of day/i })).not.toBeInTheDocument()
    })

    it('sits below everything else on the dashboard', async () => {
      role.current = 'receptionist'
      renderPage()
      const panel = await screen.findByRole('region', { name: /end of day/i })
      expect(panel.parentElement!.lastElementChild).toBe(panel)
    })
  })

  // Wiring, not the panel's own behaviour: deleting <WeekRoster/> from this
  // screen left every WeekRoster test passing. The same lesson as the chart's
  // medical alerts — cover the component *and* its presence on the screen.
  describe("this week's roster", () => {
    it('is on the front desk dashboard, showing the whole clinic', async () => {
      role.current = 'receptionist'
      renderPage()
      expect(await screen.findByRole('heading', { name: /this week's dentists/i })).toBeInTheDocument()
    })

    // A dentist's dashboard is their own day; the roster follows.
    it("is on a dentist's dashboard, narrowed to their own sessions", async () => {
      role.current = 'dentist'
      renderPage()
      expect(await screen.findByRole('heading', { name: /your week/i })).toBeInTheDocument()
      await waitFor(() => expect(roster.listRoster).toHaveBeenCalled())
    })
  })

  describe('awaiting payment', () => {
    const waiting = {
      appointmentId: 'a-1',
      patientId: 'p-1',
      patientName: 'Maria Clara Santos',
      treatment: 'Composite filling',
      scheduledAt: '2026-09-11T01:30:00Z',
      state: 'awaiting' as const,
      invoiceId: 'inv-1',
      balance: 1800,
      carriedOver: false,
    }

    it('shows reception the queue, each entry opening its invoice', async () => {
      role.current = 'receptionist'
      vi.mocked(api.listPaymentQueue).mockResolvedValue([waiting])
      renderPage()
      expect(await screen.findByRole('heading', { name: /awaiting payment/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /maria clara santos/i })).toHaveAttribute(
        'href',
        '/invoices/inv-1',
      )
    })

    // Every receptionist's dashboard, live — the same subscription for all.
    it('keeps it live for reception over the realtime channel', async () => {
      role.current = 'receptionist'
      renderPage()
      await screen.findByRole('heading', { name: /awaiting payment/i })
      const calls = vi.mocked(realtime.useRealtimeRefresh).mock.calls
      const [, tables, , enabled] = calls[calls.length - 1]
      expect(tables).toEqual(['appointments', 'invoices', 'payments'])
      expect(enabled).toBe(true)
    })

    it('refreshes when the channel reports a change', async () => {
      role.current = 'receptionist'
      renderPage()
      await screen.findByRole('heading', { name: /awaiting payment/i })
      const calls = vi.mocked(realtime.useRealtimeRefresh).mock.calls
      const onChange = calls[calls.length - 1][2]
      vi.mocked(api.listPaymentQueue).mockResolvedValue([waiting])
      onChange()
      expect(await screen.findByRole('link', { name: /maria clara santos/i })).toBeInTheDocument()
    })

    it('is not on the dentist’s dashboard, and does not subscribe for them', async () => {
      role.current = 'dentist'
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByRole('heading', { name: /awaiting payment/i })).not.toBeInTheDocument()
      expect(api.listPaymentQueue).not.toHaveBeenCalled()
      const calls = vi.mocked(realtime.useRealtimeRefresh).mock.calls
      expect(calls[calls.length - 1][3]).toBe(false)
    })
  })

  describe("the dentist's own day", () => {
    const row = {
      appointment_id: 'a1',
      patient_id: 'p1',
      name: 'Ricardo Bautista',
      scheduled_at: '2026-09-11T01:30:00Z',
      status: 'completed' as const,
      reason: null,
      medical: medical({}),
      treatment: 'Composite filling',
      amount: 1800,
      commission: 0,
    }

    beforeEach(() => {
      role.current = 'dentist'
    })

    it("asks only for the signed-in dentist's patients", async () => {
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(api.listDentistDay).toHaveBeenCalledWith('s1')
      expect(api.listTodaysPatients).not.toHaveBeenCalled()
    })

    // What a dentist earned today, in place of two figures about the diary
    // they can no longer open.
    it("totals the day's commission instead of Still to come and No-shows", async () => {
      vi.mocked(api.listDentistDay).mockResolvedValue([
        { ...row, commission: 500 },
        { ...row, appointment_id: 'a2', commission: 250 },
      ])
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.getByText('₱750.00')).toBeInTheDocument()
      expect(screen.queryByText(/still to come/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/no-shows/i)).not.toBeInTheDocument()
    })

    it('shows nothing earned as zero rather than blank', async () => {
      vi.mocked(api.listDentistDay).mockResolvedValue([row])
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.getAllByText('₱0.00').length).toBeGreaterThan(0)
    })

    it("titles the list Today's Patient, with the five columns in order", async () => {
      vi.mocked(api.listDentistDay).mockResolvedValue([row])
      renderPage()
      expect(await screen.findByRole('heading', { name: "Today's Patient" })).toBeInTheDocument()
      expect(screen.queryByText("Today's list")).not.toBeInTheDocument()
      expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
        'Time',
        'Patient Name',
        'Treatment',
        'Amount',
        'Commission',
      ])
    })

    it('shows the treatment, its amount, and a commission of zero until reception enters one', async () => {
      vi.mocked(api.listDentistDay).mockResolvedValue([row])
      renderPage()
      const cells = (await screen.findAllByRole('row'))[1].querySelectorAll('td')
      expect(cells[2]).toHaveTextContent('Composite filling')
      expect(cells[3]).toHaveTextContent('₱1,800.00')
      expect(cells[4]).toHaveTextContent('₱0.00')
      // Read-only: nothing to type into on the dentist's side.
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('does not offer the schedule button', async () => {
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByRole('link', { name: /open schedule/i })).not.toBeInTheDocument()
    })

    // The schedule and recalls routes refuse a dentist, so a tile linking
    // there would bounce them straight back to this page.
    it('keeps the tiles as figures rather than links into screens a dentist cannot open', async () => {
      renderPage()
      await screen.findByText(/in the clinic/i)
      const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href'))
      expect(hrefs).not.toContain('/schedule')
      expect(hrefs).not.toContain('/recalls')
    })
  })

  // The two tiles a dentist lost are still reception's: they run the diary.
  it('keeps the whole day at a glance for reception', async () => {
    role.current = 'receptionist'
    renderPage()
    expect(await screen.findByText(/in the clinic/i)).toBeInTheDocument()
    expect(screen.getByText(/still to come/i)).toBeInTheDocument()
    expect(screen.getByText(/no-shows/i)).toBeInTheDocument()
    expect(screen.queryByText(/^commission$/i)).not.toBeInTheDocument()
  })

  it('still offers the schedule button to reception', async () => {
    role.current = 'receptionist'
    renderPage()
    expect(await screen.findByRole('link', { name: /open schedule/i })).toBeInTheDocument()
  })

  it('leads with the queue and the day', async () => {
    renderPage()
    expect(await screen.findByText(/in the clinic/i)).toBeInTheDocument()
    expect(screen.getByText(/longest wait 12 min/i)).toBeInTheDocument()
  })

  it('shows money as pesos, not raw numbers', async () => {
    renderPage()
    // The figure appears in more than one tile by design (collected, billed,
    // and the cash breakdown), so assert presence rather than uniqueness.
    expect(await screen.findAllByText(/₱3,000\.00/)).not.toHaveLength(0)
    expect(screen.getByText(/₱1,900\.00/)).toBeInTheDocument()
    expect(screen.getByText(/2 patients owing/i)).toBeInTheDocument()
  })

  // PostgREST hands back numeric columns as strings often enough that a
  // dashboard doing arithmetic on them would render "NaN" or "30001900".
  it('copes with numerics arriving as strings', async () => {
    vi.mocked(api.getDailySummary).mockResolvedValue(
      summary({
        collected_today: '3000.00' as unknown as number,
        in_clinic: '2' as unknown as number,
      }),
    )
    renderPage()
    expect(await screen.findAllByText(/₱3,000\.00/)).not.toHaveLength(0)
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    // "2" concatenated rather than coerced would read as a string elsewhere.
    expect(screen.getByText(/in the clinic/i)).toBeInTheDocument()
  })

  // A dentist opening this at the start of a shift needs to know who cannot
  // be treated as planned before they read how many are booked. An alert
  // under four stat tiles is an alert someone scrolls past.
  it("puts the medical alerts above the day's numbers", async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a1',
        patient_id: 'p1',
        name: 'Ricardo Bautista',
        scheduled_at: '2026-09-11T07:30:00Z',
        status: 'booked',
        reason: null,
        medical: medical({ allergic_to_anesthesia: true }),
      },
    ])
    const { container } = renderPage()
    const alert = await screen.findByRole('alert')
    const tiles = screen.getByText(/in the clinic/i)
    // Node.compareDocumentPosition: 4 means the alert comes first.
    expect(alert.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container).toBeTruthy()
  })

  it('counts how many patients need attention', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a1',
        patient_id: 'p1',
        name: 'A',
        scheduled_at: '2026-09-11T07:30:00Z',
        status: 'booked',
        reason: null,
        medical: medical({ allergic_to_anesthesia: true }),
      },
      {
        appointment_id: 'a2',
        patient_id: 'p2',
        name: 'B',
        scheduled_at: '2026-09-11T08:30:00Z',
        status: 'booked',
        reason: null,
        medical: null,
      },
    ])
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/2 patients/i)
  })

  it('flags a critical allergy for a patient due in today', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a1',
        patient_id: 'p1',
        name: 'Ricardo Bautista',
        scheduled_at: '2026-09-11T07:30:00Z',
        status: 'booked',
        reason: 'Extraction',
        medical: medical({ allergic_to_anesthesia: true }),
      },
    ])
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/ricardo bautista/i)
    expect(alert).toHaveTextContent(/allergic to anaesthesia/i)
  })

  it('flags a patient booked in with no medical history at all', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a2',
        patient_id: 'p2',
        name: 'Walk In',
        scheduled_at: '2026-09-11T09:00:00Z',
        status: 'booked',
        reason: null,
        medical: null,
      },
    ])
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/no medical history on file/i)
  })

  // Someone who cancelled isn't coming in, so warning about them is noise
  // that makes the real warnings easier to skip past.
  it('ignores cancelled and no-show patients when flagging', async () => {
    vi.mocked(api.listTodaysPatients).mockResolvedValue([
      {
        appointment_id: 'a3',
        patient_id: 'p3',
        name: 'Cancelled Person',
        scheduled_at: '2026-09-11T09:00:00Z',
        status: 'cancelled',
        reason: null,
        medical: medical({ allergic_to_anesthesia: true }),
      },
      {
        appointment_id: 'a4',
        patient_id: 'p4',
        name: 'Absent Person',
        scheduled_at: '2026-09-11T10:00:00Z',
        status: 'no_show',
        reason: null,
        medical: null,
      },
    ])
    renderPage()
    await screen.findByText(/in the clinic/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('what each role sees', () => {
    it('shows money to reception', async () => {
      role.current = 'receptionist'
      renderPage()
      expect(await screen.findByText(/collected today/i)).toBeInTheDocument()
    })

    // Reception runs the front desk, not the clinic's clinical judgement;
    // the alerts panel is for whoever is about to treat someone.
    it('keeps the clinical alert panel to dentist and admin', async () => {
      role.current = 'receptionist'
      vi.mocked(api.listTodaysPatients).mockResolvedValue([
        {
          appointment_id: 'a1',
          patient_id: 'p1',
          name: 'Ricardo Bautista',
          scheduled_at: '2026-09-11T07:30:00Z',
          status: 'booked',
          reason: null,
          medical: medical({ allergic_to_anesthesia: true }),
        },
      ])
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('does not show takings to the dentist', async () => {
      role.current = 'dentist'
      renderPage()
      await screen.findByText(/in the clinic/i)
      expect(screen.queryByText(/collected today/i)).not.toBeInTheDocument()
    })

    // Scoped with the list: the alerts are for the dentist's own patients.
    it('shows the dentist the clinical alerts', async () => {
      role.current = 'dentist'
      vi.mocked(api.listDentistDay).mockResolvedValue([
        {
          appointment_id: 'a1',
          patient_id: 'p1',
          name: 'Ricardo Bautista',
          scheduled_at: '2026-09-11T07:30:00Z',
          status: 'booked',
          reason: null,
          medical: medical({ allergic_to_anesthesia: true }),
          treatment: null,
          amount: null,
          commission: 0,
        },
      ])
      renderPage()
      expect(await screen.findByRole('alert')).toHaveTextContent(/ricardo bautista/i)
    })
  })
})
