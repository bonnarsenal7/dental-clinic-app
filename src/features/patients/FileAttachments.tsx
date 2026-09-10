import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getSignedFileUrl, listPatientFiles, uploadPatientFile } from './api'
import type { PatientFile } from './types'

export default function FileAttachments({ patientId }: { patientId: string }) {
  const { staff } = useAuth()
  const [files, setFiles] = useState<PatientFile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileType, setFileType] = useState('xray')
  const inputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    try {
      setFiles(await listPatientFiles(patientId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  async function handleUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) {
      setError('Choose a file first, then click Upload.')
      return
    }
    if (!staff) return
    setUploading(true)
    setError(null)
    try {
      await uploadPatientFile({ patientId, staffId: staff.id, file, fileType })
      if (inputRef.current) inputRef.current.value = ''
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  async function handleView(path: string) {
    try {
      const url = await getSignedFileUrl(path)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-slate-700">Attachments</h2>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={fileType}
          onChange={(e) => setFileType(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="xray">X-ray</option>
          <option value="id_scan">ID scan</option>
          <option value="other">Other</option>
        </select>
        <input ref={inputRef} type="file" className="text-sm" />
        <button
          type="button"
          onClick={() => void handleUpload()}
          disabled={uploading}
          className="rounded-md bg-slate-800 text-white text-sm font-medium px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {files === null && <p className="text-slate-400 text-sm">Loading…</p>}
        {files?.length === 0 && <p className="text-slate-400 text-sm">No files attached yet.</p>}
        {files?.map((f) => (
          <button
            key={f.id}
            onClick={() => void handleView(f.storage_path)}
            className="text-left text-sm text-slate-700 hover:underline flex items-center gap-2"
          >
            <span className="text-xs uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {f.file_type ?? 'file'}
            </span>
            {f.file_name}
          </button>
        ))}
      </div>
    </section>
  )
}
