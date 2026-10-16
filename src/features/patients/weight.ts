/** Weight is chosen in half-kilogram steps, in kilograms — the unit the
 *  column has always held, so every value already stored matches an option
 *  as it stands. Values are written the way the database hands them back
 *  ("52", "52.5"), or a stored weight would not find its option on edit. */

const MIN_KG = 10
const MAX_KG = 100

export const WEIGHT_OPTIONS = Array.from({ length: (MAX_KG - MIN_KG) * 2 + 1 }, (_, i) => {
  const kg = String(MIN_KG + i / 2)
  return { value: kg, label: `${kg} kg` }
})

/** "52 kg" for a stored value; "—" when there is none. */
export function formatWeight(kg: number | string | null | undefined): string {
  if (kg === null || kg === undefined || String(kg).trim() === '') return '—'
  return `${kg} kg`
}
