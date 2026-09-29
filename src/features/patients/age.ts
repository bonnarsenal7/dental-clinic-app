import type { Patient } from './types'

/** Age from the birthday when there is one, because the stored `age` was
 *  true on the day somebody typed it and has been drifting since. */
export function ageOf(patient: Pick<Patient, 'birthday' | 'age'>, today = new Date()): number | null {
  if (!patient.birthday) return patient.age ?? null
  const born = new Date(`${patient.birthday}T00:00:00`)
  if (Number.isNaN(born.getTime())) return patient.age ?? null
  let years = today.getFullYear() - born.getFullYear()
  const monthDiff = today.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) years -= 1
  return years >= 0 ? years : (patient.age ?? null)
}
