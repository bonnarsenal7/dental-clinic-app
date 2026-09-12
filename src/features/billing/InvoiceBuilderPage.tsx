import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getPatient } from '../patients/api'
import type { Patient } from '../patients/types'
import {
  createInvoice,
  findInvoiceForVisit,
  getVisitNote,
  listBillableCharting,
  listPatientVisits,
  listProcedures,
} from './api'
import { getAppointment } from '../scheduling/api'
import { formatMoney } from './ledger'
import type { BillableCharting, Procedure } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'

interface DraftLine {
  key: string
  description: string
  amount: number
  procedure_id: string | null
  tooth_record_id: string | null
  tooth_number: number | null
}

export default function InvoiceBuilderPage() {
  const { id: patientId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const { staff } = useAuth()
  const navigate = useNavigate()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [visits, setVisits] = useState<{ id: string; visit_date: string }[]>([])
  const [visitId, setVisitId] = useState(searchParams.get('visit') ?? '')
  const [visitNote, setVisitNote] = useState<string | null>(null)
  const appointmentId = searchParams.get('appointment')
  const [existingInvoice, setExistingInvoice] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)
  const [billable, setBillable] = useState<BillableCharting[]>([])
  const [lines, setLines] = useState<DraftLine[]>([])
  const [manualProcedureId, setManualProcedureId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reception has no RLS access to tooth_records, so pulling from the chart
  // is a dentist/admin action. They see manual line entry only.
  const canReadChart = staff?.role === 'dentist' || staff?.role === 'admin'

  useEffect(() => {
    if (!patientId) return
    setLoading(true)
    Promise.all([getPatient(patientId), listProcedures(), listPatientVisits(patientId)])
      .then(([p, procs, vs]) => {
        setPatient(p)
        setProcedures(procs)
        setVisits(vs)
      })
      .catch((e) => setError(toMessage(e)))
      .finally(() => setLoading(false))
  }, [patientId])

  // Arriving from a completed appointment: seed a line from what was booked.
  // The appointment already names the procedure, and the price list already
  // knows its fee, so reception shouldn't have to retype either. The amount
  // stays editable — the booked procedure isn't always what was done.
  useEffect(() => {
    if (!appointmentId || prefilled || procedures.length === 0) return
    let cancelled = false
    getAppointment(appointmentId)
      .then((appointment) => {
        if (cancelled) return
        setPrefilled(true)
        if (appointment.visit_id) setVisitId((current) => current || appointment.visit_id!)
        const procedure = procedures.find((p) => p.id === appointment.procedure_id)
        const description = procedure?.name ?? appointment.reason ?? ''
        if (!description) return
        setLines((current) => [
          ...current,
          {
            key: `${Date.now()}-appt`,
            description,
            amount: Number(procedure?.default_fee ?? 0),
            procedure_id: procedure?.id ?? null,
            tooth_record_id: null,
            tooth_number: null,
          },
        ])
      })
      .catch((e) => setError(toMessage(e)))
    return () => {
      cancelled = true
    }
  }, [appointmentId, prefilled, procedures])

  // Warn rather than silently raise a second invoice for the same treatment.
  useEffect(() => {
    if (!visitId) {
      setExistingInvoice(null)
      return
    }
    let cancelled = false
    findInvoiceForVisit(visitId)
      .then((invoice) => {
        if (!cancelled) setExistingInvoice(invoice?.id ?? null)
      })
      .catch(() => {
        // A failed duplicate check shouldn't block invoicing — the warning
        // is a courtesy, and the unique index still protects charted lines.
      })
    return () => {
      cancelled = true
    }
  }, [visitId])

  // The note is what the dentist wrote while the patient was in the chair.
  // Whoever bills needs it in front of them, not one screen away.
  useEffect(() => {
    if (!visitId || !canReadChart) {
      setVisitNote(null)
      return
    }
    getVisitNote(visitId)
      .then(setVisitNote)
      .catch(() => setVisitNote(null))
  }, [visitId, canReadChart])

  useEffect(() => {
    if (!visitId || !canReadChart) {
      setBillable([])
      return
    }
    listBillableCharting(visitId)
      .then(setBillable)
      .catch((e) => setError(toMessage(e)))
  }, [visitId, canReadChart])

  const total = useMemo(() => lines.reduce((sum, l) => sum + l.amount, 0), [lines])

  const pulledRecordIds = useMemo(() => new Set(lines.map((l) => l.tooth_record_id).filter(Boolean)), [lines])

  function newKey() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  /** Matches a charted condition to the price list. When the clinic has
   *  several procedures for one condition (composite vs amalgam filling)
   *  the cheapest is a guess, so the fee stays editable on the line. */
  function procedureFor(condition: 'filled' | 'crown'): Procedure | undefined {
    return procedures
      .filter((p) => p.chart_condition === condition)
      .sort((a, b) => Number(a.default_fee) - Number(b.default_fee))[0]
  }

  function addFromChart(entry: BillableCharting) {
    const procedure = procedureFor(entry.condition)
    setLines((current) => [
      ...current,
      {
        key: newKey(),
        description: procedure?.name ?? (entry.condition === 'filled' ? 'Filling' : 'Crown'),
        amount: Number(procedure?.default_fee ?? 0),
        procedure_id: procedure?.id ?? null,
        tooth_record_id: entry.tooth_record_id,
        tooth_number: entry.tooth_number,
      },
    ])
  }

  function addAllFromChart() {
    billable.filter((b) => !pulledRecordIds.has(b.tooth_record_id)).forEach(addFromChart)
  }

  function addManualLine() {
    const procedure = procedures.find((p) => p.id === manualProcedureId)
    setLines((current) => [
      ...current,
      {
        key: newKey(),
        description: procedure?.name ?? '',
        amount: Number(procedure?.default_fee ?? 0),
        procedure_id: procedure?.id ?? null,
        tooth_record_id: null,
        tooth_number: null,
      },
    ])
    setManualProcedureId('')
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  async function handleSave() {
    if (!patientId || !staff) return
    if (lines.length === 0) {
      setError('Add at least one line before creating the invoice.')
      return
    }
    if (lines.some((l) => !l.description.trim())) {
      setError('Every line needs a description — it becomes the wording on the receipt.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const invoice = await createInvoice({
        patientId,
        visitId: visitId || null,
        staffId: staff.id,
        lines: lines.map(({ description, amount, procedure_id, tooth_record_id, tooth_number }) => ({
          description: description.trim(),
          amount,
          procedure_id,
          tooth_record_id,
          tooth_number,
        })),
      })
      navigate(`/invoices/${invoice.id}`)
    } catch (e) {
      setError(toMessage(e))
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!patient || !patientId) {
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error ?? 'Patient not found.'}
      </p>
    )
  }

  const unpulled = billable.filter((b) => !pulledRecordIds.has(b.tooth_record_id))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">New invoice — {patient.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Pull the procedures charted at a visit, then add anything else by hand.
          </p>
        </div>
        <Link
          to={`/patients/${patientId}/billing`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </Link>
      </div>

      {error && <ErrorState message={error} />}

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-600" htmlFor="invoice-visit">
          For visit
        </label>
        <select
          id="invoice-visit"
          value={visitId}
          onChange={(e) => setVisitId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">— no visit —</option>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {new Date(v.visit_date).toLocaleDateString()}
            </option>
          ))}
        </select>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-slate-700">Charted procedures</h2>
          {unpulled.length > 0 && (
            <button
              type="button"
              onClick={addAllFromChart}
              className="text-sm text-slate-600 hover:underline"
            >
              Add all {unpulled.length}
            </button>
          )}
        </div>

        {/* Same RLS boundary as the charted procedures: reception has no
            policy at all on visit_notes, so there is nothing to show them
            and saying so beats an empty panel. */}
        {canReadChart && visitId && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Dentist's note for this visit
            </p>
            {visitNote && visitNote.trim() ? (
              <p className="text-sm text-slate-700 whitespace-pre-line mt-1">{visitNote}</p>
            ) : (
              <p className="text-sm text-slate-400 mt-1">
                No note was written for this visit. Billing from the chart alone risks missing work that was
                done but not charted.
              </p>
            )}
          </div>
        )}

        {!canReadChart ? (
          <p className="text-sm text-slate-400">
            Charted procedures and the dentist's note are only visible to dentist/admin accounts. Ask the
            dentist to build the invoice from the chart, or add the lines by hand below.
          </p>
        ) : !visitId ? (
          <p className="text-sm text-slate-400">Choose a visit above to see what was charted.</p>
        ) : unpulled.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing billable charted at this visit that isn't already invoiced. Only completed work (fillings,
            crowns) is billable — findings and planned treatment aren't.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {unpulled.map((entry) => {
              const procedure = procedureFor(entry.condition)
              return (
                <div
                  key={entry.tooth_record_id}
                  className="flex items-center justify-between gap-3 flex-wrap border border-slate-200 rounded-lg px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-medium text-slate-700 capitalize">{entry.condition}</span>
                    <span className="text-slate-500"> — tooth {entry.tooth_number}</span>
                    {entry.surface && <span className="text-slate-400"> ({entry.surface})</span>}
                    {!procedure && (
                      <span className="text-amber-700 text-xs block mt-0.5">
                        No price-list entry charted as "{entry.condition}" — the fee starts at zero.
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addFromChart(entry)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Add {procedure ? formatMoney(Number(procedure.default_fee)) : ''}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {existingInvoice && (
        <p
          className="text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-3 py-2"
          role="alert"
        >
          This visit has already been invoiced.{' '}
          <Link to={`/invoices/${existingInvoice}`} className="font-semibold underline">
            Open that invoice
          </Link>{' '}
          instead of raising a second one, unless you mean to bill separately.
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Invoice lines</h2>

        {lines.length === 0 && <p className="text-sm text-slate-400">No lines yet.</p>}

        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-2 flex-wrap">
            <input
              value={line.description}
              onChange={(e) => updateLine(line.key, { description: e.target.value })}
              placeholder="Description"
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {line.tooth_number && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">
                tooth {line.tooth_number}
              </span>
            )}
            <input
              type="number"
              step="0.01"
              aria-label={`Fee for ${line.description || 'this line'}`}
              value={line.amount}
              onChange={(e) => updateLine(line.key, { amount: Number(e.target.value) })}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm text-right"
            />
            <button
              type="button"
              onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              className="text-xs text-slate-400 hover:text-red-600 px-2"
            >
              Remove
            </button>
          </div>
        ))}

        <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-4">
          <select
            aria-label="Procedure to add"
            value={manualProcedureId}
            onChange={(e) => setManualProcedureId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">— blank line —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(Number(p.default_fee))}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addManualLine}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            + Add line
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm font-medium text-slate-700">Total</span>
          <span className="text-lg font-semibold text-slate-800">{formatMoney(total)}</span>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="self-end rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create invoice'}
        </button>
      </section>
    </div>
  )
}
