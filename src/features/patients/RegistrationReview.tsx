import { DENTAL_SYMPTOMS, MEDICAL_CONDITIONS, ORAL_HABITS } from './historyOptions'
import type { PatientRegistrationInput } from './types'

function checkedLabels(map: Record<string, boolean>, options: { key: string; label: string }[]) {
  const labels = options.filter((o) => map[o.key]).map((o) => o.label)
  return labels.length > 0 ? labels.join(', ') : 'None reported'
}

const row = 'flex justify-between gap-4 text-sm py-1 border-b border-slate-100 last:border-0'
const rowLabel = 'text-slate-400 shrink-0'
const rowValue = 'text-slate-700 text-right'

/** Read-only summary of exactly what will be saved, shown to the patient
 *  for verification before they sign. Renders straight from the submitted
 *  form values (not a re-fetch) so it's an honest "this is what you're
 *  about to sign for" snapshot. */
export default function RegistrationReview({ values }: { values: PatientRegistrationInput }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Demographics</h2>
        <div className={row}><span className={rowLabel}>Name</span><span className={rowValue}>{values.name || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Address</span><span className={rowValue}>{values.address || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Birthday</span><span className={rowValue}>{values.birthday || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Age</span><span className={rowValue}>{values.age || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Sex</span><span className={rowValue}>{values.sex || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Height</span><span className={rowValue}>{values.height || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Weight</span><span className={rowValue}>{values.weight || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Occupation</span><span className={rowValue}>{values.occupation || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Spouse</span><span className={rowValue}>{values.spouse || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Phone number</span><span className={rowValue}>{values.phone_number || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Cell number</span><span className={rowValue}>{values.cell_number || '—'}</span></div>
        {values.remarks && <div className={row}><span className={rowLabel}>Remarks</span><span className={rowValue}>{values.remarks}</span></div>}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Medical history</h2>
        <div className={row}>
          <span className={rowLabel}>Under a physician's care</span>
          <span className={rowValue}>{values.under_physician_care ? `Yes — ${values.physician_name || 'name not given'}` : 'No'}</span>
        </div>
        <div className={row}>
          <span className={rowLabel}>Hospitalized</span>
          <span className={rowValue}>{values.hospitalized ? `Yes — ${values.hospitalized_reason || 'reason not given'}` : 'No'}</span>
        </div>
        <div className={row}><span className={rowLabel}>Conditions</span><span className={rowValue}>{checkedLabels(values.conditions, MEDICAL_CONDITIONS)}</span></div>
        {values.other_condition_details && (
          <div className={row}><span className={rowLabel}>Condition detail</span><span className={rowValue}>{values.other_condition_details}</span></div>
        )}
        <div className={row}>
          <span className={rowLabel}>Allergic to food/drug</span>
          <span className={rowValue}>{values.allergic_to_food_or_drug ? `Yes — ${values.allergy_details || 'detail not given'}` : 'No'}</span>
        </div>
        <div className={row}>
          <span className={rowLabel}>Current medications</span>
          <span className={rowValue}>{values.current_medications ? `Yes — ${values.medication_details || 'detail not given'}` : 'No'}</span>
        </div>
        <div className={row}><span className={rowLabel}>Allergic to anesthesia</span><span className={rowValue}>{values.allergic_to_anesthesia ? 'Yes' : 'No'}</span></div>
        <div className={row}><span className={rowLabel}>Smokes</span><span className={rowValue}>{values.smokes ? 'Yes' : 'No'}</span></div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Dental history</h2>
        <div className={row}><span className={rowLabel}>Last visit date</span><span className={rowValue}>{values.last_visit_date || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Last dental problem</span><span className={rowValue}>{values.last_dental_problem || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Previous dentist</span><span className={rowValue}>{values.previous_dentist_name || '—'}</span></div>
        <div className={row}><span className={rowLabel}>Symptoms</span><span className={rowValue}>{checkedLabels(values.symptoms, DENTAL_SYMPTOMS)}</span></div>
        <div className={row}><span className={rowLabel}>Oral habits</span><span className={rowValue}>{checkedLabels(values.oral_habits, ORAL_HABITS)}</span></div>
        {values.oral_habits_other_details && (
          <div className={row}><span className={rowLabel}>Oral habit detail</span><span className={rowValue}>{values.oral_habits_other_details}</span></div>
        )}
      </section>
    </div>
  )
}
