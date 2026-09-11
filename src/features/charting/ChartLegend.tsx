import { TOOTH_CONDITIONS } from './chartVocabulary'
import type { ToothConditionKey } from './chartVocabulary'

interface ChartLegendProps {
  /** null = inspect mode: tapping a tooth opens it without marking it. */
  selected: ToothConditionKey | null
  onSelect: (key: ToothConditionKey | null) => void
}

// The legend and the tool picker are the same control: the colours a
// dentist reads off the chart are the buttons they mark it with.
export default function ChartLegend({ selected, onSelect }: ChartLegendProps) {
  const active = TOOTH_CONDITIONS.find((c) => c.key === selected)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            selected === null
              ? 'border-gold-700 bg-gold-100 text-slate-900 font-medium'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Inspect
        </button>

        {TOOTH_CONDITIONS.map((condition) => (
          <button
            key={condition.key}
            type="button"
            onClick={() => onSelect(condition.key)}
            // Selected reads as a light gold fill with a gold edge, not a
            // solid gold button. The swatch beside the label *is* the
            // information here, and a coloured patch on a dark saturated
            // ground stops being legible: on gold-700 every one of the five
            // measures between 1.02:1 and 2.05:1 — they disappear. On this
            // tint they run 2.18:1 to 4.39:1, and the gold border still
            // carries "selected" at 4.46:1 against it.
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              selected === condition.key
                ? 'border-gold-700 bg-gold-100 text-slate-900 font-medium'
                : 'border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-sm border border-black/10"
              style={{
                backgroundColor: condition.kind === 'plan' ? 'transparent' : condition.color,
                boxShadow: condition.kind === 'plan' ? `inset 0 0 0 2px ${condition.color}` : undefined,
              }}
            />
            {condition.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {active
          ? active.hint
          : 'Tap a tooth to see its history and attached images. Pick a condition above to start marking.'}
      </p>
    </div>
  )
}
