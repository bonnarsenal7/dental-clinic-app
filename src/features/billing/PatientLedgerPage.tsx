import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logPatientView } from '../../core/auditView'
import { getPatient } from '../patients/api'
import type { Patient } from '../patients/types'
import { listInvoices } from './api'
import { buildLedger, formatMoney, invoiceBalance, outstandingBalance } from './ledger'
import { receiptNumber } from './receiptPdf'
import type { InvoiceWithDetail } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  unpaid: 'bg-slate-100 text-slate-600 border-slate-200',
  void: 'bg-slate-100 text-slate-400 border-slate-200',
}

export default function PatientLedgerPage() {
  const { id: patientId } = useParams<{ id: string }>()
  const { staff } = useAuth()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [invoices, setInvoices] = useState<InvoiceWithDetail[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId || !staff) return
    logPatientView(patientId, staff.id, 'invoices')
  }, [patientId, staff])

  useEffect(() => {
    if (!patientId) return
    Promise.all([getPatient(patientId), listInvoices(patientId)])
      .then(([p, inv]) => {
        setPatient(p)
        setInvoices(inv)
      })
      .catch((e) => setError(toMessage(e)))
  }, [patientId])

  const ledger = useMemo(() => (invoices ? buildLedger(invoices) : []), [invoices])
  const outstanding = useMemo(() => (invoices ? outstandingBalance(invoices) : 0), [invoices])

  if (error && !patient) {
    return <ErrorState message={error} />
  }
  if (!patient || !patientId || invoices === null) return <LoadingState />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Treatment ledger — {patient.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Charges and payments in the order they happened, with a running balance.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/patients/${patientId}/invoices/new`}
            className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
          >
            + New invoice
          </Link>
          <Link
            to={`/patients/${patientId}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Patient profile
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} />}

      <section className="bg-white border border-slate-200 rounded-xl px-6 py-5 flex items-baseline justify-between gap-3 flex-wrap">
        <span className="text-sm text-slate-500">Outstanding balance</span>
        <span className={`text-2xl font-semibold ${outstanding > 0 ? 'text-slate-800' : 'text-emerald-700'}`}>
          {formatMoney(outstanding)}
        </span>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Treatment / procedure</th>
                <th className="text-right px-4 py-2">Fee</th>
                <th className="text-right px-4 py-2">Paid</th>
                <th className="text-right px-4 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Nothing billed yet.
                  </td>
                </tr>
              )}
              {ledger.map((row) => (
                <tr key={row.key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {new Date(row.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    <Link to={`/invoices/${row.invoiceId}`} className="hover:underline">
                      {row.description}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-slate-700">
                    {row.fee === null ? '' : formatMoney(row.fee)}
                  </td>
                  <td className="px-4 py-2 text-right text-emerald-700">
                    {row.paid === null ? '' : formatMoney(row.paid)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">
                    {formatMoney(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Invoices</h2>
        {invoices.length === 0 && <p className="text-sm text-slate-400">No invoices yet.</p>}
        {invoices.map((invoice) => (
          <Link
            key={invoice.id}
            to={`/invoices/${invoice.id}`}
            className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-3 hover:bg-slate-50 -mx-2 px-2 rounded"
          >
            <span className="text-sm text-slate-700">
              {receiptNumber(invoice)}
              <span className="text-slate-400"> · {new Date(invoice.created_at).toLocaleDateString()}</span>
            </span>
            <span className="flex items-center gap-3">
              <span
                className={`text-xs uppercase tracking-wide border rounded-full px-2.5 py-0.5 ${STATUS_STYLES[invoice.status]}`}
              >
                {invoice.status}
              </span>
              <span className="text-sm text-slate-700 tabular-nums">
                {formatMoney(invoiceBalance(invoice))}
              </span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  )
}
