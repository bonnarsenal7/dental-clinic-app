import { useForm } from 'react-hook-form'
import { DENTAL_SYMPTOMS, MEDICAL_CONDITIONS, ORAL_HABITS } from './historyOptions'
import type { PatientRegistrationInput } from './types'

const EMPTY_CONDITIONS = Object.fromEntries(MEDICAL_CONDITIONS.map((c) => [c.key, false]))
const EMPTY_SYMPTOMS = Object.fromEntries(DENTAL_SYMPTOMS.map((s) => [s.key, false]))
const EMPTY_HABITS = Object.fromEntries(ORAL_HABITS.map((h) => [h.key, false]))

export const EMPTY_PATIENT_FORM: PatientRegistrationInput = {
  name: '',
  address: '',
  birthday: '',
  age: '',
  sex: '',
  height: '',
  weight: '',
  occupation: '',
  spouse: '',
  phone_number: '',
  cell_number: '',
  remarks: '',
  under_physician_care: false,
  physician_name: '',
  physician_phone: '',
  hospitalized: false,
  hospitalized_reason: '',
  conditions: EMPTY_CONDITIONS,
  other_condition_details: '',
  allergic_to_food_or_drug: false,
  allergy_details: '',
  current_medications: false,
  medication_details: '',
  allergic_to_anesthesia: false,
  smokes: false,
  last_visit_date: '',
  last_dental_problem: '',
  previous_dentist_name: '',
  previous_dentist_address: '',
  symptoms: EMPTY_SYMPTOMS,
  oral_habits: EMPTY_HABITS,
  oral_habits_other_details: '',
}

const inputCls = 'rounded-md border border-slate-300 px-3 py-2 text-sm w-full'
const labelCls = 'flex flex-col gap-1 text-sm text-slate-700'
const sectionCls = 'bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4'
const checkboxRowCls = 'flex items-center gap-2 text-sm text-slate-700'

interface PatientFormProps {
  defaultValues: PatientRegistrationInput
  onSubmit: (values: PatientRegistrationInput) => Promise<void>
  submitLabel: string
}

export default function PatientForm({ defaultValues, onSubmit, submitLabel }: PatientFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<PatientRegistrationInput>({ defaultValues })

  const underPhysicianCare = watch('under_physician_care')
  const hospitalized = watch('hospitalized')
  const allergic = watch('allergic_to_food_or_drug')
  const onMeds = watch('current_medications')

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className={sectionCls}>
        <h2 className="text-sm font-semibold text-slate-700">Demographics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={labelCls}>
            Full name
            <input className={inputCls} {...register('name', { required: 'Name is required' })} />
            {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
          </label>
          <label className={labelCls}>
            Address
            <input className={inputCls} {...register('address')} />
          </label>
          <label className={labelCls}>
            Birthday
            <input type="date" className={inputCls} {...register('birthday')} />
          </label>
          <label className={labelCls}>
            Age
            <input type="number" className={inputCls} {...register('age')} />
          </label>
          <label className={labelCls}>
            Sex
            <select className={inputCls} {...register('sex')}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className={labelCls}>
            Height
            <input className={inputCls} {...register('height')} />
          </label>
          <label className={labelCls}>
            Weight
            <input className={inputCls} {...register('weight')} />
          </label>
          <label className={labelCls}>
            Occupation
            <input className={inputCls} {...register('occupation')} />
          </label>
          <label className={labelCls}>
            Spouse
            <input className={inputCls} {...register('spouse')} />
          </label>
          <label className={labelCls}>
            Phone number
            <input className={inputCls} {...register('phone_number')} />
          </label>
          <label className={labelCls}>
            Cell number
            <input className={inputCls} {...register('cell_number')} />
          </label>
        </div>
        <label className={labelCls}>
          Remarks
          <textarea className={inputCls} rows={2} {...register('remarks')} />
        </label>
      </section>

      <section className={sectionCls}>
        <h2 className="text-sm font-semibold text-slate-700">Medical history</h2>

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('under_physician_care')} /> Under a physician's care
        </label>
        {underPhysicianCare && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
            <label className={labelCls}>
              Physician name
              <input className={inputCls} {...register('physician_name')} />
            </label>
            <label className={labelCls}>
              Physician phone
              <input className={inputCls} {...register('physician_phone')} />
            </label>
          </div>
        )}

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('hospitalized')} /> Has been hospitalized
        </label>
        {hospitalized && (
          <label className={labelCls + ' pl-6'}>
            Reason
            <input className={inputCls} {...register('hospitalized_reason')} />
          </label>
        )}

        <div>
          <p className="text-sm text-slate-700 mb-2">Conditions (check any that apply)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {MEDICAL_CONDITIONS.map((c) => (
              <label key={c.key} className={checkboxRowCls}>
                <input type="checkbox" {...register(`conditions.${c.key}` as const)} /> {c.label}
              </label>
            ))}
          </div>
          <label className={labelCls + ' mt-2'}>
            Specify (for "Other" or any condition needing detail)
            <input className={inputCls} {...register('other_condition_details')} />
          </label>
        </div>

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('allergic_to_food_or_drug')} /> Allergic to food or drug
        </label>
        {allergic && (
          <label className={labelCls + ' pl-6'}>
            Specify
            <input className={inputCls} {...register('allergy_details')} />
          </label>
        )}

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('current_medications')} /> Currently taking medication
        </label>
        {onMeds && (
          <label className={labelCls + ' pl-6'}>
            Specify
            <input className={inputCls} {...register('medication_details')} />
          </label>
        )}

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('allergic_to_anesthesia')} /> Allergic reaction to anesthesia
        </label>
        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('smokes')} /> Smokes
        </label>
      </section>

      <section className={sectionCls}>
        <h2 className="text-sm font-semibold text-slate-700">Dental history</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={labelCls}>
            Last visit date
            <input type="date" className={inputCls} {...register('last_visit_date')} />
          </label>
          <label className={labelCls}>
            Last dental problem
            <input className={inputCls} {...register('last_dental_problem')} />
          </label>
          <label className={labelCls}>
            Previous dentist name
            <input className={inputCls} {...register('previous_dentist_name')} />
          </label>
          <label className={labelCls}>
            Previous dentist address
            <input className={inputCls} {...register('previous_dentist_address')} />
          </label>
        </div>

        <div>
          <p className="text-sm text-slate-700 mb-2">Symptoms (check any that apply)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {DENTAL_SYMPTOMS.map((s) => (
              <label key={s.key} className={checkboxRowCls}>
                <input type="checkbox" {...register(`symptoms.${s.key}` as const)} /> {s.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-slate-700 mb-2">Oral habits (check any that apply)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            {ORAL_HABITS.map((h) => (
              <label key={h.key} className={checkboxRowCls}>
                <input type="checkbox" {...register(`oral_habits.${h.key}` as const)} /> {h.label}
              </label>
            ))}
          </div>
          <label className={labelCls + ' mt-2'}>
            Specify (for "Other")
            <input className={inputCls} {...register('oral_habits_other_details')} />
          </label>
        </div>
      </section>

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-md bg-slate-800 text-white text-sm font-medium px-5 py-2.5 hover:bg-slate-700 disabled:opacity-50"
      >
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
