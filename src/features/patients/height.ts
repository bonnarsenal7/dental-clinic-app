/** Height is chosen in feet and inches, as patients state it, but stored in
 *  centimetres — the unit every row already held before the dropdown, so no
 *  migration and no mix of units in one column. Each option's value is the
 *  centimetre figure to one decimal, which converts back to the same inch
 *  exactly. */

const CM_PER_INCH = 2.54
const MIN_INCHES = 36 // 3'0"
const MAX_INCHES = 94 // 7'10"

function inchesToCm(inches: number): string {
  return (inches * CM_PER_INCH).toFixed(1)
}

function feetAndInches(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

export const HEIGHT_OPTIONS = Array.from({ length: MAX_INCHES - MIN_INCHES + 1 }, (_, i) => {
  const inches = MIN_INCHES + i
  return { value: inchesToCm(inches), label: feetAndInches(inches) }
})

/** Snaps a stored centimetre value to the dropdown option it belongs to, so
 *  a record entered as "162" before the dropdown existed opens on 5'4"
 *  rather than on a blank select that would save as no height at all.
 *  Outside the range it is returned untouched; the form keeps it as an
 *  extra option. */
export function toHeightOption(cm: string): string {
  const n = Number(cm)
  if (cm.trim() === '' || !Number.isFinite(n)) return cm
  const inches = Math.round(n / CM_PER_INCH)
  return inches >= MIN_INCHES && inches <= MAX_INCHES ? inchesToCm(inches) : cm
}

/** "5'10"" for a stored centimetre value; "—" when there is none. */
export function formatHeight(cm: number | string | null | undefined): string {
  if (cm === null || cm === undefined || String(cm).trim() === '') return '—'
  const n = Number(cm)
  if (!Number.isFinite(n)) return String(cm)
  return feetAndInches(Math.round(n / CM_PER_INCH))
}
