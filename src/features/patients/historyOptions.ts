// Checkbox vocab for the medical/dental history forms — keys match the
// jsonb maps on medical_histories.conditions / dental_histories.symptoms
// and .oral_habits (see supabase/migrations/0001_schema.sql). Kept as data
// so the form renders as a checklist per the clinic's real paper form,
// not a generic free-text box.

export const MEDICAL_CONDITIONS: { key: string; label: string }[] = [
  { key: 'angina', label: 'Angina' },
  { key: 'tb', label: 'Tuberculosis (TB)' },
  { key: 'stroke', label: 'Stroke' },
  { key: 'high_blood_pressure', label: 'High blood pressure' },
  { key: 'asthma', label: 'Asthma' },
  { key: 'emphysema', label: 'Emphysema' },
  { key: 'rheumatic_fever_arthritis', label: 'Rheumatic fever / arthritis' },
  { key: 'epilepsy', label: 'Epilepsy' },
  { key: 'malignancy_tumor', label: 'Malignancy / tumor' },
  { key: 'hepatitis_a_or_b', label: 'Hepatitis A or B' },
  { key: 'hiv_positive', label: 'HIV positive' },
  { key: 'thyroid_problem', label: 'Thyroid problem' },
  { key: 'kidney_problems', label: 'Kidney problems' },
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'anemia', label: 'Anemia' },
  { key: 'excessive_bleeding', label: 'Excessive bleeding' },
  { key: 'ulcers', label: 'Ulcers' },
  { key: 'back_problems', label: 'Back problems' },
  { key: 'other', label: 'Other' },
]

export const DENTAL_SYMPTOMS: { key: string; label: string }[] = [
  { key: 'bleeding_gums', label: 'Bleeding gums' },
  { key: 'swollen_gums', label: 'Swollen gums' },
  { key: 'sensitive_to_hot', label: 'Sensitive to hot' },
  { key: 'sensitive_to_cold', label: 'Sensitive to cold' },
  { key: 'sensitive_to_sweet', label: 'Sensitive to sweet' },
  { key: 'sensitive_to_pressure_or_biting', label: 'Sensitive to pressure or biting' },
  { key: 'prolonged_bleeding_after_extraction', label: 'Prolonged bleeding after extraction' },
  { key: 'has_dentures_braces_or_retainers', label: 'Has dentures, braces, or retainers' },
  { key: 'lockjaw', label: 'Lockjaw' },
  { key: 'food_stuck_between_teeth', label: 'Food stuck between teeth' },
  { key: 'bad_taste_or_odor', label: 'Bad taste or odor' },
]

export const ORAL_HABITS: { key: string; label: string }[] = [
  { key: 'thumb_sucking', label: 'Thumb sucking' },
  { key: 'nail_biting', label: 'Nail biting' },
  { key: 'teeth_grinding', label: 'Teeth grinding' },
  { key: 'other', label: 'Other' },
]

export const CONSENT_TEXT_VERSION = 'v1-draft'
export const CONSENT_TEXT = `I consent to dental examination and treatment as recommended by the dentist,
and understand the risks, benefits, and alternatives have been explained to me.
I also consent to the clinic storing my personal and health information for
the purpose of providing dental care, in accordance with the Data Privacy Act.
This consent applies to the visit on the date signed below and may be
re-confirmed at any future visit.`
