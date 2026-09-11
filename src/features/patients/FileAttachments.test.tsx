import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileAttachments from './FileAttachments'

vi.mock('./api', () => ({
  listPatientFiles: vi.fn(),
  uploadPatientFile: vi.fn(),
  getSignedFileUrl: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ staff: { id: 's1', name: 'Reception', role: 'receptionist' } }),
}))

const api = await import('./api')

const FILES = [
  { id: 'f1', patient_id: 'p1', storage_path: 'attachments/p1/xray.png', file_name: 'xray.png', file_type: 'xray', uploaded_by: null, created_at: '2026-09-01T00:00:00Z' },
]

describe('FileAttachments', () => {
  beforeEach(() => {
    vi.mocked(api.listPatientFiles).mockResolvedValue(FILES as never)
    vi.mocked(api.uploadPatientFile).mockResolvedValue(undefined)
    vi.mocked(api.getSignedFileUrl).mockResolvedValue('https://signed.example/xray.png')
    vi.stubGlobal('open', vi.fn())
  })

  it('names its controls', async () => {
    render(<FileAttachments patientId="p1" />)
    await screen.findByText('xray.png')
    expect(screen.getByLabelText(/file type/i)).toHaveProperty('tagName', 'SELECT')
    expect(screen.getByLabelText(/file to upload/i)).toHaveProperty('type', 'file')
  })

  it('lists what is already attached, with its kind', async () => {
    render(<FileAttachments patientId="p1" />)
    expect(await screen.findByText('xray.png')).toBeInTheDocument()
    expect(screen.getByText('xray')).toBeInTheDocument()
  })

  // Clicking Upload with nothing chosen used to do nothing at all. The
  // same silent no-op was fixed once already on this screen (efda896);
  // this pins it.
  it('says something when Upload is pressed with no file chosen', async () => {
    const user = userEvent.setup()
    render(<FileAttachments patientId="p1" />)
    await screen.findByText('xray.png')
    await user.click(screen.getByRole('button', { name: /upload/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a file first/i)
    expect(api.uploadPatientFile).not.toHaveBeenCalled()
  })

  it('uploads the chosen file with the chosen type', async () => {
    const user = userEvent.setup()
    render(<FileAttachments patientId="p1" />)
    await screen.findByText('xray.png')
    await user.selectOptions(screen.getByLabelText(/file type/i), 'id_scan')
    await user.upload(
      screen.getByLabelText(/file to upload/i),
      new File(['x'], 'id.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: /upload/i }))
    await waitFor(() => expect(api.uploadPatientFile).toHaveBeenCalled())
    expect(vi.mocked(api.uploadPatientFile).mock.calls[0][0]).toMatchObject({
      patientId: 'p1', fileType: 'id_scan',
    })
  })

  // The bucket is private, so a file must be opened through a short-lived
  // signed URL rather than a stored public link.
  it('opens a file through a signed url', async () => {
    const user = userEvent.setup()
    render(<FileAttachments patientId="p1" />)
    await user.click(await screen.findByText('xray.png'))
    await waitFor(() => expect(api.getSignedFileUrl).toHaveBeenCalledWith('attachments/p1/xray.png'))
    expect(window.open).toHaveBeenCalledWith('https://signed.example/xray.png', '_blank', 'noopener')
  })

  it('reports an upload failure as offline when the connection drops', async () => {
    const user = userEvent.setup()
    vi.mocked(api.uploadPatientFile).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<FileAttachments patientId="p1" />)
    await screen.findByText('xray.png')
    await user.upload(
      screen.getByLabelText(/file to upload/i),
      new File(['x'], 'id.png', { type: 'image/png' }),
    )
    await user.click(screen.getByRole('button', { name: /upload/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/you're offline/i)
  })
})
