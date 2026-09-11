import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { searchPatients } from '../patients/api'
import type { Patient } from '../patients/types'
import { listProcedures } from '../billing/api'
import type { Procedure } from '../billing/types'
import { bookAppointment, listDentists } from './api'

interface BookingForm {
  patient_id: string
  dentist_id: string
  date: string
  time: string
  duration_minutes: string
  reason: string
  procedure_id: string
  reception_notes: string
}

export default function BookAppointmentForm({
  defaultDate,
  staffId,
  defaultPatientId,
  onBooked,
}: {
  defaultDate: string
  staffId: string
  defaultPatientId?: string
  onBooked: () => void
}) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [dentists, setDentists] = useState<{ id: string; name: string }[]>([])
  const [procedures, setProcedures] = useState<Procedure[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<BookingForm>({
    defaultValues: {
      patient_id: defaultPatientId ?? '',
      dentist_id: '',
      date: defaultDate,
      time: '09:00',
      duration_minutes: '30',
      reason: '',
      procedure_id: '',
      reception_notes: '',
    },
  })

  useEffect(() => {
    Promise.all([listDentists(), listProcedures()])
      .then(([d, p]) => {
        setDentists(d)
        setProcedures(p)
      })
      .catch((e) => setError(toMessage(e)))
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      searchPatients(query).then(setPatients).catch((e) => setError(toMessage(e)))
    }, 250)
    return () => clearTimeout(handle)
  }, [query])

  const selectedProcedure = watch('procedure_id')

  // Choosing a procedure fills the reason, since a receptionist booking
  // "Oral prophylaxis" shouldn't then have to type it again.
  useEffect(() => {
    const procedure = procedures.find((p) => p.id === selectedProcedure)
    if (procedure) setValue('reason', procedure.name)
  }, [selectedProcedure, procedures, setValue])

  async function onSubmit(values: BookingForm) {
    setError(null)
    if (!values.patient_id) {
      setError('Choose a patient first.')
      return
    }
    try {
      // Built from the local date and time fields, so a 5pm booking is 5pm
      // in the clinic rather than in UTC.
      const scheduledAt = new Date(`${values.date}T${values.time}`).toISOString()
      await bookAppointment({
        patientId: values.patient_id,
        dentistId: values.dentist_id || null,
        scheduledAt,
        durationMinutes: Number(values.duration_minutes),
        reason: values.reason.trim() || null,
        procedureId: values.procedure_id || null,
        receptionNotes: values.reception_notes.trim() || null,
        staffId,
      })
      onBooked()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4"
    >
      <h2 className="text-sm font-semibold text-slate-700">Book an appointment</h2>

      {error && <ErrorState message={error} />}

      {!defaultPatientId && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-slate-700" htmlFor="appt-patient-search">Patient</label>
          <input
            id="appt-patient-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or contact number…"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select {...register('patient_id')} size={4} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.cell_number ? ` · ${p.cell_number}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Date
          <input type="date" {...register('date', { required: true })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Time
          <input type="time" {...register('time', { required: true })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Minutes
          <input type="number" min="5" max="480" step="5" {...register('duration_minutes', { required: true })} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Dentist
          <select {...register('dentist_id')} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— unassigned —</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Procedure
          <select {...register('procedure_id')} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">— not specified —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Reason
        <input {...register('reason')} placeholder="e.g. Cleaning" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Front-desk note
        <input
          {...register('reception_notes')}
          placeholder="e.g. bring HMO card — not for clinical notes"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-slate-400">
          Visible to reception. Clinical notes belong on the visit, where reception can't see them.
        </span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Booking…' : 'Book appointment'}
      </button>
    </form>
  )
}
