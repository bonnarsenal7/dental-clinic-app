/** Where the patient intake screen is served from.
 *
 *  The same build runs at two addresses. Staff use the main one; a patient
 *  typing their own registration uses this one. Browsers keep sign-ins per
 *  address, so a tab here has no staff session to fall back on — changing
 *  the URL takes the patient nowhere, because there is nowhere signed in to
 *  go (0026_patient_intake.sql).
 *
 *  In development, set VITE_INTAKE_ORIGIN, or leave it and use
 *  http://127.0.0.1:<port>: to a browser that is a different address from
 *  http://localhost:<port>, which is exactly the separation production has. */
const PRODUCTION_INTAKE_ORIGIN = 'https://toothco-intake.vercel.app'

export function intakeOrigin(): string {
  const configured = import.meta.env.VITE_INTAKE_ORIGIN as string | undefined
  if (configured) return configured.replace(/\/+$/, '')
  if (import.meta.env.DEV) return `http://127.0.0.1:${window.location.port}`
  return PRODUCTION_INTAKE_ORIGIN
}

export function isIntakeHost(origin: string = window.location.origin): boolean {
  return origin === intakeOrigin()
}

/** The code travels in the fragment, not the path or the query: a fragment
 *  is never sent to the server, so it is not in Vercel's request logs — and
 *  the page needs no rewrite to be reachable at a deep URL. */
export function intakeUrl(code: string, device: IntakeDevice = 'tablet'): string {
  return `${intakeOrigin()}/#${device === 'phone' ? PHONE_MARK : ''}${encodeURIComponent(code)}`
}

/** Where the form is being filled in. The clinic tablet is handed back to
 *  reception afterwards; a patient's own phone is not, so what the form says
 *  when it is done — and whether it can close its own tab — differs. */
export type IntakeDevice = 'tablet' | 'phone'

/** Codes are base64url (letters, digits, `-`, `_`), so a colon cannot be
 *  part of one and the marker is unambiguous. */
const PHONE_MARK = 'phone:'

export function readIntakeHash(hash: string = window.location.hash): { code: string; device: IntakeDevice } {
  const raw = decodeURIComponent(hash.replace(/^#/, '')).trim()
  return raw.startsWith(PHONE_MARK)
    ? { code: raw.slice(PHONE_MARK.length).trim(), device: 'phone' }
    : { code: raw, device: 'tablet' }
}

export function intakeCodeFromHash(hash: string = window.location.hash): string {
  return readIntakeHash(hash).code
}
