import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DailyClosePanel from './DailyClosePanel'
import type { ClinicDayReport } from './types'

vi.mock('./api', () => ({
  listDailyExpenses: vi.fn(),
  listSalaryEntries: vi.fn(),
  getClinicDay: vi.fn(),
  getClinicDayTotals: vi.fn(),
  listCommissionByDentist: vi.fn(),
  getClinicName: vi.fn(),
  addDailyExpense: vi.fn(),
  addSalaryEntry: vi.fn(),
  updateDailyExpense: vi.fn(),
  updateSalaryEntry: vi.fn(),
  deleteDailyExpense: vi.fn(),
  deleteSalaryEntry: vi.fn(),
  closeClinicDay: vi.fn(),
}))
vi.mock('../scheduling/api', () => ({ listDentists: vi.fn() }))
vi.mock('./eodReportPdf', () => ({ downloadClinicDayReport: vi.fn() }))

const api = await import('./api')
const scheduling = await import('../scheduling/api')
const pdf = await import('./eodReportPdf')

const REPORT: ClinicDayReport = {
  business_date: '2026-09-15',
  closed_at: '2026-09-15T10:00:00Z',
  closed_by_name: 'Ana',
  revenue_total: 5000,
  expense_total: 1200,
  salary_total: 3000,
  commission_total: 750,
  net_total: 800,
  expenses: [{ description: 'Gloves', amount: 1200 }],
  salaries: [{ dentist_id: 'd-1', dentist_name: 'Dr Cruz', description: 'Day rate', amount: 3000 }],
}

const expense = (over = {}) => ({
  id: 'e-1',
  business_date: '2026-09-15',
  description: 'Gloves',
  amount: 1200,
  created_by: 's-1',
  created_at: '2026-09-15T01:00:00Z',
  ...over,
})

const renderPanel = (role: 'receptionist' | 'admin' = 'receptionist') =>
  render(<DailyClosePanel staff={{ id: 's-1', role }} />)

const section = (name: RegExp) => screen.getByRole('region', { name })

describe('DailyClosePanel', () => {
  beforeEach(() => {
    vi.mocked(api.listDailyExpenses).mockReset().mockResolvedValue([])
    vi.mocked(api.listSalaryEntries).mockReset().mockResolvedValue([])
    vi.mocked(api.getClinicDay).mockReset().mockResolvedValue(null)
    vi.mocked(api.getClinicDayTotals).mockReset().mockResolvedValue({
      business_date: '2026-09-15',
      revenue_total: 5000,
      expense_total: 0,
      salary_total: 0,
      commission_total: 750,
    })
    vi.mocked(api.listCommissionByDentist).mockReset().mockResolvedValue([])
    vi.mocked(api.getClinicName).mockReset().mockResolvedValue('ToothCo Dental Clinic')
    vi.mocked(api.addDailyExpense).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.addSalaryEntry).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.deleteDailyExpense).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.updateDailyExpense).mockReset().mockResolvedValue(undefined)
    vi.mocked(api.closeClinicDay).mockReset().mockResolvedValue(REPORT)
    vi.mocked(scheduling.listDentists)
      .mockReset()
      .mockResolvedValue([
        { id: 'd-1', name: 'Dr Cruz' },
        { id: 'd-2', name: 'Dr Reyes' },
      ])
    vi.mocked(pdf.downloadClinicDayReport).mockReset()
  })

  describe('daily expenses', () => {
    it("adds an expense to today's list", async () => {
      const user = userEvent.setup()
      renderPanel()
      const expenses = within(await screen.findByRole('region', { name: /daily expenses/i }))
      await user.type(expenses.getByLabelText(/^description/i), 'Gloves')
      await user.type(expenses.getByLabelText(/^amount/i), '1200')
      await user.click(expenses.getByRole('button', { name: /^add$/i }))
      await waitFor(() =>
        expect(api.addDailyExpense).toHaveBeenCalledWith({ description: 'Gloves', amount: 1200 }),
      )
      await waitFor(() => expect(api.listDailyExpenses).toHaveBeenCalledTimes(2))
    })

    it('takes several expenses in a day, the form clearing after each', async () => {
      const user = userEvent.setup()
      renderPanel()
      const expenses = within(await screen.findByRole('region', { name: /daily expenses/i }))
      for (const [d, a] of [
        ['Gloves', '1200'],
        ['Courier', '150'],
      ]) {
        await user.type(expenses.getByLabelText(/^description/i), d)
        await user.type(expenses.getByLabelText(/^amount/i), a)
        await user.click(expenses.getByRole('button', { name: /^add$/i }))
        await waitFor(() => expect(expenses.getByLabelText(/^description/i)).toHaveValue(''))
      }
      expect(api.addDailyExpense).toHaveBeenCalledTimes(2)
    })

    it('refuses an expense of nothing', async () => {
      const user = userEvent.setup()
      renderPanel()
      const expenses = within(await screen.findByRole('region', { name: /daily expenses/i }))
      await user.type(expenses.getByLabelText(/^description/i), 'Gloves')
      await user.type(expenses.getByLabelText(/^amount/i), '0')
      await user.click(expenses.getByRole('button', { name: /^add$/i }))
      expect(await expenses.findByText(/more than zero/i)).toBeInTheDocument()
      expect(api.addDailyExpense).not.toHaveBeenCalled()
    })

    // Phase 6's rule: a failed write keeps what was typed.
    it('keeps a typed expense on screen when the save fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.addDailyExpense).mockRejectedValue(new TypeError('Failed to fetch'))
      renderPanel()
      const expenses = within(await screen.findByRole('region', { name: /daily expenses/i }))
      await user.type(expenses.getByLabelText(/^description/i), 'Gloves')
      await user.type(expenses.getByLabelText(/^amount/i), '1200')
      await user.click(expenses.getByRole('button', { name: /^add$/i }))
      expect(await expenses.findByRole('alert')).toHaveTextContent(/you're offline/i)
      expect(expenses.getByLabelText(/^description/i)).toHaveValue('Gloves')
    })
  })

  describe('daily salary', () => {
    it('will not record salary without a dentist', async () => {
      const user = userEvent.setup()
      renderPanel()
      const salary = within(await screen.findByRole('region', { name: /daily salary/i }))
      await user.type(salary.getByLabelText(/^description/i), 'Day rate')
      await user.type(salary.getByLabelText(/^amount/i), '3000')
      await user.click(salary.getByRole('button', { name: /^add$/i }))
      expect(await salary.findByText(/choose the dentist/i)).toBeInTheDocument()
      expect(api.addSalaryEntry).not.toHaveBeenCalled()
    })

    it('records salary against the dentist chosen from staff', async () => {
      const user = userEvent.setup()
      renderPanel()
      const salary = within(await screen.findByRole('region', { name: /daily salary/i }))
      await waitFor(() => expect(salary.getByRole('option', { name: 'Dr Reyes' })).toBeInTheDocument())
      await user.selectOptions(salary.getByLabelText(/^dentist/i), 'd-2')
      await user.type(salary.getByLabelText(/^description/i), 'Day rate')
      await user.type(salary.getByLabelText(/^amount/i), '3000')
      await user.click(salary.getByRole('button', { name: /^add$/i }))
      await waitFor(() =>
        expect(api.addSalaryEntry).toHaveBeenCalledWith({
          dentistId: 'd-2',
          description: 'Day rate',
          amount: 3000,
        }),
      )
    })

    // The individual entries are not listed (clinic's choice): reception sees
    // the per-dentist table and nothing to open.
    it('does not list the individual salary entries for reception', async () => {
      vi.mocked(api.listSalaryEntries).mockResolvedValue([
        { ...expense({ id: 's-1', description: 'Morning', amount: 1500 }), dentist_id: 'd-1' },
        { ...expense({ id: 's-2', description: 'Afternoon', amount: 1500 }), dentist_id: 'd-1' },
      ])
      renderPanel('receptionist')
      const salary = within(await screen.findByRole('region', { name: /daily salary/i }))
      await salary.findByRole('table', { name: /salary and commission per dentist/i })
      expect(salary.queryByText('Morning')).not.toBeInTheDocument()
      expect(salary.queryByRole('list')).not.toBeInTheDocument()
      expect(salary.queryByRole('button', { name: /salary entries/i })).not.toBeInTheDocument()
    })

    // Hidden, not gone: it is the only way to fix a mistyped salary in the app.
    it('lets an admin open the salary entries to correct one', async () => {
      const user = userEvent.setup()
      vi.mocked(api.listSalaryEntries).mockResolvedValue([
        { ...expense({ id: 's-1', description: 'Morning', amount: 1500 }), dentist_id: 'd-1' },
        { ...expense({ id: 's-2', description: 'Afternoon', amount: 1500 }), dentist_id: 'd-1' },
      ])
      renderPanel('admin')
      const salary = within(await screen.findByRole('region', { name: /daily salary/i }))
      const toggle = await salary.findByRole('button', { name: /edit salary entries/i })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(salary.queryByText('Morning')).not.toBeInTheDocument()

      await user.click(toggle)
      expect(salary.getByRole('button', { name: /hide salary entries/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(salary.getByText('Morning')).toBeInTheDocument()
      expect(salary.getByRole('button', { name: /edit morning/i })).toBeInTheDocument()
      expect(salary.getByRole('button', { name: /delete afternoon/i })).toBeInTheDocument()
    })
  })

  describe('salary and commission, together', () => {
    /** The body rows of the per-dentist table, as [dentist, salary, commission, total]. */
    const payTable = async () => {
      const table = await screen.findByRole('table', { name: /salary and commission per dentist/i })
      return {
        table,
        rows: () =>
          [...table.querySelectorAll('tbody tr')].map((tr) =>
            [...tr.querySelectorAll('td')].map((td) => td.textContent),
          ),
        footer: () => [...table.querySelectorAll('tfoot td')].map((td) => td.textContent),
      }
    }

    it('is one section, not a salary section and a commission section', async () => {
      renderPanel()
      expect(await screen.findByRole('region', { name: /daily salary & commission/i })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /commission today/i })).not.toBeInTheDocument()
    })

    it("puts each dentist's salary, commission and total on one row", async () => {
      vi.mocked(api.listSalaryEntries).mockResolvedValue([
        { ...expense({ id: 's-1', description: 'Morning', amount: 1500 }), dentist_id: 'd-1' },
        { ...expense({ id: 's-2', description: 'Afternoon', amount: 1500 }), dentist_id: 'd-1' },
      ])
      vi.mocked(api.listCommissionByDentist).mockResolvedValue([
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: 500 },
        { dentist_id: 'd-2', dentist_name: 'Dr Reyes', commission_total: 250 },
      ])
      renderPanel()
      const { rows } = await payTable()
      await waitFor(() =>
        expect(rows()).toEqual([
          ['Dr Cruz', '₱3,000.00', '₱500.00', '₱3,500.00'],
          ['Dr Reyes', '₱0.00', '₱250.00', '₱250.00'],
        ]),
      )
    })

    // Dropping it would leave columns that no longer add up to the totals.
    it('lists commission no dentist is recorded against, last, rather than dropping it', async () => {
      vi.mocked(api.listCommissionByDentist).mockResolvedValue([
        { dentist_id: null, dentist_name: null, commission_total: 250 },
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: 500 },
      ])
      renderPanel()
      const { rows } = await payTable()
      await waitFor(() =>
        expect(rows().at(-1)).toEqual(['No dentist recorded', '₱0.00', '₱250.00', '₱250.00']),
      )
    })

    it('totals each column from the day’s figures', async () => {
      vi.mocked(api.getClinicDayTotals).mockResolvedValue({
        business_date: '2026-09-15',
        revenue_total: 5000,
        expense_total: 0,
        salary_total: 3000,
        commission_total: 750,
      })
      vi.mocked(api.listCommissionByDentist).mockResolvedValue([
        { dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: 750 },
      ])
      renderPanel()
      const { footer } = await payTable()
      expect(footer()).toEqual(['Total', '₱3,000.00', '₱750.00', '₱3,750.00'])
    })

    it('asks for today’s breakdown', async () => {
      renderPanel()
      await screen.findByRole('region', { name: /daily salary & commission/i })
      await waitFor(() =>
        expect(api.listCommissionByDentist).toHaveBeenCalledWith(
          vi.mocked(api.listDailyExpenses).mock.calls[0][0],
        ),
      )
    })

    // Unknown must not read as none, and the rest of the day must keep working.
    it('shows commission as unknown per dentist when the breakdown cannot be loaded', async () => {
      vi.mocked(api.listCommissionByDentist).mockRejectedValue(new Error('permission denied'))
      vi.mocked(api.listSalaryEntries).mockResolvedValue([
        { ...expense({ id: 's-1', description: 'Day rate', amount: 3000 }), dentist_id: 'd-1' },
      ])
      renderPanel()
      expect(await screen.findByText(/breakdown per dentist could not be loaded/i)).toBeInTheDocument()
      const { rows, footer } = await payTable()
      await waitFor(() => expect(rows()).toEqual([['Dr Cruz', '₱3,000.00', '—', '—']]))
      expect(footer()[2]).toBe('₱750.00')
      expect(screen.getByRole('button', { name: /close clinic/i })).toBeInTheDocument()
    })
  })

  describe('who may change an entry', () => {
    it('never offers reception edit or delete', async () => {
      vi.mocked(api.listDailyExpenses).mockResolvedValue([expense()])
      renderPanel('receptionist')
      await screen.findByText('Gloves')
      expect(screen.queryByRole('button', { name: /edit gloves/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /delete gloves/i })).not.toBeInTheDocument()
    })

    it('lets an admin edit an entry while the day is open', async () => {
      const user = userEvent.setup()
      vi.mocked(api.listDailyExpenses).mockResolvedValue([expense()])
      renderPanel('admin')
      await user.click(await screen.findByRole('button', { name: /edit gloves/i }))
      const amount = screen.getByLabelText(/edit amount/i)
      await user.clear(amount)
      await user.type(amount, '1100')
      await user.click(screen.getByRole('button', { name: /^save$/i }))
      await waitFor(() =>
        expect(api.updateDailyExpense).toHaveBeenCalledWith('e-1', { description: 'Gloves', amount: 1100 }),
      )
    })

    it('lets an admin delete an entry after confirming', async () => {
      const user = userEvent.setup()
      vi.mocked(api.listDailyExpenses).mockResolvedValue([expense()])
      renderPanel('admin')
      await user.click(await screen.findByRole('button', { name: /delete gloves/i }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
      await waitFor(() => expect(api.deleteDailyExpense).toHaveBeenCalledWith('e-1'))
    })
  })

  describe('Close Clinic', () => {
    it('closes the day after confirming, then downloads the report', async () => {
      const user = userEvent.setup()
      renderPanel()
      await user.click(await screen.findByRole('button', { name: /close clinic/i }))
      expect(api.closeClinicDay).not.toHaveBeenCalled()
      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent(/admin included/i)
      await user.click(within(dialog).getByRole('button', { name: /close clinic/i }))
      await waitFor(() => expect(api.closeClinicDay).toHaveBeenCalled())
      await waitFor(() =>
        expect(pdf.downloadClinicDayReport).toHaveBeenCalledWith(REPORT, 'ToothCo Dental Clinic'),
      )
    })

    it('says the day is closed even when only the download fails', async () => {
      const user = userEvent.setup()
      vi.mocked(pdf.downloadClinicDayReport).mockImplementation(() => {
        throw new Error('disk full')
      })
      renderPanel()
      await user.click(await screen.findByRole('button', { name: /close clinic/i }))
      const dialog = await screen.findByRole('dialog')
      vi.mocked(api.getClinicDay).mockResolvedValue({
        id: 'c-1',
        business_date: '2026-09-15',
        closed_at: REPORT.closed_at,
        closed_by: 's-1',
        report: REPORT,
      })
      await user.click(within(dialog).getByRole('button', { name: /close clinic/i }))
      expect(await screen.findByText(/could not be downloaded/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /download report/i })).toBeInTheDocument()
    })
  })

  describe('a closed day', () => {
    beforeEach(() => {
      vi.mocked(api.getClinicDay).mockResolvedValue({
        id: 'c-1',
        business_date: '2026-09-15',
        closed_at: REPORT.closed_at,
        closed_by: 's-1',
        report: REPORT,
      })
      vi.mocked(api.listDailyExpenses).mockResolvedValue([expense()])
    })

    // The screen and the PDF must say the same thing: a closed day shows the
    // breakdown frozen at closing, even if the live attribution has moved.
    it('shows the per-dentist commission frozen at closing, not the live one', async () => {
      vi.mocked(api.getClinicDay).mockResolvedValue({
        id: 'c-1',
        business_date: '2026-09-15',
        closed_at: REPORT.closed_at,
        closed_by: 's-1',
        report: {
          ...REPORT,
          commission_by_dentist: [{ dentist_id: 'd-1', dentist_name: 'Dr Cruz', commission_total: 750 }],
        },
      })
      vi.mocked(api.listCommissionByDentist).mockResolvedValue([
        { dentist_id: 'd-2', dentist_name: 'Dr Reyes', commission_total: 750 },
      ])
      renderPanel()
      const table = await screen.findByRole('table', { name: /salary and commission per dentist/i })
      // Let the live breakdown arrive, so this cannot pass by asserting early.
      await waitFor(() => expect(api.listCommissionByDentist).toHaveBeenCalled())
      await new Promise((r) => setTimeout(r, 0))
      expect(table).toHaveTextContent('Dr Cruz')
      expect(table).not.toHaveTextContent('Dr Reyes')
    })

    // A day closed before 0022 never froze one, so the live list stands in.
    it('falls back to the live breakdown for a day closed before it was frozen', async () => {
      vi.mocked(api.listCommissionByDentist).mockResolvedValue([
        { dentist_id: 'd-2', dentist_name: 'Dr Reyes', commission_total: 750 },
      ])
      renderPanel()
      expect(
        await screen.findByRole('table', { name: /salary and commission per dentist/i }),
      ).toHaveTextContent('Dr Reyes')
    })

    it('takes nothing more, from anyone — admin included', async () => {
      renderPanel('admin')
      await screen.findByRole('region', { name: /clinic closed/i })
      expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /edit gloves/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /delete gloves/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /salary entries/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /close clinic/i })).not.toBeInTheDocument()
    })

    // A re-download is the frozen report, not a recount.
    it('downloads the report as it was closed', async () => {
      const user = userEvent.setup()
      renderPanel()
      await user.click(await screen.findByRole('button', { name: /download report/i }))
      await waitFor(() =>
        expect(pdf.downloadClinicDayReport).toHaveBeenCalledWith(REPORT, 'ToothCo Dental Clinic'),
      )
    })

    it('shows the closing figures rather than the live ones', async () => {
      // The live figures have moved on since closing; the closed day must not.
      vi.mocked(api.getClinicDayTotals).mockResolvedValue({
        business_date: '2026-09-15',
        revenue_total: 9000,
        expense_total: 0,
        salary_total: 0,
        commission_total: 999,
      })
      renderPanel()
      const pay = await screen.findByRole('region', { name: /daily salary & commission/i })
      // Frozen salary + commission is 3,000 + 750; live would be 0 + 999.
      expect(pay).toHaveTextContent('₱3,750.00')
      expect(pay).not.toHaveTextContent('₱999.00')
      // The row and the section total: the total is the frozen 1,200, not the live 0.
      expect(within(section(/daily expenses/i)).getAllByText('₱1,200.00')).toHaveLength(2)
    })
  })
})
