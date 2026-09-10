import { supabase } from '../../core/supabaseClient'
import type { StaffProfile, StaffRole } from '../auth/types'

export async function listStaff(): Promise<StaffProfile[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, email, role, active, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data as StaffProfile[]
}

export async function createStaff(input: { name: string; email: string; role: StaffRole }) {
  const { data, error } = await supabase.functions.invoke<{
    staffId: string
    tempPassword: string
    note: string
  }>('manage-staff', { body: { action: 'create', ...input } })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('No response from server')
  return data
}

export async function deactivateStaff(staffId: string) {
  const { data, error } = await supabase.functions.invoke<{ ok: true }>('manage-staff', {
    body: { action: 'deactivate', staffId },
  })
  if (error) throw new Error(error.message)
  return data
}
