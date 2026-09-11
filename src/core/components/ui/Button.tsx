import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../cn'

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'destructive'
export type ButtonSize = 'sm' | 'md'

/** Gold carries the clinic's identity; everything else recedes. Red is
 *  reserved for actions that cannot be undone, so it keeps meaning something
 *  — see the colour rule in CLAUDE.md. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gold-700 text-white hover:bg-gold-800',
  secondary: 'border border-slate-300 text-slate-600 hover:bg-slate-100',
  subtle: 'text-slate-600 hover:bg-slate-100',
  destructive: 'bg-red-700 text-white hover:bg-red-800',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs font-medium',
  md: 'px-4 py-2 text-sm font-medium',
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md transition-colors ' +
  'disabled:opacity-50 disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500'

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], extra)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

/** `type` defaults to "button" on purpose. A bare <button> inside a form
 *  submits it, which is a bug that only shows up when someone clicks the
 *  wrong thing — so submitting has to be asked for explicitly. */
export default function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </button>
  )
}

/** A link that looks like a button. Separate from Button rather than a
 *  polymorphic `as` prop, because the two differ in what they are for:
 *  this navigates and must stay a real anchor for middle-click and
 *  right-click to work. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}
