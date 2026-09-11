import { Link } from 'react-router-dom'
import { STATUS_LABELS, STATUS_STYLES, nextStatuses, waitingMinutes } from './appointmentStatus'
import type { AppointmentStatus, AppointmentWithPatient } from './types'

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function AppointmentCard({
  appointment,
  onStatusChange,
  busy,
  invoiceId,
}: {
  appointment: AppointmentWithPatient
  onStatusChange: (appointment: AppointmentWithPatient, status: AppointmentStatus) => void
  busy: boolean
  /** The invoice already raised for this appointment's visit, if any.
   *  Undefined means not yet looked up. */
  invoiceId?: string | null
}) {
  const patient = appointment.patients
  const waited = waitingMinutes(appointment.arrived_at)
  // Only surfaced while they're still waiting — once seated, the number is
  // history and reception is being asked about someone else.
  const showWait = appointment.status === 'arrived' && waited !== null

  return (
    <div className="border border-slate-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3 flex-wrap bg-white">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800 tabular-nums">
            {timeOf(appointment.scheduled_at)}
          </span>
          {patient ? (
            <Link to={`/patients/${patient.id}`} className="text-sm text-slate-800 hover:underline">
              {patient.name}
            </Link>
          ) : (
            <span className="text-sm text-slate-400">(patient record unavailable)</span>
          )}
          <span className={`text-xs uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_STYLES[appointment.status]}`}>
            {STATUS_LABELS[appointment.status]}
          </span>
          {showWait && (
            <span className={`text-xs font-medium ${waited >= 20 ? 'text-red-700' : 'text-amber-700'}`}>
              waiting {waited} min
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {appointment.duration_minutes} min
          {appointment.reason ? ` · ${appointment.reason}` : ''}
          {patient?.cell_number ? ` · ${patient.cell_number}` : ''}
        </p>
        {appointment.reception_notes && (
          <p className="text-xs text-slate-500 mt-1 italic">{appointment.reception_notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        {appointment.visit_id && (
          <Link
            to={`/patients/${appointment.patient_id}/chart`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            Chart
          </Link>
        )}

        {/* Treatment finished is the moment someone gets billed, so the
            action lives here rather than making reception go and find the
            patient again. The appointment's procedure and the price list
            fill the first line in. */}
        {appointment.status === 'completed' &&
          (invoiceId ? (
            <Link
              to={`/invoices/${invoiceId}`}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              View invoice
            </Link>
          ) : (
            <Link
              to={`/patients/${appointment.patient_id}/invoices/new?appointment=${appointment.id}${
                appointment.visit_id ? `&visit=${appointment.visit_id}` : ''
              }`}
              className="rounded-md bg-gold-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-800"
            >
              Create invoice
            </Link>
          ))}
        {nextStatuses(appointment.status).map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(appointment, status)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              status === 'arrived' || status === 'in_chair' || status === 'completed'
                ? 'bg-gold-700 text-white hover:bg-gold-800'
                : 'border border-slate-300 text-slate-500 hover:bg-slate-100'
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </div>
  )
}
