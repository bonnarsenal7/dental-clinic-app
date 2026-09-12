import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../auth/AuthContext'
import { addVisitWithNote, listVisits } from './api'
import { listInvoices } from '../billing/api'
import VisitBilling from '../billing/VisitBilling'
import type { InvoiceWithDetail } from '../billing/types'
import type { VisitWithNote } from './types'
import { toMessage } from '../../core/errors'

import { ErrorState, LoadingState } from '../../core/components/states'
import { Field, TextArea, TextInput } from '../../core/components/ui/Field'

interface NoteForm {
  visit_date: string
  notes: string
}

export default function VisitTimeline({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [visits, setVisits] = useState<VisitWithNote[] | null>(null)
  // Fetched once for the patient and matched to visits here, rather than a
  // query per visit — a long history would otherwise be one round trip per
  // row over the clinic Wi-Fi.
  const [invoicesByVisit, setInvoicesByVisit] = useState<Record<string, InvoiceWithDetail>>({})
  const [error, setError] = useState<string | null>(null)
  const canWriteNotes = staff?.role === 'dentist' || staff?.role === 'admin'

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<NoteForm>({
    defaultValues: { visit_date: new Date().toISOString().slice(0, 10), notes: '' },
  })

  async function refresh() {
    // Fetched separately on purpose. The visit history is the clinical
    // record and has to render whether or not billing loads — tying them
    // together with Promise.all meant one failed invoice query hid every
    // note the dentist had written.
    try {
      setVisits(await listVisits(patientId))
    } catch (e) {
      setError(toMessage(e))
    }

    try {
      const byVisit: Record<string, InvoiceWithDetail> = {}
      for (const invoice of await listInvoices(patientId)) {
        // Newest first from the API, so the first one seen for a visit wins.
        if (invoice.visit_id && !byVisit[invoice.visit_id]) byVisit[invoice.visit_id] = invoice
      }
      setInvoicesByVisit(byVisit)
    } catch {
      // Left empty: each visit then reads as not billed, which is wrong but
      // survivable, and is better than losing the clinical history behind a
      // billing error.
      setInvoicesByVisit({})
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  async function onAdd(values: NoteForm) {
    if (!staff) return
    setError(null)
    try {
      await addVisitWithNote({
        patientId,
        staffId: staff.id,
        visitDate: values.visit_date,
        notes: values.notes,
      })
      reset({ visit_date: new Date().toISOString().slice(0, 10), notes: '' })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-700">Visit history</h2>
      {error && <ErrorState message={error} />}

      {canWriteNotes && (
        <form
          noValidate
          onSubmit={handleSubmit(onAdd)}
          className="flex flex-col gap-3 border border-slate-200 rounded-lg p-4"
        >
          <p className="text-xs font-medium text-slate-600">Add visit note</p>
          <Field label="Date" error={errors.visit_date?.message}>
            <TextInput type="date" {...register('visit_date', { required: 'Pick a date' })} />
          </Field>
          <Field label="Notes" error={errors.notes?.message}>
            <TextArea rows={3} {...register('notes', { required: 'Write the note before saving' })} />
          </Field>
          <button
            type="submit"
            disabled={isSubmitting}
            className="self-start rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Add visit note'}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {visits === null && <LoadingState />}
        {visits?.length === 0 && <p className="text-slate-400 text-sm">No visits recorded yet.</p>}
        {visits?.map((v) => (
          <div key={v.id} className="border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-700">
              {new Date(v.visit_date).toLocaleDateString()}
            </p>
            {v.visit_notes ? (
              <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{v.visit_notes.notes}</p>
            ) : (
              <p className="text-sm text-slate-400 italic mt-1">
                {canWriteNotes
                  ? 'No notes for this visit.'
                  : 'Clinical notes are only visible to dentist/admin accounts.'}
              </p>
            )}

            {/* What the visit cost, beside what was done at it. This is the
                history of a patient, and a bill is part of that history. */}
            {staff && (
              <VisitBilling
                patientId={patientId}
                visitId={v.id}
                visitDate={v.visit_date}
                invoice={invoicesByVisit[v.id] ?? null}
                staffId={staff.id}
                role={staff.role}
                onChanged={() => void refresh()}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
