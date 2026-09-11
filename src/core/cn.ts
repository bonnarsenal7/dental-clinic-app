import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names, letting a caller's utility win over a component's
 *  default for the same property. Without the merge, passing `px-6` to a
 *  component that already sets `px-4` leaves both in the class list and the
 *  winner is whichever Tailwind emitted last — which is not something a
 *  caller can reason about. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
