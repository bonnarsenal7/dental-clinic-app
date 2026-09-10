import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPatients } from '../patients/api'
import type { Patient } from '../patients/types'

// A chart only means anything in the context of a patient, so the Charting
// nav entry is a way in to one — the chart itself lives at
// /patients/:id/chart, alongside the rest of that patient's record.
export default function ChartingPage() {
  const [query, setQuery] = useState('')
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      searchPatients(query)
        .then(setPatients)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Dental charting</h1>
        <p className="text-slate-500 text-sm mt-1">
          Find the patient whose chart you want to open.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or contact number…"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm max-w-md"
      />

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {patients === null && <p className="px-4 py-6 text-center text-slate-400 text-sm">Loading…</p>}
        {patients?.length === 0 && (
          <p className="px-4 py-6 text-center text-slate-400 text-sm">No patients found.</p>
        )}
        {patients?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-slate-800">{p.name}</p>
              <p className="text-xs text-slate-400">
                {p.cell_number ?? p.phone_number ?? 'No contact number on file'}
              </p>
            </div>
            <Link
              to={`/patients/${p.id}/chart`}
              className="rounded-md bg-slate-800 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-700"
            >
              Open chart
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
