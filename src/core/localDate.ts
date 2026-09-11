/** The calendar date as the clinic would write it, in the machine's own
 *  timezone.
 *
 *  `toISOString().slice(0, 10)` is the tempting one-liner and it is wrong
 *  here: it yields the **UTC** date. The clinic runs at UTC+8, so every
 *  local time before 08:00 falls on the previous UTC day — a recall horizon
 *  built that way silently drops a day's worth of patients, and a day sheet
 *  built that way puts the evening's appointments on tomorrow's page.
 *
 *  Keep this the single definition. It existed as a copy in two components
 *  before, which is how the third caller came to use toISOString() instead. */
export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
