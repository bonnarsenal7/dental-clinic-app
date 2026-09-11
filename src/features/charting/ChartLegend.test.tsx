import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ChartLegend from './ChartLegend'
import { TOOTH_CONDITIONS } from './chartVocabulary'

describe('ChartLegend', () => {
  // The legend and the tool picker are the same control: the colours a
  // dentist reads off the chart are the buttons they mark it with.
  it('offers every condition in the vocabulary', () => {
    render(<ChartLegend selected={null} onSelect={vi.fn()} />)
    for (const c of TOOTH_CONDITIONS) {
      expect(screen.getByRole('button', { name: c.label })).toBeInTheDocument()
    }
  })

  // Inspect is the default so a dentist can browse a chart chairside
  // without a stray tap altering it.
  it('starts in inspect, not in a marking mode', () => {
    render(<ChartLegend selected={null} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /inspect/i })).toBeInTheDocument()
    expect(screen.getByText(/tap a tooth to see its history/i)).toBeInTheDocument()
  })

  it('explains what the chosen tool will do', () => {
    render(<ChartLegend selected="decayed" onSelect={vi.fn()} />)
    expect(screen.getByText(/tap the affected surface/i)).toBeInTheDocument()
  })

  it('warns that a whole-tooth condition clears surface findings', () => {
    render(<ChartLegend selected="missing" onSelect={vi.fn()} />)
    expect(screen.getByText(/clears its surface findings/i)).toBeInTheDocument()
  })

  it('says planned treatment leaves existing findings alone', () => {
    render(<ChartLegend selected="planned" onSelect={vi.fn()} />)
    expect(screen.getByText(/existing findings stay as charted/i)).toBeInTheDocument()
  })

  it('reports the chosen condition, and the way back to inspect', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ChartLegend selected="filled" onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /crown/i }))
    expect(onSelect).toHaveBeenCalledWith('crown')
    await user.click(screen.getByRole('button', { name: /inspect/i }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})
