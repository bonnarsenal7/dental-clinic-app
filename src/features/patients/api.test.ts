import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '../../test/supabaseMock'

const sb = vi.hoisted(() => ({
  current: null as ReturnType<typeof import('../../test/supabaseMock').createSupabaseMock> | null,
}))
vi.mock('../../core/supabaseClient', () => ({
  get supabase() {
    return sb.current
  },
}))

const api = await import('./api')
const db = () => sb.current!

const INTAKE = {
  name: 'Maria Clara Santos',
  address: '',
  birthday: '',
  age: '34',
  sex: 'F',
  height: '',
  weight: ' ',
  occupation: 'Teacher',
  spouse: '',
  phone_number: '',
  cell_number: '0917 555 0142',
  remarks: '',
  under_physician_care: false,
  physician_name: '',
  physician_phone: '',
  hospitalized: false,
  hospitalized_reason: '',
  conditions: { asthma: true },
  other_condition_details: '',
  allergic_to_food_or_drug: false,
  allergy_details: '',
  current_medications: false,
  medication_details: '',
  allergic_to_anesthesia: false,
  smokes: false,
  last_visit_date: '',
  last_dental_problem: '',
  previous_dentist_name: '',
  previous_dentist_address: '',
  symptoms: {},
  oral_habits: {},
  oral_habits_other_details: '',
}

describe('patients api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // --- Search -------------------------------------------------------------

  // The paper process finds people by whichever number is to hand, so all
  // three columns are searched rather than name alone.
  it('searches name, cell and landline together', async () => {
    db().queue('patients', { data: [] })
    await api.searchPatients('santos')
    const filter = db().query('patients')!.arg('or') as string
    expect(filter).toContain('name.ilike.%santos%')
    expect(filter).toContain('cell_number.ilike.%santos%')
    expect(filter).toContain('phone_number.ilike.%santos%')
  })

  it('lists everyone when the box is empty rather than filtering on nothing', async () => {
    db().queue('patients', { data: [] })
    await api.searchPatients('   ')
    expect(db().methods('patients')).not.toContain('or')
  })

  it('trims the term, so a trailing space still matches', async () => {
    db().queue('patients', { data: [] })
    await api.searchPatients('  santos  ')
    expect(db().query('patients')!.arg('or')).toContain('%santos%')
  })

  // --- Blank fields are null, not "" --------------------------------------

  // The intake form is mostly optional and every field arrives as a string.
  // Writing "" into a numeric column errors, and into a text column it makes
  // "no answer" indistinguishable from "answered with nothing".
  it('stores blank optional fields as null, not empty strings', async () => {
    db().queue('patients', { data: { id: 'p-1' } })
    db().queue('medical_histories', { data: null })
    db().queue('dental_histories', { data: null })
    await api.registerPatient(INTAKE, 's-1')

    const payload = db().query('patients')!.payload as Record<string, unknown>
    expect(payload.address).toBeNull()
    expect(payload.birthday).toBeNull()
    expect(payload.height).toBeNull()
    // Whitespace only is still blank.
    expect(payload.weight).toBeNull()
  })

  it('keeps the answers that were given', async () => {
    db().queue('patients', { data: { id: 'p-1' } })
    db().queue('medical_histories', { data: null })
    db().queue('dental_histories', { data: null })
    await api.registerPatient(INTAKE, 's-1')
    expect(db().query('patients')!.payload).toMatchObject({
      name: 'Maria Clara Santos',
      occupation: 'Teacher',
      cell_number: '0917 555 0142',
      created_by: 's-1',
    })
  })

  it('converts a numeric answer to a number, not a string', async () => {
    db().queue('patients', { data: { id: 'p-1' } })
    db().queue('medical_histories', { data: null })
    db().queue('dental_histories', { data: null })
    await api.registerPatient(INTAKE, 's-1')
    expect((db().query('patients')!.payload as Record<string, unknown>).age).toBe(34)
  })

  // Not one transaction (supabase-js has no multi-table transaction without
  // an RPC), so which step failed has to be legible — the patient row will
  // still exist and history is retried through updatePatientHistory.
  it('names the step that failed, since the three writes are not atomic', async () => {
    db().queue('patients', { data: { id: 'p-1' } })
    db().queue('medical_histories', { error: { message: 'boom' } })
    await expect(api.registerPatient(INTAKE, 's-1')).rejects.toThrow(/medical history:/i)
  })

  it('files the histories against the patient it just created', async () => {
    db().queue('patients', { data: { id: 'p-1' } })
    db().queue('medical_histories', { data: null })
    db().queue('dental_histories', { data: null })
    await api.registerPatient(INTAKE, 's-1')
    expect(db().query('medical_histories')!.payload).toMatchObject({
      patient_id: 'p-1',
      conditions: { asthma: true },
    })
    expect(db().query('dental_histories')!.payload).toMatchObject({ patient_id: 'p-1' })
  })

  // --- Consent ------------------------------------------------------------

  // Consent is a log of signing events, not a flag — the paper form is
  // re-signed across visits, and each signature has to stay attached to the
  // wording that was on screen when it was given.
  it('writes a consent row per signature, with the text version', async () => {
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['x']))) as unknown as typeof fetch
    db().queue('consents', { data: null })
    await api.saveConsent({
      patientId: 'p-1',
      staffId: 's-1',
      consentTextVersion: 'v2-draft',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signedByName: 'Maria Clara Santos',
      signerRelationship: 'self',
    })
    expect(db().methods('consents')).toContain('insert')
    expect(db().query('consents')!.payload).toMatchObject({
      patient_id: 'p-1',
      staff_id: 's-1',
      consent_text_version: 'v2-draft',
    })
  })

  // The bucket is private: storing a URL would store one that stops working,
  // and a public one would be a leak.
  it('stores the storage path for a signature, not a URL', async () => {
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['x']))) as unknown as typeof fetch
    db().queue('consents', { data: null })
    await api.saveConsent({
      patientId: 'p-1',
      staffId: 's-1',
      consentTextVersion: 'v2-draft',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signedByName: 'Maria Clara Santos',
      signerRelationship: 'self',
    })
    const path = (db().query('consents')!.payload as Record<string, string>).signature_image_url
    expect(path).toMatch(/^signatures\/p-1\//)
    expect(path).not.toMatch(/^https?:/)
  })

  // The screen invites "the patient (or parent/guardian)" to sign. Without
  // these columns a guardian's signature was indistinguishable from the
  // patient's own, on a document written in the patient's voice.
  it('records who signed and on what authority', async () => {
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['x']))) as unknown as typeof fetch
    db().queue('consents', { data: null })
    await api.saveConsent({
      patientId: 'p-1',
      staffId: 's-1',
      consentTextVersion: 'v2-draft',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      signedByName: 'Rosa Santos Cruz',
      signerRelationship: 'parent',
    })
    expect(db().query('consents')!.payload).toMatchObject({
      signed_by_name: 'Rosa Santos Cruz',
      signer_relationship: 'parent',
    })
  })

  it('does not record a consent whose signature failed to upload', async () => {
    globalThis.fetch = vi.fn(async () => new Response(new Blob(['x']))) as unknown as typeof fetch
    db().setStorageResult({ error: { message: 'network' } })
    await expect(
      api.saveConsent({
        patientId: 'p-1',
        staffId: 's-1',
        consentTextVersion: 'v2-draft',
        signatureDataUrl: 'data:image/png;base64,AAAA',
        signedByName: 'Maria Clara Santos',
        signerRelationship: 'self',
      }),
    ).rejects.toThrow(/signature upload:/i)
    expect(db().query('consents')).toBeUndefined()
  })

  // --- Visits -------------------------------------------------------------

  // visit_notes is a separate table precisely so reception can read the
  // visit and not the write-up. The note must never be folded back onto the
  // visits row.
  it('writes the clinical note to visit_notes, not onto the visit', async () => {
    db().queue('visits', { data: { id: 'v-1' } })
    db().queue('visit_notes', { data: null })
    await api.addVisitWithNote({
      patientId: 'p-1',
      staffId: 's-1',
      visitDate: '2026-09-12',
      notes: 'Upper left quadrant sensitive',
    })
    expect(db().query('visits')!.payload).not.toHaveProperty('notes')
    expect(db().query('visit_notes')!.payload).toMatchObject({
      visit_id: 'v-1',
      notes: 'Upper left quadrant sensitive',
      created_by: 's-1',
    })
  })

  it('names which half failed when a note cannot be written', async () => {
    db().queue('visits', { data: { id: 'v-1' } })
    db().queue('visit_notes', { error: { message: 'permission denied' } })
    await expect(
      api.addVisitWithNote({ patientId: 'p-1', staffId: 's-1', visitDate: '2026-09-12', notes: 'x' }),
    ).rejects.toThrow(/visit note:/i)
  })

  // --- Attachments --------------------------------------------------------

  it('views an attachment through a short-lived signed URL', async () => {
    await api.getSignedFileUrl('attachments/p-1/x.png')
    expect(db().storageOps.find((o) => o.method === 'createSignedUrl')!.args[2]).toBe(600)
  })

  it('does not record a file whose upload failed', async () => {
    db().setStorageResult({ error: { message: 'too large' } })
    const file = new File(['x'], 'xray.png')
    await expect(
      api.uploadPatientFile({ patientId: 'p-1', staffId: 's-1', file, fileType: 'xray' }),
    ).rejects.toThrow(/upload:/i)
    expect(db().query('patient_files')).toBeUndefined()
  })
})
