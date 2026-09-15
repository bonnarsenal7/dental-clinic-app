import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../core/components/ui/Button'
import { formatMoney } from '../billing/ledger'
import type { VisitHistoryRow } from '../billing/visitHistory'

export const VISIT_HISTORY_PAGE_SIZE = 10

const money = (v: number | null) => (v === null ? '—' : formatMoney(v))

const STATUS_NOTE: Partial<Record<NonNullable<VisitHistoryRow['invoiceStatus']>, string>> = {
  draft: 'still being billed',
  void: 'voided',
}

/** Date / Treatment/Procedure / Amount / Paid / Balance, newest first,
 *  ten to a page — with "List all" expanding the same table in place.
 *
 *  Tapping a date opens the row: the dentist's note for that visit, and the
 *  invoice. The note used to be shown inline for every visit; it lives one
 *  tap away now because the five columns have no room for it. */
export default function VisitHistoryTable({
  rows,
  canTakePayment,
  billingError,
}: {
  /** Already newest first — see buildVisitHistory. */
  rows: VisitHistoryRow[]
  canTakePayment: boolean
  /** The visits still list when billing fails to load; the money says so. */
  billingError?: string | null
}) {
  const [page, setPage] = useState(0)
  const [listAll, setListAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  if (rows.length === 0) return <p className="text-sm text-slate-400">No visits recorded yet.</p>

  const pageCount = Math.max(1, Math.ceil(rows.length / VISIT_HISTORY_PAGE_SIZE))
  // Clamped at render: a refresh that shortens the history must not strand
  // the table on a page that no longer exists.
  const current = Math.min(page, pageCount - 1)
  const visible = listAll
    ? rows
    : rows.slice(current * VISIT_HISTORY_PAGE_SIZE, (current + 1) * VISIT_HISTORY_PAGE_SIZE)
  const paged = rows.length > VISIT_HISTORY_PAGE_SIZE

  function toggle(visitId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(visitId)) next.delete(visitId)
      else next.add(visitId)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {billingError && (
        <p className="text-xs text-slate-500">
          Amounts could not be loaded ({billingError}). The visits are still listed.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left py-2 pr-3">Date</th>
              <th className="text-left py-2 pr-3">Treatment/Procedure</th>
              <th className="text-right py-2 pr-3">Amount</th>
              <th className="text-right py-2 pr-3">Paid</th>
              <th className="text-right py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const date = new Date(row.visitDate).toLocaleDateString()
              const isOpen = expanded.has(row.visitId)
              const statusNote = row.invoiceStatus ? STATUS_NOTE[row.invoiceStatus] : undefined
              const owing = row.balance !== null && row.balance > 0
              return (
                <Fragment key={row.visitId}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggle(row.visitId)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${date}`}
                        className="tabular-nums text-slate-700 hover:underline"
                      >
                        <span aria-hidden="true">{isOpen ? '▾' : '▸'} </span>
                        {date}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-slate-700">
                      {row.treatment ?? <span className="text-slate-400">Nothing billed</span>}
                      {statusNote && <span className="text-xs text-slate-400"> · {statusNote}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{money(row.amount)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{money(row.paid)}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${owing ? 'font-medium text-red-700' : 'text-slate-700'}`}
                    >
                      {money(row.balance)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="pb-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex flex-col gap-2">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Note for this visit
                            </p>
                            <p className="text-sm text-slate-700 whitespace-pre-line mt-1">
                              {row.note ?? 'No note was written for this visit.'}
                            </p>
                          </div>
                          {/* No invoice link on a draft: it is not a bill yet,
                              and reception must not take money against it. */}
                          {row.invoiceId && row.invoiceStatus !== 'draft' && (
                            <div className="flex items-center gap-3 flex-wrap">
                              <Link
                                to={`/invoices/${row.invoiceId}`}
                                className="text-xs text-slate-600 hover:underline"
                              >
                                Open invoice
                              </Link>
                              {canTakePayment && owing && row.invoiceStatus !== 'void' && (
                                <Link
                                  to={`/invoices/${row.invoiceId}`}
                                  className="rounded-md bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-800"
                                >
                                  Accept payment
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {paged && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {listAll ? (
            <span className="text-xs text-slate-500">All {rows.length} visits</span>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500 tabular-nums">
                Page {current + 1} of {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage(current + 1)}
                disabled={current >= pageCount - 1}
              >
                Next
              </Button>
            </div>
          )}
          <Button variant="subtle" size="sm" onClick={() => setListAll((v) => !v)}>
            {listAll ? `Show ${VISIT_HISTORY_PAGE_SIZE} per page` : `List all (${rows.length})`}
          </Button>
        </div>
      )}
    </div>
  )
}
