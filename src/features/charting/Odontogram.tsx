import { ARCH_ROWS } from './chartVocabulary'
import type { ArchRow, ToothSurface } from './chartVocabulary'
import { toothStateOf } from './chartState'
import ToothGlyph, { TOOTH_SIZE } from './ToothGlyph'
import type { InteractionMode } from './ToothGlyph'
import type { ChartState } from './types'

// Layout is computed rather than hand-placed so the two dentitions line up
// on a shared midline. The permanent row is the widest, and the primary
// rows are centred inside it.
const GAP = 6
const MIDLINE_GAP = 18
const LABEL_OFFSET = 13

const halfWidth = (count: number) => count * TOOTH_SIZE + (count - 1) * GAP
const rowWidth = (count: number) => halfWidth(count) * 2 + MIDLINE_GAP

const CHART_WIDTH = rowWidth(8)
const MIDLINE_X = CHART_WIDTH / 2

interface RowPlacement {
  row: ArchRow
  toothY: number
  labelY: number
}

// Upper arch on top, lower beneath, permanent teeth outermost — the same
// arrangement as the clinic's paper chart. Numbers sit outside the arch on
// both sides (above the upper teeth, below the lower ones) so they never
// collide with a tooth's selection or planned-treatment ring.
const UPPER_PERMANENT_Y = 22
const UPPER_PRIMARY_Y = 96
const LOWER_PRIMARY_Y = 164
const LOWER_PERMANENT_Y = 240

const ROW_PLACEMENTS: RowPlacement[] = [
  { row: ARCH_ROWS[0], toothY: UPPER_PERMANENT_Y, labelY: UPPER_PERMANENT_Y - LABEL_OFFSET },
  { row: ARCH_ROWS[1], toothY: UPPER_PRIMARY_Y, labelY: UPPER_PRIMARY_Y - LABEL_OFFSET },
  { row: ARCH_ROWS[2], toothY: LOWER_PRIMARY_Y, labelY: LOWER_PRIMARY_Y + TOOTH_SIZE + LABEL_OFFSET },
  { row: ARCH_ROWS[3], toothY: LOWER_PERMANENT_Y, labelY: LOWER_PERMANENT_Y + TOOTH_SIZE + LABEL_OFFSET },
]

// The occlusal plane — the line the two arches bite against.
const OCCLUSAL_PLANE_Y = 152
const CHART_HEIGHT = LOWER_PERMANENT_Y + TOOTH_SIZE + LABEL_OFFSET + 8

function toothX(row: ArchRow, side: 'left' | 'right', index: number): number {
  const offset = (CHART_WIDTH - rowWidth(row.left.length)) / 2
  const base =
    side === 'left' ? offset : offset + halfWidth(row.left.length) + MIDLINE_GAP
  return base + index * (TOOTH_SIZE + GAP)
}

interface OdontogramProps {
  chart: ChartState
  /** Teeth carrying staged, unsaved marks. */
  pendingTeeth: Set<number>
  selectedTooth: number | null
  mode: InteractionMode
  onPick: (toothNumber: number, surface: ToothSurface | null) => void
}

export default function Odontogram({
  chart,
  pendingTeeth,
  selectedTooth,
  mode,
  onPick,
}: OdontogramProps) {
  return (
    // The chart has a fixed aspect ratio and can't usefully reflow, so on a
    // narrow tablet it scrolls sideways rather than shrinking past legible —
    // and scroll-hint-x shades whichever edge still has teeth behind it, so
    // nobody mistakes a clipped chart for a missing tooth.
    <div className="overflow-x-auto scroll-hint-x">
      <svg
        viewBox={`-14 -6 ${CHART_WIDTH + 28} ${CHART_HEIGHT + 12}`}
        width="100%"
        style={{ minWidth: 720 }}
        role="group"
        aria-label="Dental chart, FDI tooth numbering"
      >
        {/* Read as if facing the patient: their right is on the left. */}
        <text x={-8} y={OCCLUSAL_PLANE_Y - 6} textAnchor="middle" className="fill-slate-400" fontSize={11} fontWeight={600}>
          R
        </text>
        <text x={CHART_WIDTH + 8} y={OCCLUSAL_PLANE_Y - 6} textAnchor="middle" className="fill-slate-400" fontSize={11} fontWeight={600}>
          L
        </text>

        <line
          x1={-14}
          y1={OCCLUSAL_PLANE_Y}
          x2={CHART_WIDTH + 14}
          y2={OCCLUSAL_PLANE_Y}
          stroke="#e2e8f0"
          strokeWidth={1.5}
        />
        <line
          x1={MIDLINE_X}
          y1={0}
          x2={MIDLINE_X}
          y2={CHART_HEIGHT}
          stroke="#e2e8f0"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {ROW_PLACEMENTS.map(({ row, toothY, labelY }) => (
          <g key={row.id}>
            {(['left', 'right'] as const).flatMap((side) =>
              row[side].map((toothNumber, index) => {
                const x = toothX(row, side, index)
                return (
                  <g key={toothNumber}>
                    <text
                      x={x + TOOTH_SIZE / 2}
                      y={labelY}
                      textAnchor="middle"
                      fontSize={11}
                      className={
                        selectedTooth === toothNumber
                          ? 'fill-slate-900 font-semibold'
                          : 'fill-slate-400'
                      }
                    >
                      {toothNumber}
                    </text>
                    <g transform={`translate(${x}, ${toothY})`}>
                      <ToothGlyph
                        toothNumber={toothNumber}
                        state={toothStateOf(chart, toothNumber)}
                        pending={pendingTeeth.has(toothNumber)}
                        selected={selectedTooth === toothNumber}
                        mode={mode}
                        onPick={onPick}
                      />
                    </g>
                  </g>
                )
              }),
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
