import { useState } from 'react'
import Button from '../../core/components/ui/Button'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import { ErrorState } from '../../core/components/states'
import { Field, TextInput } from '../../core/components/ui/Field'
import { toMessage } from '../../core/errors'
import { formatMoney } from '../billing/ledger'

export interface EntryRow {
  id: string
  description: string
  amount: number
  /** e.g. the dentist a salary entry is for. */
  detail?: string
}

/** A day's expense or salary entries.
 *
 *  Reception adds and never edits; an admin may edit or delete until the day
 *  is closed. `canManage` mirrors that so the screen does not offer what 0020
 *  will refuse — the rule itself is in the database. */
export default function DailyEntryList({
  entries,
  noun,
  canManage,
  emptyText,
  onSave,
  onDelete,
}: {
  entries: EntryRow[]
  /** "expense", "salary entry" — for the delete confirmation. */
  noun: string
  canManage: boolean
  emptyText: string
  onSave: (id: string, patch: { description: string; amount: number }) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editing, setEditing] = useState<{ id: string; description: string; amount: string } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<EntryRow | null>(null)

  if (entries.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>

  async function save() {
    if (!editing) return
    const amount = Number(editing.amount)
    if (!editing.description.trim()) return setEditError('Say what it was for.')
    if (!(amount > 0)) return setEditError('An amount must be more than zero.')
    setEditError(null)
    setSaving(true)
    try {
      await onSave(editing.id, { description: editing.description.trim(), amount })
      setEditing(null)
    } catch (e) {
      setEditError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ul className="flex flex-col">
        {entries.map((entry) =>
          editing?.id === entry.id ? (
            <li key={entry.id} className="flex flex-col gap-2 border-t border-slate-100 py-2">
              <div className="flex items-end gap-2 flex-wrap">
                <Field label="Edit description" className="flex-1 min-w-[160px]">
                  <TextInput
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </Field>
                <Field label="Edit amount">
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={editing.amount}
                    onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                    className="w-32 text-right"
                  />
                </Field>
                <Button size="sm" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="subtle" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
              {editError && <ErrorState message={editError} />}
            </li>
          ) : (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{entry.description}</p>
                {entry.detail && <p className="text-xs text-slate-500">{entry.detail}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums text-slate-800">{formatMoney(entry.amount)}</span>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="subtle"
                      aria-label={`Edit ${entry.description}`}
                      onClick={() => {
                        setEditError(null)
                        setEditing({
                          id: entry.id,
                          description: entry.description,
                          amount: String(entry.amount),
                        })
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      aria-label={`Delete ${entry.description}`}
                      onClick={() => setDeleting(entry)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </li>
          ),
        )}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete this ${noun}?`}
        description={
          deleting
            ? `${deleting.description}, ${formatMoney(deleting.amount)}. This cannot be undone, and the audit log records it.`
            : ''
        }
        confirmLabel="Delete"
        tone="destructive"
        onConfirm={async () => {
          if (!deleting) return
          await onDelete(deleting.id)
          setDeleting(null)
        }}
      />
    </>
  )
}
