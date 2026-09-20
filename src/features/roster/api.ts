import { supabase } from '../../core/supabaseClient'
import type { DentistShift, NewShift } from './types'

/** Translates the database's own refusals into something an admin can act on.
 *
 *  The rules are in Postgres (0025), not in this form, so the message has to
 *  be readable when it comes back — the constraint name is not. */
function rosterMessage(message: string): string {
  if (message.includes('dentist_shifts_no_overlap')) {
    return 'That dentist is already rostered for part of those hours. Remove or change the other shift first.'
  }
  if (message.includes('dentist_shifts_time_order')) {
    return 'The finish time has to be after the start time.'
  }
  return message
}

/** The roster between two dates, with dentist names.
 *
 *  Through roster_for_range() rather than a select, because reception and
 *  dentists cannot read `staff` — the same reason listDentists() goes
 *  through bookable_dentists(). */
export async function listRoster(from: string, to: string): Promise<DentistShift[]> {
  const { data, error } = await supabase.rpc('roster_for_range', { p_from: from, p_to: to })
  if (error) throw new Error(rosterMessage(error.message))
  return (data ?? []) as DentistShift[]
}

/** Admin only, enforced by RLS. `created_by` and `created_at` are set by the
 *  guard trigger, so they are deliberately not sent. */
export async function addShift(shift: NewShift): Promise<void> {
  const { error } = await supabase.from('dentist_shifts').insert(shift)
  if (error) throw new Error(rosterMessage(error.message))
}

export async function removeShift(id: string): Promise<void> {
  const { error } = await supabase.from('dentist_shifts').delete().eq('id', id)
  if (error) throw new Error(rosterMessage(error.message))
}
