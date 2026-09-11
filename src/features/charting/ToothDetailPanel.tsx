import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONDITION_BY_KEY, SURFACE_ORDER, surfaceLabel, toothName } from './chartVocabulary'
import type { ToothConditionKey, ToothSurface } from './chartVocabulary'
import { hasFindings } from './chartState'
import { attachToothImage, getSignedToothImageUrl } from './api'
import type { ChartVisit, PendingMark, ToothRecord, ToothState } from './types'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'

interface ToothDetailPanelProps {
  patientId: string
  toothNumber: number | null
  state: ToothState
  history: ToothRecord[]
  pending: PendingMark[]
  visitsById: Map<string, ChartVisit>
  selectedCondition: ToothConditionKey | null
  onMark: (toothNumber: number, surface: ToothSurface | null) => void
  onRemovePending: (key: string) => void
  onRecordUpdated: (record: ToothRecord) => void
}

function describe(record: Pick<ToothRecord, 'condition' | 'surface'>, toothNumber: number): string {
  const label = CONDITION_BY_KEY[record.condition]?.label ?? record.condition
  return record.surface ? `${label} — ${surfaceLabel(record.surface, toothNumber)}` : label
}

export default function ToothDetailPanel({
  patientId,
  toothNumber,
  state,
  history,
  pending,
  visitsById,
  selectedCondition,
  onMark,
  onRemovePending,
  onRecordUpdated,
}: ToothDetailPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  if (toothNumber === null) {
    return (
      <aside className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700">Tooth detail</h2>
        <p className="text-slate-400 text-sm mt-2">
          Tap a tooth on the chart to see everything recorded for it over time.
        </p>
      </aside>
    )
  }

  // Pinned to a const so the narrowing above survives into the closures
  // below — TypeScript resets a parameter's narrowed type at every
  // function boundary, but not a const's.
  const tooth = toothNumber
  const condition = selectedCondition ? CONDITION_BY_KEY[selectedCondition] : null

  async function handleAttach(record: ToothRecord) {
    const file = fileInputs.current[record.id]?.files?.[0]
    if (!file) {
      setError('Choose an image first, then attach it.')
      return
    }
    setError(null)
    setUploadingFor(record.id)
    try {
      const updated = await attachToothImage({
        recordId: record.id,
        patientId,
        toothNumber: record.tooth_number,
        file,
      })
      const input = fileInputs.current[record.id]
      if (input) input.value = ''
      onRecordUpdated(updated)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setUploadingFor(null)
    }
  }

  async function handleView(path: string) {
    try {
      window.open(await getSignedToothImageUrl(path), '_blank', 'noopener')
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <aside className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-700">Tooth {tooth}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{toothName(tooth)}</p>
      </div>

      {error && <ErrorState message={error} />}

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Currently charted</p>
        {!hasFindings(state) ? (
          <p className="text-sm text-slate-400">No findings recorded.</p>
        ) : (
          <ul className="text-sm text-slate-600 flex flex-col gap-1">
            {state.condition && <li>{CONDITION_BY_KEY[state.condition].label}</li>}
            {SURFACE_ORDER.filter((s) => state.surfaces[s]).map((s) => (
              <li key={s}>
                {surfaceLabel(s, tooth)}: {CONDITION_BY_KEY[state.surfaces[s]!].label}
              </li>
            ))}
            {state.planned && <li className="text-emerald-700">Planned treatment</li>}
          </ul>
        )}
      </div>

      {/* Big-target alternative to tapping a 13px sliver on the chart —
          the surface zones are fiddly with a fingertip on a tablet. */}
      {condition && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Mark as {condition.label.toLowerCase()}
          </p>
          {condition.kind === 'surface' ? (
            <div className="grid grid-cols-2 gap-2">
              {SURFACE_ORDER.map((surface) => (
                <button
                  key={surface}
                  type="button"
                  onClick={() => onMark(tooth, surface)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                >
                  {surfaceLabel(surface, tooth)}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onMark(tooth, null)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              Apply to whole tooth
            </button>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Unsaved</p>
          {pending.map((mark) => (
            <div key={mark.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600">{describe(mark, tooth)}</span>
              <button
                type="button"
                onClick={() => onRemovePending(mark.key)}
                className="text-xs text-slate-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">History for this tooth</p>
        {history.length === 0 && <p className="text-sm text-slate-400">Nothing charted yet.</p>}

        {/* Newest first — the reverse of the fold order used to build the
            chart, because a dentist reads history backwards from today. */}
        {[...history].reverse().map((record) => {
          const visit = record.visit_id ? visitsById.get(record.visit_id) : undefined
          return (
            <div key={record.id} className="border-t border-slate-100 pt-2.5 flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-slate-700">{describe(record, tooth)}</span>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(record.created_at).toLocaleDateString()}
                </span>
              </div>

              {visit ? (
                <p className="text-xs text-slate-500">
                  Visit {new Date(visit.visit_date).toLocaleDateString()}
                  {visit.visit_notes?.notes ? ` — ${visit.visit_notes.notes}` : ' — no note written yet'}
                </p>
              ) : (
                <p className="text-xs text-slate-400">Not linked to a visit.</p>
              )}

              {record.image_path ? (
                <button
                  type="button"
                  onClick={() => void handleView(record.image_path!)}
                  className="self-start text-xs text-slate-600 hover:underline"
                >
                  View image ({record.image_name ?? 'attachment'})
                </button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={(el) => {
                      fileInputs.current[record.id] = el
                    }}
                    type="file"
                    accept="image/*,application/pdf"
                    aria-label={`Image for ${describe(record, tooth)}`}
                    className="text-xs text-slate-500 file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:text-slate-600 file:px-2 file:py-1 file:text-xs file:cursor-pointer hover:file:bg-slate-200 cursor-pointer max-w-[180px]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAttach(record)}
                    disabled={uploadingFor === record.id}
                    className="text-xs rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {uploadingFor === record.id ? 'Uploading…' : 'Attach image'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Link to={`/patients/${patientId}`} className="text-xs text-slate-500 hover:underline">
        Open patient profile & visit notes →
      </Link>
    </aside>
  )
}
