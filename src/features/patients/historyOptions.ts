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

// Consent and data-privacy notice.
//
// Phase 5 replaced Phase 2's one-paragraph placeholder with a full draft
// covering the Data Privacy Act of 2012 (RA 10173) disclosures: what is
// collected, why, who sees it, how long it is kept, and the data subject's
// rights. It is STILL A DRAFT. It has not been reviewed by anyone
// qualified in Philippine data privacy law, and the bracketed fields below
// are placeholders the clinic must fill in.
//
// Do not remove the draft notice in ConsentCapture.tsx until a lawyer has
// signed this off. See docs/COMPLIANCE.md for what that review must cover.
//
// The version tag is stored on every consents row, so re-wording this text
// means bumping the version — old signatures stay attached to the words
// that were actually on screen when they were given.
export const CONSENT_TEXT_VERSION = 'v2-draft'
export const CONSENT_TEXT = `CONSENT FOR DENTAL TREATMENT

I consent to dental examination and to the treatment recommended by the
dentist. The nature of the proposed treatment, its risks and benefits, the
alternatives available to me, and the likely result of declining treatment
have been explained to me in language I understand, and I have had the
opportunity to ask questions.

I understand that dentistry is not an exact science and that no guarantee
has been made to me about the result of treatment. I understand that during
treatment the dentist may find conditions requiring a change of plan, and I
authorise the dentist to use professional judgement in that event.

PRIVACY NOTICE (Data Privacy Act of 2012, RA 10173)

What we collect. Your name, address, date of birth, sex, contact numbers,
occupation, and the name of your spouse; your medical and dental history,
including conditions, allergies and medication; clinical notes, tooth
charts, images and X-rays; and records of payments you make to the clinic.

Why we collect it. To provide dental care safely, to keep a continuous
record of your treatment, and to bill for it. Your medical history is
collected specifically so that treatment is not given where it would be
unsafe.

Who can see it. Clinic staff, each according to their role: reception staff
can see your contact and billing details but not the dentist's clinical
notes or your tooth chart. Your records are held on secure servers operated
by our hosting provider on the clinic's behalf. We do not sell your
information, and we do not share it with anyone outside the clinic except
where you ask us to, where another health professional needs it for your
care, or where the law requires it.

How long we keep it. Your records are retained for [RETENTION PERIOD] after
your last visit, after which they are securely deleted.

Your rights. You have the right to be informed about how your information
is used, to access it, to have it corrected if it is wrong, to object to
its processing, to have it erased or blocked in the circumstances the law
allows, to receive a copy in a portable format, and to be compensated for
damage caused by its misuse. To exercise any of these rights, contact
[CLINIC CONTACT / DATA PROTECTION OFFICER] at [CONTACT DETAILS]. If you are
not satisfied with our response, you may complain to the National Privacy
Commission.

Withdrawing consent. You may withdraw your consent at any time by telling
us in writing. Withdrawal does not affect anything done before you withdrew,
and we may still need to keep your records for the retention period above
to meet our legal and professional obligations.

I have read and understood the above. I consent to the treatment described
and to the handling of my information as set out in this notice.

This consent applies to the visit on the date signed below and may be
re-confirmed at any future visit.`
