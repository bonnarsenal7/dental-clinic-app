import { CONDITION_BY_KEY, surfaceLabel, surfacesForTooth, toothName } from './chartVocabulary'
import type { ToothSurface } from './chartVocabulary'
import type { ToothState } from './types'

// A tooth is drawn the way the paper chart draws it: a square split into
// five zones — four sides plus the occlusal/incisal table in the middle.
// All coordinates are local to the glyph; the odontogram translates it
// into place.
export const TOOTH_SIZE = 44
const INSET = 13
const S = TOOTH_SIZE
const I = INSET

const EDGE_PATHS: Record<'top' | 'right' | 'bottom' | 'left', string> = {
  top: `M0,0 L${S},0 L${S - I},${I} L${I},${I} Z`,
  right: `M${S},0 L${S},${S} L${S - I},${S - I} L${S - I},${I} Z`,
  bottom: `M0,${S} L${I},${S - I} L${S - I},${S - I} L${S},${S} Z`,
  left: `M0,0 L${I},${I} L${I},${S - I} L0,${S} Z`,
}

export type InteractionMode = 'inspect' | 'tooth' | 'surface'

interface ToothGlyphProps {
  toothNumber: number
  state: ToothState
  /** Has staged, unsaved marks — flagged so nothing looks committed early. */
  pending: boolean
  selected: boolean
  mode: InteractionMode
  onPick: (toothNumber: number, surface: ToothSurface | null) => void
}

export default function ToothGlyph({ toothNumber, state, pending, selected, mode, onPick }: ToothGlyphProps) {
  const surfaces = surfacesForTooth(toothNumber)
  const missing = state.condition === 'missing'
  const crowned = state.condition === 'crown'
  // A missing tooth has no surfaces to pick, so surface mode falls back
  // to the whole-tooth target rather than offering dead zones.
  const surfacePickable = mode === 'surface' && !missing

  function zone(edge: 'top' | 'right' | 'bottom' | 'left' | 'center') {
    const surface: ToothSurface = surfaces[edge]
    const marked = state.surfaces[surface]
    const fill = marked ? CONDITION_BY_KEY[marked].color : '#ffffff'
    const path = edge === 'center' ? undefined : EDGE_PATHS[edge]

    const shared = {
      fill,
      stroke: '#cbd5e1',
      strokeWidth: 1,
    }

    // The click lives on the group rather than the shape, so the zone and
    // the tooltip naming it are one target. In whole-tooth mode the zones
    // are inert scenery: the tooth-wide overlay takes the click, so a stray
    // tap on a hairline between zones can't miss.
    const zoneName = `${surfaceLabel(surface, toothNumber)} — tooth ${toothNumber}`

    return (
      <g
        key={edge}
        // role + aria-label, not just <title>: an SVG <title> nested inside
        // a <g> is announced inconsistently and is invisible to a
        // name-based query, which is how this chart came to have no
        // automated coverage of what a tap actually hits. The <title> stays
        // for the mouse tooltip.
        //
        // Deliberately no tabIndex. Making 260 zones tab-stops would be
        // worse than none; proper keyboard charting needs arrow-key
        // navigation, which is not built.
        role={surfacePickable ? 'button' : undefined}
        aria-label={surfacePickable ? zoneName : undefined}
        className={surfacePickable ? 'cursor-pointer hover:opacity-70' : undefined}
        onClick={surfacePickable ? () => onPick(toothNumber, surface) : undefined}
      >
        {path ? (
          <path d={path} {...shared} />
        ) : (
          <rect x={I} y={I} width={S - 2 * I} height={S - 2 * I} {...shared} />
        )}
        {surfacePickable && <title>{zoneName}</title>}
      </g>
    )
  }

  return (
    <g>
      {selected && (
        <rect
          x={-5}
          y={-5}
          width={S + 10}
          height={S + 10}
          rx={4}
          fill="none"
          stroke="#0f172a"
          strokeWidth={2}
        />
      )}

      {(['top', 'right', 'bottom', 'left', 'center'] as const).map(zone)}

      {crowned && (
        <rect
          x={0}
          y={0}
          width={S}
          height={S}
          fill={CONDITION_BY_KEY.crown.color}
          fillOpacity={0.35}
          stroke={CONDITION_BY_KEY.crown.color}
          strokeWidth={3}
          pointerEvents="none"
        />
      )}

      {missing && (
        <g pointerEvents="none">
          <rect x={0} y={0} width={S} height={S} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />
          <path
            d={`M4,4 L${S - 4},${S - 4} M${S - 4},4 L4,${S - 4}`}
            stroke={CONDITION_BY_KEY.missing.color}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      )}

      {/* Planned work is an overlay ring rather than a fill, so it reads
          alongside whatever is already charted underneath. */}
      {state.planned && (
        <rect
          x={-3.5}
          y={-3.5}
          width={S + 7}
          height={S + 7}
          rx={3}
          fill="none"
          stroke={CONDITION_BY_KEY.planned.color}
          strokeWidth={2.5}
          strokeDasharray="5 3"
          pointerEvents="none"
        />
      )}

      {pending && (
        <circle
          cx={S - 3}
          cy={3}
          r={4.5}
          fill="#f59e0b"
          stroke="#ffffff"
          strokeWidth={1.5}
          pointerEvents="none"
        />
      )}

      {/* Whole-tooth modes (and plain selection) take the click across the
          entire square — a 44px target rather than a 13px sliver. */}
      <rect
        x={0}
        y={0}
        width={S}
        height={S}
        fill="transparent"
        role="button"
        aria-label={`${toothNumber} — ${toothName(toothNumber)}`}
        className="cursor-pointer"
        pointerEvents={surfacePickable ? 'none' : 'auto'}
        onClick={() => onPick(toothNumber, null)}
      >
        <title>{`${toothNumber} — ${toothName(toothNumber)}`}</title>
      </rect>
    </g>
  )
}
