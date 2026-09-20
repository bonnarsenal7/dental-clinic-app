import * as RadixDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { cn } from '../../cn'

/** A modal built on Radix, which supplies the parts that are tedious and
 *  easy to get subtly wrong by hand: focus moves into the dialog and is
 *  trapped there, Escape and an outside click close it, the rest of the page
 *  is hidden from assistive tech, and focus returns to whatever opened it.
 *
 *  The app previously had none of this — confirmations fell back to
 *  `window.confirm`, which cannot be styled, cannot be tested through the
 *  UI, and on a tablet appears as a browser chrome sheet with no relation
 *  to the clinic's interface. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Read out with the title, so it must carry the consequence, not flavour. */
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** "lg" is for a dialog somebody *works* in — a form with a list above it
   *  — rather than one they answer. A confirmation stays md: a wide box for
   *  one sentence reads as more consequential than it is. */
  size?: 'md' | 'lg'
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            size === 'lg' ? 'max-w-2xl max-h-[85vh] overflow-y-auto' : 'max-w-md',
            'rounded-xl border border-slate-200 bg-white p-6 shadow-xl',
            'flex flex-col gap-4',
          )}
        >
          <div className="flex flex-col gap-1.5">
            <RadixDialog.Title className="text-base font-semibold text-slate-900">{title}</RadixDialog.Title>
            {description && (
              <RadixDialog.Description className="text-sm text-slate-600">
                {description}
              </RadixDialog.Description>
            )}
          </div>
          {children}
          {footer && <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

export const DialogClose = RadixDialog.Close
