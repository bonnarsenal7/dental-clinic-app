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

describe('charting api', () => {
  beforeEach(() => {
    sb.current = createSupabaseMock()
  })

  // The chart is a fold of the log in order. created_at is transaction time,
  // identical across a batch, so ordering by it would make "decayed then
  // sound" and "sound then decayed" indistinguishable after a reload.
  it('reads the log by seq, never by created_at', async () => {
    db().queue('tooth_records', { data: [] })
    await api.listToothRecords('p-1')
    expect(db().query('tooth_records')!.arg('order', 0)).toBe('seq')
    expect(db().query('tooth_records')!.arg('order', 1)).toEqual({ ascending: true })
  })

  // Append-only: a re-chart is a later row that supersedes the earlier one.
  // An update would destroy the history the whole design exists to keep.
  it('saves marks as new rows rather than updating existing ones', async () => {
    db().queue('tooth_records', { data: [] })
    await api.saveToothMarks({
      patientId: 'p-1',
      staffId: 's-1',
      visitId: 'v-1',
      marks: [
        { key: 'k1', tooth_number: 36, surface: 'occlusal', condition: 'filled' },
        { key: 'k2', tooth_number: 11, surface: null, condition: 'crown' },
      ],
    })
    expect(db().methods('tooth_records')).toContain('insert')
    expect(db().methods('tooth_records')).not.toContain('update')
  })

  // One insert, so a save lands whole or not at all — a half-saved chart is
  // worse than an unsaved one.
  it('writes the whole batch in a single insert', async () => {
    db().queue('tooth_records', { data: [] })
    await api.saveToothMarks({
      patientId: 'p-1',
      staffId: 's-1',
      visitId: 'v-1',
      marks: [
        { key: 'k1', tooth_number: 36, surface: 'occlusal', condition: 'filled' },
        { key: 'k2', tooth_number: 11, surface: null, condition: 'crown' },
      ],
    })
    expect(db().queries.filter((q) => q.table === 'tooth_records')).toHaveLength(1)
    expect(db().query('tooth_records')!.payload).toHaveLength(2)
  })

  // Every mark carries the visit, which is what links the chart back to the
  // dentist's write-up of the same appointment.
  it('ties every mark to the visit and the dentist', async () => {
    db().queue('tooth_records', { data: [] })
    await api.saveToothMarks({
      patientId: 'p-1',
      staffId: 's-1',
      visitId: 'v-1',
      marks: [{ key: 'k1', tooth_number: 36, surface: 'occlusal', condition: 'filled' }],
    })
    expect((db().query('tooth_records')!.payload as unknown[])[0]).toMatchObject({
      patient_id: 'p-1',
      visit_id: 'v-1',
      created_by: 's-1',
      tooth_number: 36,
      surface: 'occlusal',
      condition: 'filled',
    })
  })

  it('says which step failed when a save is refused', async () => {
    db().queue('tooth_records', { error: { message: 'permission denied' } })
    await expect(
      api.saveToothMarks({ patientId: 'p-1', staffId: 's-1', visitId: 'v-1', marks: [] }),
    ).rejects.toThrow(/save chart:/i)
  })

  // --- Per-tooth images ---------------------------------------------------

  // 0004_charting.sql restricts the tooth/ prefix to dentist/admin. A path
  // built any other way would land under the front-desk-readable part of
  // the same bucket, leaking clinical images past the RLS boundary.
  it('stores a tooth image under the dentist-only tooth/ prefix', async () => {
    db().queue('tooth_records', { data: {} })
    const file = new File(['x'], 'xray.png', { type: 'image/png' })
    await api.attachToothImage({ recordId: 'r-1', patientId: 'p-1', toothNumber: 36, file })

    const upload = db().storageOps.find((o) => o.method === 'upload')!
    expect(upload.args[0]).toBe('patient-files')
    expect(upload.args[1]).toMatch(/^tooth\/p-1\/36\//)
  })

  it('does not touch the record if the upload failed', async () => {
    db().setStorageResult({ error: { message: 'bucket full' } })
    const file = new File(['x'], 'xray.png', { type: 'image/png' })
    await expect(
      api.attachToothImage({ recordId: 'r-1', patientId: 'p-1', toothNumber: 36, file }),
    ).rejects.toThrow(/upload:/i)
    expect(db().query('tooth_records')).toBeUndefined()
  })

  // The bucket is private, so a permanent link would either not work or be a
  // leak. Short-lived signed URLs only.
  it('views an image through a short-lived signed URL', async () => {
    await api.getSignedToothImageUrl('tooth/p-1/36/x.png')
    const signed = db().storageOps.find((o) => o.method === 'createSignedUrl')!
    expect(signed.args[2]).toBe(600)
  })
})
