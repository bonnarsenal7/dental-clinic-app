import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { logPatientView } from '../../core/auditView'
import { getMedicalHistory, getPatient } from '../patients/api'
import MedicalAlerts from '../patients/MedicalAlerts'
import type { MedicalHistory, Patient } from '../patients/types'
import { CONDITION_BY_KEY } from './chartVocabulary'
import type { ToothConditionKey, ToothSurface } from './chartVocabulary'
import { deriveChart, toothStateOf } from './chartState'
import { createVisitToday, listChartVisits, listToothRecords, saveToothMarks } from './api'
import ChartLegend from './ChartLegend'
import Odontogram from './Odontogram'
import ToothDetailPanel from './ToothDetailPanel'
import type { ChartVisit, PendingMark, ToothRecord } from './types'
import type { InteractionMode } from './ToothGlyph'
import { toMessage } from '../../core/errors'
import { ErrorState, LoadingState } from '../../core/components/states'

export default function PatientChartPage() {
  const { id: patientId } = useParams<{ id: string }>()
  const { staff } = useAuth()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [medical, setMedical] = useState<MedicalHistory | null>(null)
  const [records, setRecords] = useState<ToothRecord[]>([])
  const [visits, setVisits] = useState<ChartVisit[]>([])
  const [visitId, setVisitId] = useState<string>('')
  const [selectedCondition, setSelectedCondition] = useState<ToothConditionKey | null>(null)
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [pending, setPending] = useState<PendingMark[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingVisit, setCreatingVisit] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientId || !staff) return
    logPatientView(patientId, staff.id, 'tooth_records')
  }, [patientId, staff])

  useEffect(() => {
    if (!patientId) return
    setLoading(true)
    Promise.all([
      getPatient(patientId),
      listToothRecords(patientId),
      listChartVisits(patientId),
      getMedicalHistory(patientId),
    ])
      .then(([p, r, v, m]) => {
        setPatient(p)
        setRecords(r)
        setVisits(v)
        setMedical(m)
        // Default to today's visit when there is one, so the common case —
        // charting the patient who is in the chair — needs no setup.
        const today = new Date().toDateString()
        const todaysVisit = v.find((visit) => new Date(visit.visit_date).toDateString() === today)
        if (todaysVisit) setVisitId(todaysVisit.id)
      })
      .catch((e) => setError(toMessage(e)))
      .finally(() => setLoading(false))
  }, [patientId])

  // Staged marks live only in this component, so closing the tab would
  // silently drop chairside findings. Warn instead.
  useEffect(() => {
    if (pending.length === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pending.length])

  // Staged marks fold on top of saved records as if they were the newest
  // entries, so the chart previews exactly what saving would produce.
  const chart = useMemo(() => deriveChart([...records, ...pending]), [records, pending])

  const pendingTeeth = useMemo(() => new Set(pending.map((m) => m.tooth_number)), [pending])

  const visitsById = useMemo(() => new Map(visits.map((v) => [v.id, v])), [visits])

  const historyForTooth = useMemo(
    () => (selectedTooth === null ? [] : records.filter((r) => r.tooth_number === selectedTooth)),
    [records, selectedTooth],
  )

  const pendingForTooth = useMemo(
    () => (selectedTooth === null ? [] : pending.filter((m) => m.tooth_number === selectedTooth)),
    [pending, selectedTooth],
  )

  const mode: InteractionMode = selectedCondition
    ? CONDITION_BY_KEY[selectedCondition].kind === 'surface'
      ? 'surface'
      : 'tooth'
    : 'inspect'

  function addMark(toothNumber: number, surface: ToothSurface | null) {
    if (!selectedCondition) return
    const condition = CONDITION_BY_KEY[selectedCondition]
    // Surface conditions need a surface; the database enforces this too
    // (tooth_records_surface_scope_check), so don't stage a row that would
    // be rejected on save.
    if (condition.kind === 'surface' && !surface) return
    setPending((current) => [
      ...current,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tooth_number: toothNumber,
        surface: condition.kind === 'surface' ? surface : null,
        condition: selectedCondition,
      },
    ])
  }

  function handlePick(toothNumber: number, surface: ToothSurface | null) {
    setSelectedTooth(toothNumber)
    if (selectedCondition) addMark(toothNumber, surface)
  }

  async function handleNewVisit() {
    if (!patientId || !staff) return
    setError(null)
    setCreatingVisit(true)
    try {
      const visit = await createVisitToday(patientId, staff.id)
      setVisits((current) => [visit, ...current])
      setVisitId(visit.id)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setCreatingVisit(false)
    }
  }

  async function handleSave() {
    if (!patientId || !staff) return
    if (!visitId) {
      setError('Choose the visit these findings belong to, or start a visit for today.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const saved = await saveToothMarks({ patientId, staffId: staff.id, visitId, marks: pending })
      // Re-sorted by seq rather than trusting the insert's return order —
      // the fold reads the log in seq order, so the in-memory copy has to
      // match what a reload would give.
      setRecords((current) => [...current, ...saved].sort((a, b) => a.seq - b.seq))
      setPending([])
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (error && !patient) {
    return <ErrorState message={error} />
  }
  if (loading || !patient || !patientId) return <LoadingState label="Loading chart…" />

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Dental chart — {patient.name}</h1>
          <p className="text-slate-500 text-sm mt-1">
            FDI numbering, as on the paper chart. Findings are kept as a history per tooth, so
            re-charting a tooth adds an entry rather than overwriting the old one.
          </p>
        </div>
        <Link
          to={`/patients/${patientId}`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Back to profile
        </Link>
      </div>

      {error && <ErrorState message={error} />}

      {/* Above the chart, not inside a panel further down: the point is that
          nobody can start marking teeth without having passed the allergy
          they are about to inject around. */}
      <MedicalAlerts medical={medical} />

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm text-slate-600" htmlFor="chart-visit">
          Recording against visit
        </label>
        <select
          id="chart-visit"
          value={visitId}
          onChange={(e) => setVisitId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm max-w-md"
        >
          <option value="">Select a visit…</option>
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {new Date(v.visit_date).toLocaleDateString()}
              {v.visit_notes?.notes ? ` — ${v.visit_notes.notes.slice(0, 60)}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleNewVisit()}
          disabled={creatingVisit}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {creatingVisit ? 'Starting…' : '+ Start a visit for today'}
        </button>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5">
          <ChartLegend selected={selectedCondition} onSelect={setSelectedCondition} />
          <Odontogram
            chart={chart}
            pendingTeeth={pendingTeeth}
            selectedTooth={selectedTooth}
            mode={mode}
            onPick={handlePick}
          />
        </section>

        <ToothDetailPanel
          patientId={patientId}
          toothNumber={selectedTooth}
          state={toothStateOf(chart, selectedTooth ?? -1)}
          history={historyForTooth}
          pending={pendingForTooth}
          visitsById={visitsById}
          selectedCondition={selectedCondition}
          onMark={handlePick}
          onRemovePending={(key) => setPending((current) => current.filter((m) => m.key !== key))}
          onRecordUpdated={(updated) =>
            setRecords((current) => current.map((r) => (r.id === updated.id ? updated : r)))
          }
        />
      </div>

      {/* Nothing is written until this bar is used, so a mis-tap chairside
          is undone with a tap rather than a database correction. */}
      {pending.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 bg-white border-t border-slate-200 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{pending.length}</span> unsaved{' '}
              {pending.length === 1 ? 'mark' : 'marks'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPending([])}
                disabled={saving}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save to chart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
