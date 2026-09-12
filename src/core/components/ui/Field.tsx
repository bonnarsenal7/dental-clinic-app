import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../cn'
import { FieldError } from '../states'

const CONTROL =
  'w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 ' +
  'placeholder:text-slate-400 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gold-500'

/** Label, control and message as one unit.
 *
 *  The label *wraps* the control rather than pairing by id. Both are valid,
 *  but wrapping cannot drift: an htmlFor pointing at the wrong id is exactly
 *  the bug that made the patient chooser unreachable, and it typechecks
 *  perfectly. */
export function Field({
  label,
  error,
  hint,
  children,
  className,
}: {
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    // The hint and the error sit *outside* the <label>, deliberately. Text
    // inside a label becomes part of the control's accessible name, so a
    // hint there is announced as though it were the field's name — "Procedure
    // Fills the description and the fee from the price list". The label still
    // wraps the control, so the pairing cannot drift.
    <div className={cn('flex flex-col gap-1 text-sm text-slate-700', className)}>
      <label className="flex flex-col gap-1">
        {label}
        {children}
      </label>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
      <FieldError message={error} />
    </div>
  )
}

/** React 19 passes `ref` as an ordinary prop, so no forwardRef is needed —
 *  but the ref must still reach the DOM node, because react-hook-form's
 *  register() registers the field through it. */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, className)} {...rest} />
}

/** Native on purpose: on a tablet this opens the OS picker, which is a far
 *  better touch target than anything rendered in the page. See CLAUDE.md. */
export function NativeSelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, className)} {...rest} />
}
