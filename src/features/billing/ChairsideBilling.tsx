import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import Button from '../../core/components/ui/Button'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'
import { formatMoney } from './ledger'
import { addDraftLine, findDraftInvoice, listProcedures, openDraftInvoice, removeDraftLine } from './api'
import type { DraftInvoice, Procedure } from './types'

interface LineForm {
  procedure_id: string
  description: string
  amount: string
  tooth_number: string
}

/** What the dentist bills with, while the patient is still in the chair.
 *
 *  Billing at the chair rather than at the desk is the point: the person who
 *  knows what was done is the one recording it, at the moment they did it.
 *  Reconstructing it afterwards from a chart is how work goes unbilled.
 *
 *  Everything here writes to a `draft` invoice, which 0013 makes editable by
 *  the dentist and by nobody else. The buttons below are a convenience; the
 *  rule is in the database.
 */
export default function ChairsideBilling({
  patientId,
  visitId,
  staffId,
  onTotalChange,
}: {
  patientId: string
  visitId: string
  staffId: string
  /** So the "finish treatment" action knows whether there is a bill. */
  onTotalChange?: (invoice: DraftInvoice | null) => void
}) {
  const [invoice, setInvoice] = useState<DraftInvoice | null>(null)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LineForm>({
    defaultValues: { procedure_id: '', description: '', amount: '', tooth_number: '' },
  })

  const refresh = useCallback(async () => {
    try {
      setInvoice(await findDraftInvoice(visitId))
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setLoading(false)
    }
  }, [visitId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    listProcedures()
      .then(setProcedures)
      .catch((e) => setError(toMessage(e)))
  }, [])

  useEffect(() => {
    onTotalChange?.(invoice)
  }, [invoice, onTotalChange])

  const chosenProcedure = watch('procedure_id')

  // Picking a procedure fills both the wording and the fee, because the
  // price list already knows them and retyping a fee is how the wrong one
  // gets charged.
  useEffect(() => {
    const procedure = procedures.find((p) => p.id === chosenProcedure)
    if (!procedure) return
    setValue('description', procedure.name)
    setValue('amount', String(procedure.default_fee))
  }, [chosenProcedure, procedures, setValue])

  async function onAdd(values: LineForm) {
    setError(null)
    setBusy(true)
    try {
      const target = invoice ?? (await openDraftInvoice({ patientId, visitId, staffId }))
      await addDraftLine({
        invoiceId: target.id,
        description: values.description.trim(),
        amount: Number(values.amount),
        procedureId: values.procedure_id || null,
        toothNumber: values.tooth_number ? Number(values.tooth_number) : null,
      })
      reset({ procedure_id: '', description: '', amount: '', tooth_number: '' })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(itemId: string) {
    setError(null)
    setBusy(true)
    try {
      await removeDraftLine(itemId)
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const lines = invoice?.invoice_items ?? []
  const total = lines.reduce((sum, l) => sum + Number(l.amount), 0)

  if (loading) return <LoadingState label="Loading the bill…" />

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Billing for this visit</h2>
        <p className="text-xs text-slate-400 mt-1">
          Add what you do as you do it. Nothing is charged until you finish treatment — after that the amounts
          are fixed, and only an admin can change them.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      {lines.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing billed yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{line.description}</p>
                {line.tooth_number && <p className="text-xs text-slate-400">Tooth {line.tooth_number}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-slate-700">
                  {formatMoney(Number(line.amount))}
                </span>
                <button
                  type="button"
                  onClick={() => void onRemove(line.id)}
                  disabled={busy}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50">
            <span className="text-sm font-medium text-slate-700">Total</span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{formatMoney(total)}</span>
          </div>
        </div>
      )}

      <form
        noValidate
        onSubmit={handleSubmit(onAdd)}
        className="flex flex-col gap-3 border-t border-slate-100 pt-4"
      >
        <Field label="Procedure" hint="Fills the description and the fee from the price list.">
          <NativeSelect {...register('procedure_id')}>
            <option value="">— type it by hand —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
            <TextInput
              {...register('description', { required: 'Say what is being charged for.' })}
              placeholder="e.g. Composite filling"
            />
          </Field>
          <Field label="Tooth (optional)">
            <TextInput type="number" min="11" max="85" {...register('tooth_number')} />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Amount" error={errors.amount?.message}>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              {...register('amount', {
                required: 'Enter an amount.',
                validate: (v) => Number(v) > 0 || 'An amount must be more than zero.',
              })}
            />
          </Field>
        </div>

        <Button type="submit" disabled={busy} className="self-start">
          {busy ? 'Adding…' : 'Add to bill'}
        </Button>
      </form>
    </section>
  )
}
