import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPendingIntakes, type IntakeSubmission } from './api'
import { toMessage } from '../../../core/errors'
import { ErrorState } from '../../../core/components/states'

/** Forms patients have handed in that nobody has reviewed yet.
 *
 *  Renders nothing when there are none: the patients list is a screen people
 *  open all day, and an empty panel on it every time would be noise. */
export default function IntakeQueue() {
  const [intakes, setIntakes] = useState<IntakeSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listPendingIntakes()
      .then(setIntakes)
      .catch((e) => setError(toMessage(e)))
  }, [])

  if (error) return <ErrorState message={`Could not load patient forms waiting for review. ${error}`} />
  if (!intakes || intakes.length === 0) return null

  return (
    <section className="bg-gold-50 border border-gold-300 rounded-xl p-4 flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-slate-800">
        {intakes.length === 1
          ? '1 patient form waiting for review'
          : `${intakes.length} patient forms waiting for review`}
      </h2>
      <ul className="flex flex-col gap-1">
        {intakes.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
            <Link to={`/intakes/${i.id}`} className="font-medium text-gold-800 hover:underline">
              {i.payload?.name || 'Unnamed'}
            </Link>
            <span className="text-slate-500">
              {new Date(i.submitted_at).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
