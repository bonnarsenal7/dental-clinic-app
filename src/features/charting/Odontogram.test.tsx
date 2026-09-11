import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Odontogram from './Odontogram'
import { ARCH_ROWS } from './chartVocabulary'
import { deriveChart } from './chartState'

const ALL_TEETH = ARCH_ROWS.flatMap((r) => [...r.left, ...r.right])

function renderChart(opts: {
  mode?: 'inspect' | 'tooth' | 'surface'
  chart?: ReturnType<typeof deriveChart>
  pendingTeeth?: Set<number>
  selectedTooth?: number | null
} = {}) {
  const onPick = vi.fn()
  const { container } = render(
    <Odontogram
      chart={opts.chart ?? {}}
      pendingTeeth={opts.pendingTeeth ?? new Set()}
      selectedTooth={opts.selectedTooth ?? null}
      mode={opts.mode ?? 'inspect'}
      onPick={onPick}
    />,
  )
  return { onPick, container }
}

describe('Odontogram', () => {
  // A tooth missing from the chart cannot be charted at all, and nobody
  // would notice until a patient needed that tooth recorded.
  it('renders every one of the 52 teeth as a target', () => {
    renderChart()
    for (const n of ALL_TEETH) {
      expect(screen.getByRole('button', { name: new RegExp(`^${n} —`) }), `tooth ${n}`).toBeInTheDocument()
    }
    expect(screen.getAllByRole('button')).toHaveLength(52)
  })

  it('labels each tooth with its FDI number', () => {
    const { container } = renderChart()
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent)
    for (const n of ALL_TEETH) expect(labels).toContain(String(n))
  })

  it('marks the patient\'s right and left', () => {
    const { container } = renderChart()
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels).toContain('R')
    expect(labels).toContain('L')
  })

  it('reports which tooth was picked', async () => {
    const user = userEvent.setup()
    const { onPick } = renderChart()
    await user.click(screen.getByRole('button', { name: /^36 —/ }))
    expect(onPick).toHaveBeenCalledWith(36, null)
  })

  it('opens five surfaces per tooth in surface mode', async () => {
    const user = userEvent.setup()
    const { onPick } = renderChart({ mode: 'surface' })
    // 52 teeth × (5 zones + 1 whole-tooth fallback)
    expect(screen.getAllByRole('button')).toHaveLength(52 * 6)
    await user.click(screen.getByRole('button', { name: 'Distal — tooth 36' }))
    expect(onPick).toHaveBeenCalledWith(36, 'distal')
  })

  // The chart has a fixed aspect ratio and can't usefully reflow, so on a
  // narrow tablet it must scroll rather than shrink past legible.
  it('scrolls sideways rather than shrinking on a narrow screen', () => {
    const { container } = renderChart()
    const scroller = container.querySelector('.overflow-x-auto')
    expect(scroller).toBeInTheDocument()
    // ...and says so. A chart that silently clips reads as a chart with
    // teeth missing, which on a portrait tablet is most of an arch.
    expect(scroller).toHaveClass('scroll-hint-x')
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.style.minWidth).toBe('720px')
  })

  it('keeps both dentitions on one midline', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg')!
    // viewBox is "-14 -6 <width> <height>"; the dashed midline sits at
    // width/2 so permanent and primary rows line up.
    const [, , width] = svg.getAttribute('viewBox')!.split(' ').map(Number)
    const midline = [...container.querySelectorAll('line')]
      .find((l) => l.getAttribute('stroke-dasharray'))
    expect(Number(midline!.getAttribute('x1'))).toBeCloseTo((width - 28) / 2, 0)
  })

  it('carries an accessible name for the chart itself', () => {
    renderChart()
    expect(screen.getByRole('group', { name: /fdi tooth numbering/i })).toBeInTheDocument()
  })
})
