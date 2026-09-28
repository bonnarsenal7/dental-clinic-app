import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../../test/supabaseMock'
import { EMPTY_PATIENT_FORM } from '../PatientForm'
import type { IntakeSubmission } from './api'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../../../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('../../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const api = await import('./api')
const db = () => sb.current!

const PENDING: IntakeSubmission = {
  id: 'intake-1',
  patient_id: 'reserved-patient-1',
  payload: { ...EMPTY_PATIENT_FORM, name: 'Maria Clara Santos' },
  signature_png: 'data:image/png;base64,iVBORw0KGgo=',
  signed_by_name: 'Maria Clara Santos',
  signer_relationship: 'self',
  consent_text_version: 'v3-draft',
  submitted_at: '2026-09-28T01:00:00Z',
  status: 'pending',
  reviewed_at: null,
}

describe('intake api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['png'], { type: 'image/png' }) })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The category is reception's call (0023). A patient cannot choose it by
  // editing the request either — the database drops it too — but the client
  // should not be sending a value nobody chose.
  it('does not send a patient type with the submission', async () => {
    await api.submitIntake({
      code: 'abc',
      values: { ...EMPTY_PATIENT_FORM, patient_type: 'orthodontic', name: 'Juan' },
      signatureDataUrl: 'data:image/png;base64,xx',
      signedByName: 'Juan',
      signerRelationship: 'self',
      consentTextVersion: 'v3-draft',
    })
    const call = db().rpcCalls.find((c) => c.name === 'submit_intake')!
    const args = call.args as { p_code: string; p_payload: Record<string, unknown> }
    expect(args.p_code).toBe('abc')
    expect(args.p_payload.name).toBe('Juan')
    expect(args.p_payload).not.toHaveProperty('patient_type')
  })

  it('surfaces a spent code in the words the database used', async () => {
    db().queueRpc('submit_intake', {
      error: { message: 'This form has already been submitted. Please hand the tablet back to reception.' },
    })
    await expect(
      api.submitIntake({
        code: 'abc',
        values: { ...EMPTY_PATIENT_FORM, name: 'Juan' },
        signatureDataUrl: 'data:image/png;base64,xx',
        signedByName: 'Juan',
        signerRelationship: 'self',
        consentTextVersion: 'v3-draft',
      }),
    ).rejects.toThrow('already been submitted')
  })

  // The consent must point at the patient it belongs to, and accept_intake
  // refuses any other path. The reserved id makes the path known before the
  // patient row exists.
  it('files the signature under the reserved patient id, then accepts', async () => {
    db().queueRpc('accept_intake', { data: 'reserved-patient-1' })
    const id = await api.acceptIntake(PENDING, 'orthodontic')
    expect(id).toBe('reserved-patient-1')

    const upload = db().storageOps.find((o) => o.method === 'upload')!
    expect(upload.args[0]).toBe('patient-files')
    expect(upload.args[1]).toBe('signatures/reserved-patient-1/intake-intake-1.png')

    const accept = db().rpcCalls.find((c) => c.name === 'accept_intake')!
    expect(accept.args).toEqual({
      p_intake_id: 'intake-1',
      p_patient_type: 'orthodontic',
      p_signature_path: 'signatures/reserved-patient-1/intake-intake-1.png',
    })
  })

  // A retry after the accept step failed finds the image already uploaded.
  // Treating that as fatal would strand the intake: it could never be accepted.
  it('carries on when the signature is already uploaded from an earlier attempt', async () => {
    db().setStorageResult({ error: { message: 'The resource already exists' } })
    db().queueRpc('accept_intake', { data: 'reserved-patient-1' })
    await expect(api.acceptIntake(PENDING, 'regular')).resolves.toBe('reserved-patient-1')
  })

  it('stops before accepting when the upload genuinely fails', async () => {
    db().setStorageResult({ error: { message: 'new row violates row-level security policy' } })
    await expect(api.acceptIntake(PENDING, 'regular')).rejects.toThrow('Signature upload')
    expect(db().rpcCalls.find((c) => c.name === 'accept_intake')).toBeUndefined()
  })

  it('discards by status, leaving the erasing to the database', async () => {
    await api.discardIntake('intake-1')
    const q = db().query('intake_submissions')!
    expect(q.payload).toEqual({ status: 'discarded' })
    expect(q.arg('eq', 1)).toBe('intake-1')
  })

  it('lists only intakes still waiting, oldest first', async () => {
    db().queue('intake_submissions', { data: [] })
    await api.listPendingIntakes()
    const q = db().query('intake_submissions')!
    expect(q.calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] })
    expect(q.calls).toContainEqual({ method: 'order', args: ['submitted_at', { ascending: true }] })
  })
})
