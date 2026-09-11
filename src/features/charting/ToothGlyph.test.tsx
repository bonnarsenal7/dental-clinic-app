import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ToothGlyph from './ToothGlyph'
import type { InteractionMode } from './ToothGlyph'
import type { ToothState } from './types'

function state(partial: Partial<ToothState> = {}): ToothState {
  return { condition: null, surfaces: {}, planned: false, ...partial }
}

function renderTooth(opts: {
  toothNumber?: number
  mode?: InteractionMode
  state?: ToothState
  pending?: boolean
  selected?: boolean
} = {}) {
  const onPick = vi.fn()
  render(
    <svg>
      <ToothGlyph
        toothNumber={opts.toothNumber ?? 16}
        state={opts.state ?? state()}
        pending={opts.pending ?? false}
        selected={opts.selected ?? false}
        mode={opts.mode ?? 'inspect'}
        onPick={onPick}
      />
    </svg>,
  )
  return onPick
}

/** Zones and teeth are reached by their accessible name — the same string
 *  the tooltip shows, so the test picks what a dentist sees. */
const target = (name: string | RegExp) => screen.getByRole('button', { name })

describe('ToothGlyph interaction', () => {
  it('selects the tooth without marking it in inspect mode', async () => {
    const user = userEvent.setup()
    const onPick = renderTooth({ mode: 'inspect' })
    await user.click(target(/^16 —/))
    expect(onPick).toHaveBeenCalledWith(16, null)
  })

  it('offers no surface targets in inspect mode', () => {
    renderTooth({ mode: 'inspect' })
    expect(screen.queryByRole('button', { name: /occlusal — tooth 16/i })).not.toBeInTheDocument()
  })

  // Whole-tooth conditions take the full 44px square rather than a 13px
  // sliver, so a fingertip can't miss between zones.
  it('takes the whole tooth in tooth mode', async () => {
    const user = userEvent.setup()
    const onPick = renderTooth({ mode: 'tooth' })
    await user.click(target(/^16 —/))
    expect(onPick).toHaveBeenCalledWith(16, null)
    expect(screen.queryByRole('button', { name: /occlusal — tooth 16/i })).not.toBeInTheDocument()
  })

  it('picks the surface the tooltip names', async () => {
    const user = userEvent.setup()
    const onPick = renderTooth({ mode: 'surface', toothNumber: 16 })
    await user.click(target('Occlusal — tooth 16'))
    expect(onPick).toHaveBeenCalledWith(16, 'occlusal')
  })

  // Upper-right: the midline is to the right, so the right edge is mesial.
  // Upper-left: it is the other way round. Charting the wrong one is a
  // wrong clinical record, not a cosmetic slip.
  it('maps the same edge to opposite surfaces across the midline', async () => {
    const user = userEvent.setup()
    const onPick16 = renderTooth({ mode: 'surface', toothNumber: 16 })
    await user.click(target('Mesial — tooth 16'))
    expect(onPick16).toHaveBeenCalledWith(16, 'mesial')
    target('Distal — tooth 16')
  })

  it('names surfaces the way a dentist reads them on a front tooth', () => {
    renderTooth({ mode: 'surface', toothNumber: 11 })
    expect(target('Incisal — tooth 11')).toBeInTheDocument()
    expect(target('Labial — tooth 11')).toBeInTheDocument()
    expect(target('Palatal — tooth 11')).toBeInTheDocument()
  })

  it('exposes all five surfaces when they are pickable', () => {
    renderTooth({ mode: 'surface', toothNumber: 46 })
    for (const label of ['Mesial', 'Distal', 'Buccal', 'Lingual', 'Occlusal']) {
      expect(target(`${label} — tooth 46`)).toBeInTheDocument()
    }
  })

  // A missing tooth has no surfaces left to chart, so surface mode must
  // fall back to the whole tooth rather than offering dead zones.
  it('falls back to the whole tooth when the tooth is missing', async () => {
    const user = userEvent.setup()
    const onPick = renderTooth({ mode: 'surface', state: state({ condition: 'missing' }) })
    expect(screen.queryByRole('button', { name: /occlusal — tooth 16/i })).not.toBeInTheDocument()
    await user.click(target(/^16 —/))
    expect(onPick).toHaveBeenCalledWith(16, null)
  })

  it('names the tooth in its tooltip', () => {
    renderTooth({ toothNumber: 65 })
    expect(target('65 — Upper left second molar (primary)')).toBeInTheDocument()
  })
})
