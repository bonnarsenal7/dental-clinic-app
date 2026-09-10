import { CONDITION_BY_KEY } from './chartVocabulary'
import type { ToothConditionKey, ToothSurface } from './chartVocabulary'
import type { ChartState, ToothState } from './types'

/** The minimum a record needs for folding — lets saved records and staged
 *  marks go through the same code path. */
interface Foldable {
  tooth_number: number
  surface: ToothSurface | null
  condition: ToothConditionKey
}

function emptyToothState(): ToothState {
  return { condition: null, surfaces: {}, planned: false }
}

/** Folds an append-only record log into the chart as it stands now.
 *  Entries must arrive oldest-first: later entries supersede earlier ones,
 *  which is what makes "re-chart the tooth" a new row rather than an edit. */
export function deriveChart(entries: Foldable[]): ChartState {
  const chart: ChartState = {}

  for (const entry of entries) {
    const state = chart[entry.tooth_number] ?? emptyToothState()
    const kind = CONDITION_BY_KEY[entry.condition]?.kind

    switch (kind) {
      case 'reset':
        chart[entry.tooth_number] = emptyToothState()
        continue
      case 'whole':
        // A missing tooth has no surfaces left to chart, and a crown
        // covers all of them — either way the surface findings go.
        state.condition = entry.condition as 'missing' | 'crown'
        state.surfaces = {}
        break
      case 'surface':
        if (entry.surface) {
          state.surfaces = { ...state.surfaces, [entry.surface]: entry.condition as 'decayed' | 'filled' }
        }
        break
      case 'plan':
        state.planned = true
        break
      default:
        // An unrecognised condition (e.g. written by a newer client than
        // this one) is skipped rather than crashing the chart.
        break
    }

    chart[entry.tooth_number] = state
  }

  return chart
}

export function toothStateOf(chart: ChartState, toothNumber: number): ToothState {
  return chart[toothNumber] ?? emptyToothState()
}

export function hasFindings(state: ToothState): boolean {
  return state.condition !== null || state.planned || Object.keys(state.surfaces).length > 0
}
