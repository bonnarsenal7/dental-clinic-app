import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../core/supabaseClient'
import type { StaffProfile } from '../auth/types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'

interface AuditEntry {
  id: string
  staff_id: string | null
  action: string
  operation: 'insert' | 'update' | 'delete' | 'view'
  table_name: string
  record_id: string | null
  patient_id: string | null
  changed_fields: string[] | null
  created_at: string
}

const PAGE_SIZE = 100

const OPERATION_STYLES: Record<string, string> = {
  insert: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update: 'bg-amber-50 text-amber-700 border-amber-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
  view: 'bg-slate-100 text-slate-500 border-slate-200',
}

/** Turns rows into RFC-4180-ish CSV — quotes doubled, every field quoted,
 *  so a description containing a comma or newline can't shift the columns. */
function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n')
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [staffById, setStaffById] = useState<Map<string, StaffProfile>>(new Map())
  const [patientNames, setPatientNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [operation, setOperation] = useState('')
  const [tableName, setTableName] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)

  const buildQuery = useCallback(() => {
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false })
    if (operation) q = q.eq('operation', operation)
    if (tableName) q = q.eq('table_name', tableName)
    if (fromDate) q = q.gte('created_at', new Date(fromDate).toISOString())
    // The picker gives a date; the filter needs the end of that day, or
    // "to 5 March" would silently exclude everything that happened on it.
    if (toDate) {
      const end = new Date(toDate)
      end.setHours(23, 59, 59, 999)
      q = q.lte('created_at', end.toISOString())
    }
    return q
  }, [operation, tableName, fromDate, toDate])

  useEffect(() => {
    let cancelled = false
    buildQuery()
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(async ({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) {
          setError(queryError.message)
          return
        }
        const rows = (data ?? []) as AuditEntry[]
        setEntries(rows)

        // Resolve ids to names for display. The log stores bare uuids on
        // purpose (it must survive the rows it names being deleted), so a
        // missing name here is expected, not an error.
        const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))] as string[]
        const patientIds = [...new Set(rows.map((r) => r.patient_id).filter(Boolean))] as string[]

        if (staffIds.length > 0) {
          const { data: staff } = await supabase.from('staff').select('*').in('id', staffIds)
          if (!cancelled && staff) {
            setStaffById(new Map((staff as StaffProfile[]).map((s) => [s.id, s])))
          }
        }
        if (patientIds.length > 0) {
          const { data: patients } = await supabase.from('patients').select('id, name').in('id', patientIds)
          if (!cancelled && patients) {
            setPatientNames(new Map((patients as { id: string; name: string }[]).map((p) => [p.id, p.name])))
          }
        }
      })
    return () => {
      cancelled = true
    }
  }, [buildQuery, page])

  useEffect(() => {
    setPage(0)
  }, [operation, tableName, fromDate, toDate])

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      // Exports everything matching the current filters, not just the page
      // on screen — an export that silently stopped at 100 rows would be
      // worse than no export.
      const { data, error: exportError } = await buildQuery().limit(10000)
      if (exportError) throw new Error(exportError.message)
      const rows = (data ?? []) as AuditEntry[]

      const csv = toCsv([
        ['Timestamp', 'Staff', 'Role', 'Operation', 'Table', 'Patient', 'Record ID', 'Changed fields'],
        ...rows.map((r) => [
          new Date(r.created_at).toISOString(),
          (r.staff_id && staffById.get(r.staff_id)?.name) || r.staff_id || 'system',
          (r.staff_id && staffById.get(r.staff_id)?.role) || '',
          r.operation,
          r.table_name,
          (r.patient_id && patientNames.get(r.patient_id)) || r.patient_id || '',
          r.record_id ?? '',
          (r.changed_fields ?? []).join(' '),
        ]),
      ])

      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Audit log</h1>
          <p className="text-slate-500 text-sm mt-1">
            Every write to a patient, clinical, or billing record. Writes are recorded by the
            database itself and can't be skipped by an app; views are reported by the app and carry
            a weaker guarantee.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <ErrorState message={error} />}

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Operation
          <select value={operation} onChange={(e) => setOperation(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="insert">Insert</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="view">View</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Table
          <input
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g. visit_notes"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Who</th>
                <th className="text-left px-4 py-2">What</th>
                <th className="text-left px-4 py-2">Record</th>
                <th className="text-left px-4 py-2">Patient</th>
                <th className="text-left px-4 py-2">Fields changed</th>
              </tr>
            </thead>
            <tbody>
              {entries === null && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
              )}
              {entries?.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No entries match these filters.
                </td></tr>
              )}
              {entries?.map((entry) => {
                const staff = entry.staff_id ? staffById.get(entry.staff_id) : undefined
                return (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {staff ? (
                        <>
                          {staff.name}
                          <span className="text-slate-400 text-xs capitalize"> · {staff.role}</span>
                        </>
                      ) : (
                        <span className="text-slate-400" title={entry.staff_id ?? undefined}>
                          {entry.staff_id ? 'former staff' : 'system'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${OPERATION_STYLES[entry.operation]}`}>
                        {entry.operation}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{entry.table_name}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {entry.patient_id ? patientNames.get(entry.patient_id) ?? '(deleted)' : '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-400 text-xs">
                      {entry.changed_fields?.join(', ') ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          ← Newer
        </button>
        <span className="text-xs text-slate-400">Page {page + 1}</span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={(entries?.length ?? 0) < PAGE_SIZE}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          Older →
        </button>
      </div>
    </div>
  )
}
