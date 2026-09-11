import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

// One number, what it means, and where to go to act on it. A figure a
// receptionist can't click through to is a figure they have to go hunting
// for, which is how dashboards end up ignored.
export default function StatTile({
  label,
  value,
  hint,
  to,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  hint?: string
  to?: string
  tone?: 'neutral' | 'attention' | 'good'
}) {
  const toneClasses = {
    neutral: 'border-slate-200 bg-white',
    attention: 'border-amber-300 bg-amber-50',
    good: 'border-emerald-200 bg-emerald-50',
  }[tone]

  const valueClasses = {
    neutral: 'text-slate-800',
    attention: 'text-amber-900',
    good: 'text-emerald-800',
  }[tone]

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 tabular-nums ${valueClasses}`}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
    </>
  )

  const className = `rounded-xl border px-4 py-3 ${toneClasses} ${to ? 'hover:border-slate-400 transition-colors' : ''}`

  return to ? (
    <Link to={to} className={`${className} block`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
