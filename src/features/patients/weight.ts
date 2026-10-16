/** Weight is chosen in whole kilograms, the unit the column has always held,
 *  so every value already stored matches an option as it stands. */

const MIN_KG = 20
const MAX_KG = 100

export const WEIGHT_OPTIONS = Array.from({ length: MAX_KG - MIN_KG + 1 }, (_, i) => {
  const kg = String(MIN_KG + i)
  return { value: kg, label: `${kg} kg` }
})

/** "52 kg" for a stored value; "—" when there is none. */
export function formatWeight(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined || String(kg).trim() === '') return '—'
  return `${kg} kg`
}
