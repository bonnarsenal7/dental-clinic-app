import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import { getPatient, searchPatients } from '../patients/api'
import type { Patient } from '../patients/types'
import { listProcedures } from '../billing/api'
import type { Procedure } from '../billing/types'
import { bookAppointment, listDentists } from './api'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'

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
  // Distinguishes "nothing matched" from "the first search hasn't landed
  // yet" — the form used to greet you with "No patients match that search."
  // before it had searched for anything.
  const [searched, setSearched] = useState(false)
  const [defaultPatientName, setDefaultPatientName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { isSubmitting, errors },
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
    if (defaultPatientId) return
    const handle = setTimeout(() => {
      searchPatients(query)
        .then((found) => {
          setPatients(found)
          setSearched(true)

          // A <select> whose chosen <option> is removed falls back to showing
          // the placeholder, but react-hook-form still holds the old id. The
          // form then books a patient who is nowhere on screen — so drop the
          // selection when the search no longer contains it.
          const chosen = getValues('patient_id')
          if (chosen && !found.some((p) => p.id === chosen)) setValue('patient_id', '')

          // Narrowing to a single patient has already answered the question;
          // selecting them is also the clearest sign that the search box and
          // the dropdown are connected at all.
          if (found.length === 1) setValue('patient_id', found[0].id)
        })
        .catch((e) => setError(toMessage(e)))
    }, 250)
    return () => clearTimeout(handle)
  }, [query, defaultPatientId, getValues, setValue])

  // With the chooser hidden there is nothing on screen saying who this
  // booking is for, which is a poor thing to be vague about.
  useEffect(() => {
    if (!defaultPatientId) return
    getPatient(defaultPatientId)
      .then((p) => setDefaultPatientName(p.name))
      .catch((e) => setError(toMessage(e)))
  }, [defaultPatientId])

  const matchHint = !searched
    ? 'Loading patients…'
    : patients.length === 0
      ? 'No patients match that search.'
      : patients.length === 1
        ? '1 match, selected below.'
        : `${patients.length} matches — pick one.`

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
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4"
    >
      <h2 className="text-sm font-semibold text-slate-700">Book an appointment</h2>

      {error && <ErrorState message={error} />}

      {defaultPatientId ? (
        <p className="text-sm text-slate-600">
          Booking for <span className="font-medium text-slate-800">{defaultPatientName ?? '…'}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Search">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Enter here means "search", not "book". Because the search box
              // sits inside the booking form, the browser's implicit
              // submission fired the booking instead — so typing a name and
              // pressing Enter answered with "Choose a patient first."
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
              }}
              placeholder="Search name or contact number…"
            />
          </Field>
          {/* A plain dropdown, not a `size` listbox. A multi-row select does
              not open the native picker on a tablet, which is where this is
              used — it renders as an inline list that is fiddly to tap and
              easy to mistake for being inert. */}
          <Field label="Patient">
            <NativeSelect {...register('patient_id')}>
              <option value="">— choose a patient —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.cell_number ? ` · ${p.cell_number}` : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="text-xs text-slate-400" aria-live="polite">
            {matchHint}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date" error={errors.date?.message}>
          <TextInput type="date" {...register('date', { required: 'Pick a date' })} />
        </Field>
        <Field label="Time" error={errors.time?.message}>
          <TextInput type="time" {...register('time', { required: 'Pick a time' })} />
        </Field>
        <Field label="Minutes" error={errors.duration_minutes?.message}>
          <TextInput
            type="number"
            min="5"
            max="480"
            step="5"
            {...register('duration_minutes', { required: 'How long?' })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Dentist">
          <NativeSelect {...register('dentist_id')}>
            <option value="">— unassigned —</option>
            {dentists.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Procedure">
          <NativeSelect {...register('procedure_id')}>
            <option value="">— not specified —</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label="Reason">
        <TextInput {...register('reason')} placeholder="e.g. Cleaning" />
      </Field>

      <Field
        label="Front-desk note"
        hint={<>Visible to reception. Clinical notes belong on the visit, where reception can't see them.</>}
      >
        <TextInput
          {...register('reception_notes')}
          placeholder="e.g. bring HMO card — not for clinical notes"
        />
      </Field>

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-md bg-gold-700 text-white text-sm font-medium px-4 py-2 hover:bg-gold-800 disabled:opacity-50"
      >
        {isSubmitting ? 'Booking…' : 'Book appointment'}
      </button>
    </form>
  )
}
