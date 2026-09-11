import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createProcedure, listProcedures, updateProcedure } from './api'

import { formatMoney } from './ledger'
import type { Procedure } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { PageHeader } from '../../core/components/ui/Page'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'

interface ProcedureForm {
  name: string
  code: string
  default_fee: string
  chart_condition: '' | 'filled' | 'crown'
}

const EMPTY: ProcedureForm = { name: '', code: '', default_fee: '', chart_condition: '' }

export default function PriceListPage() {
  const [procedures, setProcedures] = useState<Procedure[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<ProcedureForm>({ defaultValues: EMPTY })

  async function refresh() {
    try {
      // Inactive procedures stay listed here so a price can be retired and
      // brought back without losing the invoices that reference it.
      setProcedures(await listProcedures(true))
    } catch (e) {
      setError(toMessage(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onAdd(values: ProcedureForm) {
    setError(null)
    try {
      await createProcedure({
        name: values.name.trim(),
        code: values.code.trim() || null,
        default_fee: Number(values.default_fee || 0),
        chart_condition: values.chart_condition || null,
      })
      reset(EMPTY)
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  async function toggleActive(procedure: Procedure) {
    setError(null)
    try {
      await updateProcedure(procedure.id, { active: !procedure.active })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Procedure price list"
        description={<>
          The fees the invoice builder offers. Linking a procedure to a charted condition lets an
          invoice be built straight from the dental chart.
        </>}
      />

      {error && <ErrorState message={error} />}

      <form
        noValidate
        onSubmit={handleSubmit(onAdd)}
        className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
      >
        <Field label="Procedure" error={errors.name?.message} className="sm:col-span-2">
<TextInput {...register('name', { required: 'Name the procedure' })} placeholder="e.g. Composite filling" />
</Field>
        <Field label="Code">
<TextInput {...register('code')} />
</Field>
        <Field label="Fee (PHP)" error={errors.default_fee?.message}>
<TextInput type="number" step="0.01" min="0" {...register('default_fee', { required: 'Enter a fee' })} />
</Field>
        <Field label="Charted as">
<NativeSelect {...register('chart_condition')}>
<option value="">— not charted —</option>
            <option value="filled">Filled</option>
            <option value="crown">Crown</option>
</NativeSelect>
</Field>
        <button
          type="submit"
          disabled={isSubmitting}
          className="sm:col-span-5 self-start rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
        >
          {isSubmitting ? 'Adding…' : '+ Add procedure'}
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Procedure</th>
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">Charted as</th>
              <th className="text-right px-4 py-2">Fee</th>
              <th className="text-right px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {procedures === null && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {procedures?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                No procedures yet — add the clinic's price list above.
              </td></tr>
            )}
            {procedures?.map((p) => (
              <tr key={p.id} className={`border-t border-slate-100 ${p.active ? '' : 'opacity-50'}`}>
                <td className="px-4 py-2 text-slate-800">{p.name}</td>
                <td className="px-4 py-2 text-slate-500">{p.code ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500 capitalize">{p.chart_condition ?? '—'}</td>
                <td className="px-4 py-2 text-right text-slate-700">{formatMoney(Number(p.default_fee))}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => void toggleActive(p)}
                    className="text-xs text-slate-500 hover:text-slate-800 hover:underline"
                  >
                    {p.active ? 'Retire' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
