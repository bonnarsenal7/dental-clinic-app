import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createProcedure, listProcedures, updateProcedure } from './api'
import { FieldError } from '../../core/components/states'
import { formatMoney } from './ledger'
import type { Procedure } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'

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
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Procedure price list</h1>
        <p className="text-slate-500 text-sm mt-1">
          The fees the invoice builder offers. Linking a procedure to a charted condition lets an
          invoice be built straight from the dental chart.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <form
        noValidate
        onSubmit={handleSubmit(onAdd)}
        className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
      >
        <label className="flex flex-col gap-1 text-sm text-slate-700 sm:col-span-2">
          Procedure
          <input
            {...register('name', { required: 'Name the procedure' })}
            placeholder="e.g. Composite filling"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <FieldError message={errors.name?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Code
          <input {...register('code')} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Fee (PHP)
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('default_fee', { required: 'Enter a fee' })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <FieldError message={errors.default_fee?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Charted as
          <select
            {...register('chart_condition')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— not charted —</option>
            <option value="filled">Filled</option>
            <option value="crown">Crown</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="sm:col-span-5 self-start rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
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
