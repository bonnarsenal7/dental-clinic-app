import { Toaster as SonnerToaster, toast } from 'sonner'

/** Confirmation that outlives the scroll position.
 *
 *  Saving a chart or taking a payment previously said so with inline text
 *  near the control — which on a tablet is often already scrolled past by
 *  the time the request returns. A toast is anchored to the viewport, so
 *  the answer is where the person is looking.
 *
 *  Reserved for "that worked". Failures stay inline next to the thing that
 *  failed, because a toast disappears and an error needs to persist next to
 *  the input that caused it. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      // Long enough to read across the room on a tablet propped at the desk.
      duration={4000}
      toastOptions={{
        classNames: {
          toast: 'rounded-md border border-slate-200 bg-white text-slate-800 shadow-lg',
          title: 'text-sm font-medium',
          description: 'text-sm text-slate-600',
        },
      }}
    />
  )
}

export function toastSaved(message: string, description?: string) {
  toast.success(message, { description })
}
