import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ToothDetailPanel from './ToothDetailPanel'
import type { ChartVisit, ToothRecord, ToothState } from './types'

vi.mock('./api', () => ({ attachToothImage: vi.fn(), getSignedToothImageUrl: vi.fn() }))
const api = await import('./api')

function record(partial: Partial<ToothRecord> = {}): ToothRecord {
  return {
    id: 'tr-1',
    seq: 1,
    patient_id: 'p1',
    visit_id: 'v1',
    tooth_number: 16,
    surface: 'occlusal',
    condition: 'decayed',
    image_path: null,
    image_name: null,
    created_by: null,
    created_at: '2026-03-01T00:00:00Z',
    ...partial,
  }
}

const VISITS = new Map<string, ChartVisit>([
  [
    'v1',
    {
      id: 'v1',
      visit_date: '2026-03-01T00:00:00Z',
      visit_notes: { notes: 'Deep occlusal caries, restoration planned.' },
    },
  ],
])

function renderPanel(
  opts: {
    tooth?: number | null
    state?: Partial<ToothState>
    history?: ToothRecord[]
    pending?: {
      key: string
      tooth_number: number
      surface: 'occlusal' | null
      condition: 'decayed'
    }[]
    selectedCondition?: 'decayed' | 'missing' | null
  } = {},
) {
  const onMark = vi.fn()
  const onRemovePending = vi.fn()
  const onRecordUpdated = vi.fn()
  render(
    <MemoryRouter>
      <ToothDetailPanel
        patientId="p1"
        toothNumber={opts.tooth === undefined ? 16 : opts.tooth}
        state={{ condition: null, surfaces: {}, planned: false, ...opts.state }}
        history={opts.history ?? []}
        pending={opts.pending ?? []}
        visitsById={VISITS}
        selectedCondition={opts.selectedCondition ?? null}
        onMark={onMark}
        onRemovePending={onRemovePending}
        onRecordUpdated={onRecordUpdated}
      />
    </MemoryRouter>,
  )
  return { onMark, onRemovePending, onRecordUpdated }
}

describe('ToothDetailPanel', () => {
  beforeEach(() => {
    vi.mocked(api.getSignedToothImageUrl).mockResolvedValue('https://signed.example/xray.png')
    vi.mocked(api.attachToothImage).mockResolvedValue(
      record({ image_path: 'tooth/p1/16/x.png', image_name: 'x.png' }),
    )
    vi.stubGlobal('open', vi.fn())
  })

  it('invites a tooth to be picked when none is', () => {
    renderPanel({ tooth: null })
    expect(screen.getByText(/tap a tooth on the chart/i)).toBeInTheDocument()
  })

  it('names the tooth in words, not just its number', () => {
    renderPanel({ tooth: 16 })
    expect(screen.getByText('Tooth 16')).toBeInTheDocument()
    expect(screen.getByText(/upper right first molar/i)).toBeInTheDocument()
  })

  it('reads out the current findings by surface', () => {
    renderPanel({
      state: { surfaces: { occlusal: 'decayed', mesial: 'filled' }, planned: true },
    })
    expect(screen.getByText(/occlusal: decayed/i)).toBeInTheDocument()
    expect(screen.getByText(/mesial: filled/i)).toBeInTheDocument()
    expect(screen.getByText(/planned treatment/i)).toBeInTheDocument()
  })

  // The surface zones on the chart are ~13px. These buttons are the
  // fingertip-friendly way to do the same thing on a tablet.
  it('offers full-size surface buttons when a surface tool is chosen', async () => {
    const user = userEvent.setup()
    const { onMark } = renderPanel({ selectedCondition: 'decayed' })
    await user.click(screen.getByRole('button', { name: 'Occlusal' }))
    expect(onMark).toHaveBeenCalledWith(16, 'occlusal')
  })

  it('offers one whole-tooth button for a whole-tooth tool', async () => {
    const user = userEvent.setup()
    const { onMark } = renderPanel({ selectedCondition: 'missing' })
    await user.click(screen.getByRole('button', { name: /apply to whole tooth/i }))
    expect(onMark).toHaveBeenCalledWith(16, null)
  })

  it('lets a staged mark be taken back before saving', async () => {
    const user = userEvent.setup()
    const { onRemovePending } = renderPanel({
      pending: [{ key: 'k1', tooth_number: 16, surface: 'occlusal', condition: 'decayed' }],
    })
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove/i }))
    expect(onRemovePending).toHaveBeenCalledWith('k1')
  })

  // The chart entry and the dentist's write-up of that visit belong
  // together — that link is the roadmap's requirement for this phase.
  it('shows each entry against the visit note it belongs to', () => {
    renderPanel({ history: [record()] })
    expect(screen.getByText(/decayed — occlusal/i)).toBeInTheDocument()
    expect(screen.getByText(/deep occlusal caries/i)).toBeInTheDocument()
  })

  it('says when an entry is not tied to a visit', () => {
    renderPanel({ history: [record({ visit_id: null })] })
    expect(screen.getByText(/not linked to a visit/i)).toBeInTheDocument()
  })

  it('reads history newest first', () => {
    renderPanel({
      history: [
        record({
          id: 'a',
          seq: 1,
          condition: 'decayed',
          created_at: '2026-01-01T00:00:00Z',
        }),
        record({
          id: 'b',
          seq: 2,
          condition: 'filled',
          created_at: '2026-06-01T00:00:00Z',
        }),
      ],
    })
    const entries = screen.getAllByText(/decayed — occlusal|filled — occlusal/i)
    expect(entries[0]).toHaveTextContent(/filled/i)
  })

  it('attaches an image to one entry', async () => {
    const user = userEvent.setup()
    const { onRecordUpdated } = renderPanel({ history: [record()] })
    await user.upload(
      screen.getByLabelText(/image for decayed/i),
      new File(['x'], 'xray.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: /attach image/i }))
    await waitFor(() => expect(api.attachToothImage).toHaveBeenCalled())
    expect(vi.mocked(api.attachToothImage).mock.calls[0][0]).toMatchObject({
      recordId: 'tr-1',
      toothNumber: 16,
    })
    expect(onRecordUpdated).toHaveBeenCalled()
  })

  it('complains rather than no-oping when Attach is pressed with no file', async () => {
    const user = userEvent.setup()
    renderPanel({ history: [record()] })
    await user.click(screen.getByRole('button', { name: /attach image/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an image first/i)
    expect(api.attachToothImage).not.toHaveBeenCalled()
  })

  // Replacing an image would orphan the old object, which only an admin
  // could clear up — so a record that already has one only offers viewing.
  it('offers viewing, not replacing, once an image is attached', () => {
    renderPanel({
      history: [record({ image_path: 'tooth/p1/16/x.png', image_name: 'xray.png' })],
    })
    expect(screen.getByRole('button', { name: /view image/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /attach image/i })).not.toBeInTheDocument()
  })

  it('opens a tooth image through a signed url', async () => {
    const user = userEvent.setup()
    renderPanel({
      history: [record({ image_path: 'tooth/p1/16/x.png', image_name: 'xray.png' })],
    })
    await user.click(screen.getByRole('button', { name: /view image/i }))
    await waitFor(() => expect(api.getSignedToothImageUrl).toHaveBeenCalledWith('tooth/p1/16/x.png'))
  })
})
