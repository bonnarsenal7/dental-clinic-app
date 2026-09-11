import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPatients } from './api'
import type { Patient } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { PageHeader } from '../../core/components/ui/Page'

export default function PatientsPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      searchPatients(query)
        .then(setPatients)
        .catch((e) => setError(toMessage(e)))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="Patients" description="Search by name or contact number." />
        <Link
          to="/patients/new"
          className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800"
        >
          + Register patient
        </Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or contact number…"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm max-w-md"
      />

      {error && <ErrorState message={error} />}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Cell number</th>
              <th className="text-left px-4 py-2">Phone number</th>
              <th className="text-left px-4 py-2">Registered</th>
            </tr>
          </thead>
          <tbody>
            {patients === null && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {patients?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No patients found.
                </td>
              </tr>
            )}
            {patients?.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link to={`/patients/${p.id}`} className="text-slate-800 font-medium hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{p.cell_number ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500">{p.phone_number ?? '—'}</td>
                <td className="px-4 py-2 text-slate-500">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
