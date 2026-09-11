import type { ReactNode } from 'react'

// Loading, empty and error states shared across every screen, so the same
// situation reads the same way wherever staff meet it. Before Phase 6 each
// screen improvised its own — usually a bare "Loading…" — which made an
// empty list and a failed request look identical.

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400 py-6" role="status" aria-live="polite">
      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
      {label}
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex items-start justify-between gap-3 flex-wrap"
      role="alert"
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 min-h-[32px]"
        >
          Try again
        </button>
      )}
    </div>
  )
}
