import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { StaffRole } from '../auth/types'
import Button from '../../core/components/ui/Button'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import { ErrorState, LoadingState } from '../../core/components/states'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'
import { toMessage } from '../../core/errors'
import { toLocalDateString } from '../../core/localDate'
import { formatMoney } from '../billing/ledger'
import { listDentists } from '../scheduling/api'
import {
  addDailyExpense,
  addSalaryEntry,
  closeClinicDay,
  deleteDailyExpense,
  deleteSalaryEntry,
  getClinicDay,
  getClinicDayTotals,
  getClinicName,
  listDailyExpenses,
  listSalaryEntries,
  updateDailyExpense,
  updateSalaryEntry,
} from './api'
import DailyEntryList from './DailyEntryList'
import { groupSalariesByDentist } from './reportSections'
import type { ClinicDay, ClinicDayReport, ClinicDayTotals, DailyExpense, SalaryEntry } from './types'

interface DayData {
  date: string
  expenses: DailyExpense[]
  salaries: SalaryEntry[]
  day: ClinicDay | null
  totals: ClinicDayTotals
}

/** The front desk's end of day: expenses, salary, the commission line, and
 *  Close Clinic. Everything here is today's; the database decides what today
 *  is and refuses writes once it is closed (0020). */
export default function DailyClosePanel({ staff }: { staff: { id: string; role: StaffRole } }) {
  const [data, setData] = useState<DayData | null>(null)
  const [dentists, setDentists] = useState<{ id: string; name: string }[]>([])
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)

  const refresh = useCallback(async () => {
    const date = toLocalDateString(new Date())
    try {
      const [expenses, salaries, day, totals] = await Promise.all([
        listDailyExpenses(date),
        listSalaryEntries(date),
        getClinicDay(date),
        getClinicDayTotals(date),
      ])
      setData({ date, expenses, salaries, day, totals })
      setError(null)
    } catch (e) {
      setError(toMessage(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    // The same list the booking and seating dialogs use: reception cannot
    // read the staff table itself (0002), and bookable_dentists() hands them
    // id and name only (0011).
    listDentists()
      .then(setDentists)
      .catch((e) => setError(toMessage(e)))
    getClinicName()
      .then(setClinicName)
      .catch(() => setClinicName(null))
  }, [])

  const dentistName = useMemo(() => new Map(dentists.map((d) => [d.id, d.name])), [dentists])

  async function download(report: ClinicDayReport) {
    try {
      // On demand: jsPDF is the heaviest thing in the app, needed once a day.
      const { downloadClinicDayReport } = await import('./eodReportPdf')
      downloadClinicDayReport(report, clinicName)
    } catch (e) {
      setError(`The report could not be downloaded (${toMessage(e)}). Use Download report to try again.`)
    }
  }

  if (!data) {
    return error ? (
      <ErrorState message={error} onRetry={() => void refresh()} />
    ) : (
      <LoadingState label="Loading today's close…" />
    )
  }

  const closed = data.day !== null
  // Reception adds and never edits; an admin edits until the day is closed.
  const canManage = staff.role === 'admin' && !closed
  const figures = closed ? data.day!.report : data.totals
  const salaryRows = data.salaries.map((s) => ({ ...s, dentist_name: dentistName.get(s.dentist_id) ?? null }))

  return (
    <div className="flex flex-col gap-6" aria-label="End of day">
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {closed && (
        <section
          className="rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
          aria-label="Clinic closed"
        >
          <p className="text-sm text-slate-700">
            <span className="font-semibold">Clinic closed</span> at{' '}
            {new Date(data.day!.closed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {data.day!.report.closed_by_name ? ` by ${data.day!.report.closed_by_name}` : ''}. Today's
            expenses, salary and commission are locked.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void download(data.day!.report)}>
            Download report
          </Button>
        </section>
      )}

      <section
        aria-labelledby="daily-expenses-heading"
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="daily-expenses-heading" className="text-sm font-semibold text-slate-700">
            Daily expenses
          </h2>
          <span className="text-sm tabular-nums text-slate-700">{formatMoney(figures.expense_total)}</span>
        </div>
        <DailyEntryList
          noun="expense"
          canManage={canManage}
          emptyText="No expenses recorded today."
          entries={data.expenses}
          onSave={async (id, patch) => {
            await updateDailyExpense(id, patch)
            await refresh()
          }}
          onDelete={async (id) => {
            await deleteDailyExpense(id)
            await refresh()
          }}
        />
        {!closed && <ExpenseForm onAdded={refresh} />}
      </section>

      <section
        aria-labelledby="daily-salary-heading"
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id="daily-salary-heading" className="text-sm font-semibold text-slate-700">
            Daily salary
          </h2>
          <span className="text-sm tabular-nums text-slate-700">{formatMoney(figures.salary_total)}</span>
        </div>
        <DailyEntryList
          noun="salary entry"
          canManage={canManage}
          emptyText="No salary recorded today."
          entries={salaryRows.map((s) => ({ ...s, detail: s.dentist_name ?? 'Dentist no longer listed' }))}
          onSave={async (id, patch) => {
            await updateSalaryEntry(id, patch)
            await refresh()
          }}
          onDelete={async (id) => {
            await deleteSalaryEntry(id)
            await refresh()
          }}
        />
        {salaryRows.length > 0 && (
          <p className="text-xs text-slate-500">
            {groupSalariesByDentist(salaryRows)
              .map((g) => `${g.dentistName} ${formatMoney(g.subtotal)}`)
              .join(' · ')}
          </p>
        )}
        {!closed && <SalaryForm dentists={dentists} onAdded={refresh} />}
      </section>

      <section
        aria-labelledby="daily-commission-heading"
        className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex items-center justify-between gap-3 flex-wrap"
      >
        <div>
          <h2 id="daily-commission-heading" className="text-sm font-semibold text-slate-700">
            Commission today
          </h2>
          <p className="text-xs text-slate-500">Added up from the commission on today's invoices.</p>
        </div>
        <span className="text-lg font-semibold tabular-nums text-slate-800">
          {formatMoney(figures.commission_total)}
        </span>
      </section>

      {!closed && (
        <section className="flex flex-col items-start gap-2 border-t border-slate-200 pt-6">
          <Button onClick={() => setConfirmingClose(true)}>Close Clinic</Button>
          <p className="text-xs text-slate-500">
            Downloads today's end-of-day report and locks today's expenses, salary and commission — for
            everyone, admin included.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={confirmingClose}
        onOpenChange={setConfirmingClose}
        title="Close the clinic for today?"
        description={`Revenue ${formatMoney(data.totals.revenue_total)}, expenses ${formatMoney(
          data.totals.expense_total,
        )}, salary ${formatMoney(data.totals.salary_total)}, net ${formatMoney(
          data.totals.revenue_total - data.totals.expense_total - data.totals.salary_total,
        )}. Once closed, nobody — admin included — can add or change today's expenses, salary or commission, and the app cannot reopen the day.`}
        confirmLabel="Close Clinic"
        tone="destructive"
        onConfirm={async () => {
          const report = await closeClinicDay()
          setConfirmingClose(false)
          await refresh()
          await download(report)
        }}
      />
    </div>
  )
}

function ExpenseForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ description: string; amount: string }>({ defaultValues: { description: '', amount: '' } })

  async function onSubmit(values: { description: string; amount: string }) {
    setSaveError(null)
    try {
      await addDailyExpense({ description: values.description.trim(), amount: Number(values.amount) })
      // After the awaited write, inside the try: a failed save keeps what
      // was typed.
      reset()
      await onAdded()
    } catch (e) {
      setSaveError(toMessage(e))
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-2 border-t border-slate-100 pt-3"
      aria-label="Add an expense"
    >
      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Description" error={errors.description?.message} className="flex-1 min-w-[160px]">
          <TextInput
            {...register('description', { validate: (v) => v.trim() !== '' || 'Say what the expense was.' })}
            placeholder="e.g. Gloves, courier"
          />
        </Field>
        <Field label="Amount" error={errors.amount?.message}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            {...register('amount', {
              required: 'Enter an amount.',
              validate: (v) => Number(v) > 0 || 'An amount must be more than zero.',
            })}
            className="w-32 text-right"
          />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {saveError && <ErrorState message={saveError} />}
    </form>
  )
}

function SalaryForm({
  dentists,
  onAdded,
}: {
  dentists: { id: string; name: string }[]
  onAdded: () => Promise<void>
}) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ dentist_id: string; description: string; amount: string }>({
    defaultValues: { dentist_id: '', description: '', amount: '' },
  })

  async function onSubmit(values: { dentist_id: string; description: string; amount: string }) {
    setSaveError(null)
    try {
      await addSalaryEntry({
        dentistId: values.dentist_id,
        description: values.description.trim(),
        amount: Number(values.amount),
      })
      reset()
      await onAdded()
    } catch (e) {
      setSaveError(toMessage(e))
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-2 border-t border-slate-100 pt-3"
      aria-label="Add a salary entry"
    >
      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Dentist" error={errors.dentist_id?.message}>
          <NativeSelect {...register('dentist_id', { required: 'Choose the dentist.' })}>
            <option value="">— choose —</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Description" error={errors.description?.message} className="flex-1 min-w-[160px]">
          <TextInput
            {...register('description', { validate: (v) => v.trim() !== '' || 'Say what the payment was.' })}
            placeholder="e.g. Day rate"
          />
        </Field>
        <Field label="Amount" error={errors.amount?.message}>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            {...register('amount', {
              required: 'Enter an amount.',
              validate: (v) => Number(v) > 0 || 'An amount must be more than zero.',
            })}
            className="w-32 text-right"
          />
        </Field>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {saveError && <ErrorState message={saveError} />}
    </form>
  )
}
