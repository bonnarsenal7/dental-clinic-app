import { useState } from 'react'
import { Dialog } from './Dialog'
import { toMessage } from '../../errors'
import { ErrorState } from '../states'

/** The pattern behind every irreversible action in the app.
 *
 *  It owns the pending state rather than the caller, so a slow network can't
 *  be double-confirmed by an impatient second tap, and a failure is shown
 *  inside the dialog — where the person who pressed the button is still
 *  looking — instead of behind it.
 */
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'destructive',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  tone?: 'destructive' | 'default'
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      // Stay open: the dialog is where the explanation belongs.
      setError(toMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) setError(null)
        onOpenChange(next)
      }}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className={
              tone === 'destructive'
                ? 'rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50'
                : 'rounded-md bg-gold-700 px-4 py-2 text-sm font-medium text-white hover:bg-gold-800 disabled:opacity-50'
            }
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      {error && <ErrorState message={error} />}
    </Dialog>
  )
}
