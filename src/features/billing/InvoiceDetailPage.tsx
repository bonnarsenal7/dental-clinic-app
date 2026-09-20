import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../core/supabaseClient'
import { getPatient } from '../patients/api'
import { getInvoice, recordPayment, setInvoiceCommission, voidInvoice } from './api'
import { completeAwaitingForVisit } from '../scheduling/api'
import { getClinicDay } from '../dailyClose/api'
import { toLocalDateString } from '../../core/localDate'
import { formatMoney, invoiceBalance, invoicePaid, invoiceTotal } from './ledger'
import { downloadReceipt, receiptNumber } from './receiptPdf'
import { toastSaved } from '../../core/components/ui/toast'
import type { InvoiceWithDetail, PaymentMethod } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'

interface PaymentForm {
  amount: string
  method: PaymentMethod
  reference: string
}

/** The balance as the amount box's starting text, or empty when nothing is
 *  owed — a pre-filled zero would invite a payment of nothing. */
function owedText(invoice: InvoiceWithDetail): string {
  const owed = invoiceBalance(invoice)
  return owed > 0 ? String(Math.round(owed * 100) / 100) : ''
}

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  unpaid: 'bg-slate-100 text-slate-600 border-slate-200',
  void: 'bg-slate-100 text-slate-400 border-slate-200',
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { staff } = useAuth()
  const [invoice, setInvoice] = useState<InvoiceWithDetail | null>(null)
  const [patientName, setPatientName] = useState('')
  const [clinic, setClinic] = useState({ clinic_name: '', operating_hours: '' })
  const [error, setError] = useState<string | null>(null)
  // Commission counts toward the day the invoice was raised, and closing
  // that day locks it (0020). Mirrored here so the box is not offered for a
  // save the database will refuse.
  const [commissionLocked, setCommissionLocked] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm<PaymentForm>({
    defaultValues: { amount: '', method: 'cash', reference: '' },
  })

  async function refresh(invoiceId: string) {
    const fresh = await getInvoice(invoiceId)
    setInvoice(fresh)
    return fresh
  }

  useEffect(() => {
    if (!id) return
    getInvoice(id)
      .then(async (inv) => {
        setInvoice(inv)
        // Pre-filled with what is owed: reception usually takes the whole
        // balance, and arriving from the payment queue they should not have
        // to read a figure off one part of the screen and type it into another.
        setValue('amount', owedText(inv))
        // Not awaited with the rest: if this cannot be read the box stays
        // offered, and the database still refuses a closed day's commission.
        getClinicDay(toLocalDateString(new Date(inv.created_at)))
          .then((day) => setCommissionLocked(day !== null))
          .catch(() => {})
        const [patient, settings] = await Promise.all([
          getPatient(inv.patient_id),
          supabase.from('clinic_settings').select('clinic_name, operating_hours').eq('id', 1).maybeSingle(),
        ])
        setPatientName(patient.name)
        if (settings.data) setClinic(settings.data)
      })
      .catch((e) => setError(toMessage(e)))
  }, [id, setValue])

  async function onRecordPayment(values: PaymentForm) {
    if (!invoice || !staff) return
    const amount = Number(values.amount)
    if (!amount) {
      setError('Enter a payment amount.')
      return
    }
    setError(null)
    try {
      await recordPayment({
        invoiceId: invoice.id,
        staffId: staff.id,
        amount,
        method: values.method,
        reference: values.reference.trim() || null,
      })
      reset({ amount: '', method: values.method, reference: '' })
      // Totals and status are recalculated by database triggers, so the
      // refetch is what tells us the real state — not local arithmetic.
      const fresh = await refresh(invoice.id)
      setValue('amount', owedText(fresh))
      toastSaved(`${formatMoney(amount)} recorded`, `Balance now ${formatMoney(invoiceBalance(fresh))}.`)

      // Settled: check the patient out, so reception does not also have to
      // press Complete on the schedule. The money is in either way — if this
      // fails, the queue still shows the bill as paid, and says so here.
      const settled = invoiceTotal(fresh) > 0 && invoiceBalance(fresh) <= 0
      if (settled && fresh.visit_id && (staff.role === 'receptionist' || staff.role === 'admin')) {
        try {
          await completeAwaitingForVisit(fresh.visit_id)
        } catch (e) {
          setError(`Payment recorded, but the patient could not be checked out: ${toMessage(e)}`)
        }
      }
    } catch (e) {
      setError(toMessage(e))
    }
  }

  async function handleVoid() {
    if (!invoice) return
    setError(null)
    try {
      await voidInvoice(invoice.id)
      await refresh(invoice.id)
    } catch (e) {
      setError(toMessage(e))
    }
  }

  if (error && !invoice) {
    return <ErrorState message={error} />
  }
  if (!invoice) return <LoadingState />

  const total = invoiceTotal(invoice)
  const paid = invoicePaid(invoice)
  const balance = invoiceBalance(invoice)
  const isVoid = invoice.status === 'void'
  // Money is the front desk's. A dentist sees the whole bill — lines, totals,
  // what has been paid — and can print the receipt, but does not take payment:
  // that is reception's half of the chairside split (0013), and the checkout
  // that settling triggers is a move 0015 refuses them anyway.
  const canTakePayment = staff?.role === 'receptionist' || staff?.role === 'admin'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-slate-800">Invoice {receiptNumber(invoice)}</h1>
            <span
              className={`text-xs uppercase tracking-wide border rounded-full px-2.5 py-0.5 ${STATUS_STYLES[invoice.status]}`}
            >
              {invoice.status}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">
            {patientName} · {new Date(invoice.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              downloadReceipt({
                invoice,
                patientName,
                clinicName: clinic.clinic_name,
                operatingHours: clinic.operating_hours,
              })
            }
            className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
          >
            Download receipt
          </button>
          <Link
            to={`/patients/${invoice.patient_id}/billing`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Back to ledger
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {isVoid && (
        <p className="text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-3 py-2">
          This invoice is void. It is excluded from the patient's balance and kept for the record.
        </p>
      )}

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Procedure</th>
              <th className="text-right px-4 py-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {invoice.invoice_items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">
                  {item.description}
                  {item.tooth_number && <span className="text-slate-400"> — tooth {item.tooth_number}</span>}
                </td>
                <td className="px-4 py-2 text-right text-slate-700">{formatMoney(Number(item.amount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200">
            <tr>
              <td className="px-4 py-2 text-slate-500">Total</td>
              <td className="px-4 py-2 text-right text-slate-700">{formatMoney(total)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2 text-slate-500">Paid</td>
              <td className="px-4 py-2 text-right text-slate-700">{formatMoney(paid)}</td>
            </tr>
            <tr className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-800">Balance</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-800">{formatMoney(balance)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700">Payments</h2>

        {invoice.payments.length === 0 && <p className="text-sm text-slate-400">Nothing paid yet.</p>}
        {invoice.payments.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 text-sm border-t border-slate-100 pt-2"
          >
            <span className="text-slate-600">
              {new Date(p.paid_at).toLocaleDateString()} ·{' '}
              <span className="capitalize">{p.method.replace('_', ' ')}</span>
              {p.reference && <span className="text-slate-400"> · ref {p.reference}</span>}
            </span>
            <span className={Number(p.amount) < 0 ? 'text-amber-700' : 'text-slate-700'}>
              {formatMoney(Number(p.amount))}
            </span>
          </div>
        ))}

        {!isVoid && canTakePayment && (
          <form
            noValidate
            onSubmit={handleSubmit(onRecordPayment)}
            className="flex items-end gap-2 flex-wrap border-t border-slate-100 pt-4"
          >
            <Field label="Amount" error={errors.amount?.message}>
              <TextInput
                type="number"
                step="0.01"
                {...register('amount', { required: 'Enter an amount' })}
                className="w-32 text-right"
              />
            </Field>
            <Field label="Method">
              <NativeSelect {...register('method')}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
            <Field label="Reference">
              <TextInput {...register('reference')} placeholder="OR no. (optional)" />
            </Field>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Recording…' : 'Record payment'}
            </button>
          </form>
        )}

        {!isVoid && !canTakePayment && (
          <p className="text-sm text-slate-500 border-t border-slate-100 pt-4">
            Payment is taken at the front desk.
          </p>
        )}

        <p className="text-xs text-slate-400">
          Payments can't be edited or deleted — a correction is another entry, and a refund is a negative
          amount, so the ledger is never silently rewritten.
        </p>
      </section>

      <CommissionSection
        invoice={invoice}
        canEdit={!isVoid && !commissionLocked && (staff?.role === 'receptionist' || staff?.role === 'admin')}
        locked={commissionLocked}
        onSaved={() => refresh(invoice.id)}
      />

      {staff?.role === 'admin' && !isVoid && (
        <button
          type="button"
          onClick={() => void handleVoid()}
          className="self-start text-sm text-slate-400 hover:text-red-600 hover:underline"
        >
          Void this invoice
        </button>
      )}
    </div>
  )
}

/** The dentist's commission on this invoice. Reception enters it here; the
 *  dentist reads it on their dashboard and cannot change it (0017). Separate
 *  from the payment form because payments are append-only and commission is
 *  one figure per invoice that may need correcting. */
function CommissionSection({
  invoice,
  canEdit,
  locked = false,
  onSaved,
}: {
  invoice: InvoiceWithDetail
  canEdit: boolean
  /** The clinic has been closed for the invoice's day. */
  locked?: boolean
  onSaved: () => Promise<unknown>
}) {
  const current = Number(invoice.commission_amount ?? 0)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<{ commission: string }>({ defaultValues: { commission: String(current) } })

  // Keep the box in step with what the database now holds.
  useEffect(() => {
    reset({ commission: String(current) })
  }, [current, reset])

  async function onSave(values: { commission: string }) {
    const amount = Number(values.commission)
    if (Number.isNaN(amount) || amount < 0) {
      setError('Enter a commission of zero or more.')
      return
    }
    setError(null)
    try {
      await setInvoiceCommission(invoice.id, amount)
      await onSaved()
      toastSaved('Commission saved', formatMoney(amount))
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-700">Dentist commission</h2>
      {error && <ErrorState message={error} />}
      {canEdit ? (
        <form noValidate onSubmit={handleSubmit(onSave)} className="flex items-end gap-2 flex-wrap">
          <Field label="Commission" error={errors.commission?.message}>
            <TextInput
              type="text"
              inputMode="decimal"
              {...register('commission', { required: 'Enter a commission (0 if none)' })}
              className="w-32 text-right"
            />
          </Field>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save commission'}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-slate-700">{formatMoney(current)}</p>
          {locked && (
            <p className="text-xs text-slate-500">
              Locked — the clinic has been closed for this invoice's day.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
