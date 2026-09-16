import { useForm } from 'react-hook-form'
import { DENTAL_SYMPTOMS, MEDICAL_CONDITIONS, ORAL_HABITS } from './historyOptions'
import { PATIENT_TYPES } from './types'
import type { PatientRegistrationInput } from './types'
import { Field, NativeSelect, TextArea, TextInput } from '../../core/components/ui/Field'
import Button from '../../core/components/ui/Button'

const EMPTY_CONDITIONS = Object.fromEntries(MEDICAL_CONDITIONS.map((c) => [c.key, false]))
const EMPTY_SYMPTOMS = Object.fromEntries(DENTAL_SYMPTOMS.map((s) => [s.key, false]))
const EMPTY_HABITS = Object.fromEntries(ORAL_HABITS.map((h) => [h.key, false]))

export const EMPTY_PATIENT_FORM: PatientRegistrationInput = {
  patient_type: 'regular',
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

const sectionCls = 'bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4'
const checkboxRowCls = 'flex items-center gap-2 text-sm text-slate-700'

interface PatientFormProps {
  defaultValues: PatientRegistrationInput
  onSubmit: (values: PatientRegistrationInput) => Promise<void>
  submitLabel: string
  /** Whether the patient's category may be chosen here. True at registration
   *  — the front desk knows which the patient is — and afterwards only for an
   *  admin, which 0023 enforces whatever the form offers. */
  canChooseType?: boolean
}

export default function PatientForm({
  defaultValues,
  onSubmit,
  submitLabel,
  canChooseType = true,
}: PatientFormProps) {
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
          {/* Both categories use the same form: this is a label to find
              people by, not a fork (0023). */}
          {canChooseType && (
            <Field label="Patient type">
              <NativeSelect {...register('patient_type')}>
                {PATIENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field label="Full name" error={errors.name?.message}>
            <TextInput {...register('name', { required: 'Name is required' })} />
          </Field>
          <Field label="Address">
            <TextInput {...register('address')} />
          </Field>
          <Field label="Birthday">
            <TextInput type="date" {...register('birthday')} />
          </Field>
          <Field label="Age">
            <TextInput type="number" {...register('age')} />
          </Field>
          <Field label="Sex">
            <NativeSelect {...register('sex')}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </NativeSelect>
          </Field>
          <Field label="Height">
            <TextInput {...register('height')} />
          </Field>
          <Field label="Weight">
            <TextInput {...register('weight')} />
          </Field>
          <Field label="Occupation">
            <TextInput {...register('occupation')} />
          </Field>
          <Field label="Spouse">
            <TextInput {...register('spouse')} />
          </Field>
          <Field label="Phone number">
            <TextInput {...register('phone_number')} />
          </Field>
          <Field label="Cell number">
            <TextInput {...register('cell_number')} />
          </Field>
        </div>
        <Field label="Remarks">
          <TextArea rows={2} {...register('remarks')} />
        </Field>
      </section>

      <section className={sectionCls}>
        <h2 className="text-sm font-semibold text-slate-700">Medical history</h2>

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('under_physician_care')} /> Under a physician's care
        </label>
        {underPhysicianCare && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
            <Field label="Physician name">
              <TextInput {...register('physician_name')} />
            </Field>
            <Field label="Physician phone">
              <TextInput {...register('physician_phone')} />
            </Field>
          </div>
        )}

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('hospitalized')} /> Has been hospitalized
        </label>
        {hospitalized && (
          <Field label="Reason" className="pl-6">
            <TextInput {...register('hospitalized_reason')} />
          </Field>
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
          <Field label={'Specify (for "Other" or any condition needing detail)'} className="mt-2">
            <TextInput {...register('other_condition_details')} />
          </Field>
        </div>

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('allergic_to_food_or_drug')} /> Allergic to food or drug
        </label>
        {allergic && (
          <Field label="Specify" className="pl-6">
            <TextInput {...register('allergy_details')} />
          </Field>
        )}

        <label className={checkboxRowCls}>
          <input type="checkbox" {...register('current_medications')} /> Currently taking medication
        </label>
        {onMeds && (
          <Field label="Specify" className="pl-6">
            <TextInput {...register('medication_details')} />
          </Field>
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
          <Field label="Last visit date">
            <TextInput type="date" {...register('last_visit_date')} />
          </Field>
          <Field label="Last dental problem">
            <TextInput {...register('last_dental_problem')} />
          </Field>
          <Field label="Previous dentist name">
            <TextInput {...register('previous_dentist_name')} />
          </Field>
          <Field label="Previous dentist address">
            <TextInput {...register('previous_dentist_address')} />
          </Field>
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
          <Field label={'Specify (for "Other")'} className="mt-2">
            <TextInput {...register('oral_habits_other_details')} />
          </Field>
        </div>
      </section>

      <Button type="submit" disabled={isSubmitting} className="self-start px-5 py-2.5">
        {isSubmitting ? 'Saving…' : submitLabel}
      </Button>
    </form>
  )
}
