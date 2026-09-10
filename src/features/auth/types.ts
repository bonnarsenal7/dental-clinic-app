export type StaffRole = 'dentist' | 'receptionist' | 'admin'

export interface StaffProfile {
  id: string
  name: string
  email: string
  role: StaffRole
  active: boolean
  created_at: string
}
