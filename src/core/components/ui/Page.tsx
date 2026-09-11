import type { ReactNode } from 'react'
import { cn } from '../../cn'

/** Title, one line of context, and the actions for this screen. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
        {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

/** A panel. Not every grouping is a card — this is for the ones that are a
 *  distinct object on the page, which is why the border and radius live here
 *  rather than being stamped on every block. */
export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
