import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPatients } from '../patients/api'
import type { Patient } from '../patients/types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { PageHeader } from '../../core/components/ui/Page'

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
        .catch((e) => setError(toMessage(e)))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dental charting" description="Find the patient whose chart you want to open." />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or contact number…"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm max-w-md"
      />

      {error && <ErrorState message={error} />}

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
              className="rounded-md bg-gold-700 text-white text-sm font-medium px-3 py-1.5 hover:bg-gold-800"
            >
              Open chart
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
