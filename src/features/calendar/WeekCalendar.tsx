import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '../../core/components/ui/Page'
import { ErrorState, LoadingState } from '../../core/components/states'
import { toMessage } from '../../core/errors'
import { toLocalDateString } from '../../core/localDate'
import { listRoster } from './api'
import { formatShiftRange, groupByDate, startOfWeek, weekDates } from './calendarWeek'
import type { DentistShift } from './types'

/** This week's cover, read-only.
 *
 *  Reception gets the whole clinic's week; a dentist gets their own, which
 *  is the same presentation scope their patient list and Today's Patient
 *  table already use — dentist_shifts is readable by all active staff
 *  (0025), so this is a screen decision, not a boundary.
 *
 *  It fetches on its own rather than through the dashboard's refresh, so a
 *  calendar that fails to load costs this panel and nothing else. */
export default function WeekCalendar({ dentistId }: { dentistId?: string }) {
  const [shifts, setShifts] = useState<DentistShift[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => weekDates(startOfWeek(new Date())), [])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const week = await listRoster(days[0], days[6])
      setShifts(dentistId ? week.filter((shift) => shift.dentist_id === dentistId) : week)
    } catch (e) {
      setError(toMessage(e))
    }
  }, [days, dentistId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const byDate = useMemo(() => groupByDate(shifts ?? []), [shifts])
  const today = toLocalDateString(new Date())

  return (
    <Card title={dentistId ? 'Your week' : "This week's dentists"}>
      {error && <ErrorState message={error} onRetry={() => void refresh()} />}
      {!error && shifts === null && <LoadingState label="Loading the calendar…" />}
      {!error && shifts !== null && (
        <>
          {shifts.length === 0 && (
            <p className="text-sm text-slate-400">
              {dentistId
                ? 'You are not on the calendar this week.'
                : 'Nobody is assigned this week yet — an admin sets the calendar.'}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-7">
            {days.map((date) => {
              const onThatDay = byDate[date] ?? []
              const isToday = date === today
              return (
                <div
                  key={date}
                  className={`rounded-lg border p-2 ${
                    isToday ? 'border-gold-700 bg-gold-50' : 'border-slate-200'
                  }`}
                >
                  <p className={`text-xs font-medium ${isToday ? 'text-gold-800' : 'text-slate-500'}`}>
                    {new Date(`${date}T00:00:00`).toLocaleDateString([], {
                      weekday: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  {onThatDay.length === 0 ? (
                    <p className="mt-1 text-xs text-slate-300">—</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {onThatDay.map((shift) => (
                        <li key={shift.id} className="text-xs leading-tight">
                          {/* The dentist's own week already knows whose it
                              is, so it shows the hours alone. */}
                          {!dentistId && <span className="block text-slate-700">{shift.dentist_name}</span>}
                          <span className="block tabular-nums text-slate-500">{formatShiftRange(shift)}</span>
                          {shift.note && <span className="block text-slate-400">{shift.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}
