import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import Button from '../../core/components/ui/Button'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import { Dialog, DialogClose } from '../../core/components/ui/Dialog'
import { PageHeader } from '../../core/components/ui/Page'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'
import { ErrorState, LoadingState } from '../../core/components/states'
import { toastSaved } from '../../core/components/ui/toast'
import { toMessage } from '../../core/errors'
import { toLocalDateString } from '../../core/localDate'
import { listDentists } from '../scheduling/api'
import { addShift, listRoster, removeShift } from './api'
import { formatDayLong, formatShiftRange, groupByDate, isInMonth, monthGrid, monthLabel } from './rosterWeek'
import type { DentistShift } from './types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface ShiftForm {
  dentist_id: string
  starts_at: string
  ends_at: string
  note: string
}

/** The roster: a month to tap a date on, and that day's cover beneath it.
 *
 *  Admin only — the module, the nav link and the route (App.tsx), matching
 *  the RLS on dentist_shifts (0025). Everyone else reads the week from their
 *  dashboard. */
export default function RosterPage() {
  // The month on screen, and the day whose dialog is open — null when none
  // is. Separate, so paging months does not move the day being edited.
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const [shifts, setShifts] = useState<DentistShift[] | null>(null)
  const [dentists, setDentists] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<DentistShift | null>(null)

  const grid = useMemo(() => monthGrid(anchor), [anchor])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      // The visible grid, not the calendar month: the first and last rows
      // spill into the neighbouring months and must not look empty.
      setShifts(await listRoster(grid[0], grid[grid.length - 1]))
    } catch (e) {
      setError(toMessage(e))
    }
  }, [grid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    listDentists()
      .then(setDentists)
      .catch((e) => setError(toMessage(e)))
  }, [])

  const byDate = useMemo(() => groupByDate(shifts ?? []), [shifts])
  const today = toLocalDateString(new Date())
  const selectedShifts = selected ? (byDate[selected] ?? []) : []

  function moveMonth(by: number) {
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + by, 1))
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dentist roster"
        description="Who is in the clinic, and for which part of the day. Reception and each dentist see the current week on their dashboard."
        actions={
          <>
            <Button variant="secondary" aria-label="Previous month" onClick={() => moveMonth(-1)}>
              ‹
            </Button>
            <span className="text-sm font-medium text-slate-700 min-w-36 text-center">
              {monthLabel(anchor)}
            </span>
            <Button variant="secondary" aria-label="Next month" onClick={() => moveMonth(1)}>
              ›
            </Button>
            <Button variant="subtle" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={() => void refresh()} />}

      {shifts === null ? (
        <LoadingState label="Loading the roster…" />
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium uppercase text-slate-400 pb-1">
                {day}
              </div>
            ))}
            {grid.map((date) => {
              const onThatDay = byDate[date] ?? []
              const inMonth = isInMonth(date, anchor)
              const isOpen = date === selected
              return (
                <button
                  key={date}
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={`${formatDayLong(date)} — ${
                    onThatDay.length === 0
                      ? 'nobody rostered'
                      : `${onThatDay.length} ${onThatDay.length === 1 ? 'dentist' : 'dentists'} rostered`
                  }`}
                  onClick={() => setSelected(date)}
                  className={`min-h-16 rounded-lg border p-1.5 text-left transition-colors ${
                    isOpen
                      ? 'border-gold-700 bg-gold-100'
                      : 'border-slate-200 hover:bg-slate-50 focus-visible:bg-slate-50'
                  } ${inMonth ? '' : 'opacity-40'}`}
                >
                  <span
                    className={`text-xs tabular-nums ${
                      date === today ? 'font-bold text-gold-800' : 'text-slate-500'
                    }`}
                  >
                    {Number(date.slice(8))}
                  </span>
                  <span className="mt-0.5 flex flex-col gap-0.5">
                    {onThatDay.slice(0, 2).map((shift) => (
                      <span key={shift.id} className="truncate text-[11px] leading-tight text-slate-700">
                        {shift.dentist_name}
                      </span>
                    ))}
                    {onThatDay.length > 2 && (
                      <span className="text-[11px] leading-tight text-slate-400">
                        +{onThatDay.length - 2} more
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        size="lg"
        title={selected ? formatDayLong(selected) : ''}
        description="Who is in the clinic, and for which hours."
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Done</Button>
          </DialogClose>
        }
      >
        {selectedShifts.length === 0 ? (
          <p className="text-sm text-slate-400">Nobody is rostered for this day yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {selectedShifts.map((shift) => (
              <li
                key={shift.id}
                className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-2 first:border-t-0 first:pt-0"
              >
                <span className="text-sm text-slate-700">
                  <span className="font-medium">{shift.dentist_name}</span>
                  <span className="text-slate-500"> · {formatShiftRange(shift)}</span>
                  {shift.note && <span className="text-slate-400"> · {shift.note}</span>}
                </span>
                <Button
                  size="sm"
                  variant="subtle"
                  aria-label={`Remove ${shift.dentist_name} from ${formatDayLong(shift.shift_date)}`}
                  onClick={() => setRemoving(shift)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* The dialog stays open afterwards: a day usually needs more than
            one dentist, and closing after each would make assigning three of
            them three trips through the calendar. */}
        <AssignForm
          dentists={dentists}
          onAdd={async (values) => {
            if (!selected) return
            await addShift({
              dentist_id: values.dentist_id,
              shift_date: selected,
              starts_at: values.starts_at,
              ends_at: values.ends_at,
              note: values.note.trim() || null,
            })
            await refresh()
            toastSaved('Added to the roster', formatDayLong(selected))
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title="Remove this shift?"
        description={
          removing
            ? `${removing.dentist_name}, ${formatShiftRange(removing)} on ${formatDayLong(removing.shift_date)}. Booked appointments are not affected — the roster records cover, it does not hold the diary.`
            : ''
        }
        confirmLabel="Remove"
        tone="destructive"
        onConfirm={async () => {
          if (!removing) return
          await removeShift(removing.id)
          await refresh()
          setRemoving(null)
        }}
      />
    </div>
  )
}

/** Assigning one dentist to part of the selected day.
 *
 *  Its own component so the form state resets cleanly, and so the error from
 *  a refused overlap renders beside the fields that caused it rather than at
 *  the top of the screen. */
function AssignForm({
  dentists,
  onAdd,
}: {
  dentists: { id: string; name: string }[]
  onAdd: (values: ShiftForm) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ShiftForm>({
    defaultValues: { dentist_id: '', starts_at: '09:00', ends_at: '17:00', note: '' },
  })

  async function onSubmit(values: ShiftForm) {
    // The layer a `required` rule cannot reach. The database refuses this
    // too (dentist_shifts_time_order); saying so here saves the round trip.
    if (values.ends_at <= values.starts_at) {
      setError('The finish time has to be after the start time.')
      return
    }
    setError(null)
    try {
      await onAdd(values)
      // After the awaited write, never before: a failure must leave the
      // hours on screen rather than clearing them (Phase 6). The times are
      // kept deliberately — a second dentist usually covers the same hours.
      reset({ dentist_id: '', starts_at: values.starts_at, ends_at: values.ends_at, note: '' })
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3 border-t border-slate-100 pt-4"
    >
      {error && <ErrorState message={error} />}
      <div className="flex items-end gap-2 flex-wrap">
        <Field label="Dentist" error={errors.dentist_id?.message} className="min-w-48">
          <NativeSelect {...register('dentist_id', { required: 'Choose a dentist' })}>
            <option value="">— choose a dentist —</option>
            {dentists.map((dentist) => (
              <option key={dentist.id} value={dentist.id}>
                {dentist.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="From" error={errors.starts_at?.message}>
          <TextInput type="time" {...register('starts_at', { required: 'Enter a start time' })} />
        </Field>
        <Field label="To" error={errors.ends_at?.message}>
          <TextInput type="time" {...register('ends_at', { required: 'Enter a finish time' })} />
        </Field>
        <Field label="Note" className="min-w-40">
          <TextInput {...register('note')} placeholder="Half day, cover… (optional)" />
        </Field>
        <Button type="submit" disabled={isSubmitting || dentists.length === 0}>
          {isSubmitting ? 'Adding…' : 'Add to roster'}
        </Button>
      </div>
      {dentists.length === 0 && (
        <p className="text-xs text-slate-500">
          No active dentists to assign. Add one at <span className="font-medium">Staff</span> first.
        </p>
      )}
      <p className="text-xs text-slate-400">
        Cover only. Booking is unaffected — a dentist can still be given an appointment outside the hours
        recorded here.
      </p>
    </form>
  )
}
