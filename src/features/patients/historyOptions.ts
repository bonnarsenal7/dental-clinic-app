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
  {
    key: 'prolonged_bleeding_after_extraction',
    label: 'Prolonged bleeding after extraction',
  },
  {
    key: 'has_dentures_braces_or_retainers',
    label: 'Has dentures, braces, or retainers',
  },
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
// rights. It is STILL A DRAFT: it has not been reviewed by anyone qualified
// in Philippine data privacy law.
//
// v3 rewrote v2 in plainer language, added the paragraph about who may sign
// for a patient who cannot consent themselves (0010 records that), and
// resolved a contradiction v2 contained — it promised erasure and objection
// outright, then said records are kept anyway. v3 states the limit instead
// of implying a right the clinic cannot honour.
//
// Do not remove the draft notice in ConsentCapture.tsx until a lawyer has
// signed this off. See docs/COMPLIANCE.md for what that review must cover.
//
// The version tag is stored on every consents row, so re-wording this text
// means bumping the version — old signatures stay attached to the words
// that were actually on screen when they were given.
export const CONSENT_TEXT_VERSION = 'v3-draft'

/** The two clinic facts RA 10173 requires the notice to state.
 *
 *  Neither is a legal judgement — but both are promises made to every
 *  patient who signs, so they live here as named constants rather than as
 *  brackets buried in prose where an unfilled one ships unnoticed. That is
 *  exactly what happened to v2: patients would have been shown the literal
 *  text "[RETENTION PERIOD]".
 *
 *  Filling these changes what a patient is told, so bump
 *  CONSENT_TEXT_VERSION when you do. */
export const PRIVACY_CONTACT = {
  /** Who a patient contacts about their information — a person or a role. */
  name: '',
  /** How to reach them: phone number or email address. */
  details: '',
}

/** How long records are kept after a patient's last visit, written as a
 *  patient would read it (e.g. "10 years").
 *
 *  This needs a source rather than a guess — whatever the clinic is
 *  actually required to keep under professional record-keeping rules. A
 *  number here is a commitment to every signatory. */
export const RECORD_RETENTION = ''

/** False while any of the above is unset. The capture screen says which,
 *  and a test holds the warning in place until all three are filled. */
export const CONSENT_DETAILS_COMPLETE =
  PRIVACY_CONTACT.name.trim() !== '' &&
  PRIVACY_CONTACT.details.trim() !== '' &&
  RECORD_RETENTION.trim() !== ''

/** Names what is still missing, for the warning on the capture screen. */
export function missingConsentDetails(): string[] {
  const missing: string[] = []
  if (PRIVACY_CONTACT.name.trim() === '') missing.push('the contact for privacy questions')
  if (PRIVACY_CONTACT.details.trim() === '') missing.push('their phone number or email')
  if (RECORD_RETENTION.trim() === '') missing.push('how long records are kept')
  return missing
}

function orMarker(value: string, label: string) {
  // Deliberately shouty. If an unfilled value ever reaches a patient it
  // should be unmistakable on screen, not a tidy blank they read past.
  return value.trim() === '' ? `«${label} NOT SET»` : value.trim()
}

export const CONSENT_TEXT = `CONSENT FOR DENTAL TREATMENT

I agree to dental examination and to the treatment the dentist recommends.

The dentist has explained to me, in language I understand, what the
treatment involves, its risks and benefits, what alternatives I have, and
what is likely to happen if I decline. I have been able to ask questions.

I understand that dentistry cannot guarantee a result and that no guarantee
has been given to me. If the dentist finds something during treatment that
means the plan should change, I authorise them to use their professional
judgement.

I may withdraw this consent at any time, including during treatment.

WHO IS SIGNING

If the patient is under 18, or cannot consent for themselves, this form is
signed by a parent, legal guardian or authorised representative. By signing,
that person confirms they are entitled to consent on the patient's behalf.
The name of the person signing and their relationship to the patient are
recorded with this consent.

PRIVACY NOTICE (Data Privacy Act of 2012, RA 10173)

The clinic is responsible for the information described below.

What we hold. Your name, address, date of birth, sex, contact numbers,
occupation and the name of your spouse; your medical and dental history,
including conditions, allergies and medication; clinical notes, tooth
charts, images and X-rays; and a record of payments you make to the clinic.

Why we hold it. To provide dental care safely, to keep a continuous record
of your treatment, and to bill for it. Your medical history is collected
specifically so that treatment is not given where it would be unsafe. We
process this information because it is necessary to provide you with dental
care, and with your agreement as recorded on this form.

Who can see it. Clinic staff, each according to their role: reception staff
can see your contact and billing details but not the dentist's clinical
notes or your tooth chart. Your records are held on secure servers operated
by our hosting provider on the clinic's behalf. We do not sell your
information. We do not share it outside the clinic except where you ask us
to, where another health professional needs it for your care, or where the
law requires it.

How long we keep it. Your records are kept for ${orMarker(RECORD_RETENTION, 'RETENTION PERIOD')} after your
last visit, and are then securely destroyed.

Your rights. You have the right to be informed about how your information
is used, to access it, to have it corrected if it is wrong, to object to
its processing, to have it erased or blocked in the circumstances the law
allows, to receive a copy in a portable format, and to be compensated for
damage caused by its misuse.

Some of these rights are limited for as long as we are required to keep a
dental record of your treatment. Where that applies we will tell you, and
we will stop using your information for anything beyond meeting that
requirement. Withdrawing your agreement does not undo anything already done
before you withdrew.

Questions and complaints. Contact ${orMarker(PRIVACY_CONTACT.name, 'PRIVACY CONTACT')} at ${orMarker(PRIVACY_CONTACT.details, 'CONTACT DETAILS')}.
If you are not satisfied with our response, you may complain to the
National Privacy Commission.

I have read and understood the above. I consent to the treatment described
and to the handling of my information as set out in this notice.

This consent applies to the visit on the date signed below and may be
re-confirmed at any future visit.`

// --- Chairside medical alerts --------------------------------------------
//
// Not every ticked box on the intake form changes what a dentist does next.
// These are the ones that do, split by how urgently they need to be seen
// before treatment starts. `why` states the dental relevance, because a
// condition name alone ("angina") doesn't tell a hurried clinician what to
// do differently ("cardiac risk — limit epinephrine").
//
// Keys match medical_histories.conditions (0001_schema.sql).

export type AlertSeverity = 'critical' | 'notable'

export const CONDITION_ALERTS: Record<string, { severity: AlertSeverity; why: string }> = {
  excessive_bleeding: {
    severity: 'critical',
    why: 'bleeding risk — check before any extraction',
  },
  angina: {
    severity: 'critical',
    why: 'cardiac risk — limit epinephrine, keep appointments short',
  },
  stroke: { severity: 'critical', why: 'cardiac/anticoagulant risk' },
  epilepsy: { severity: 'critical', why: 'seizure risk in the chair' },
  rheumatic_fever_arthritis: {
    severity: 'critical',
    why: 'may need antibiotic prophylaxis',
  },

  high_blood_pressure: {
    severity: 'notable',
    why: 'check BP before extraction; limit epinephrine',
  },
  diabetes: { severity: 'notable', why: 'delayed healing, infection risk' },
  asthma: { severity: 'notable', why: 'have inhaler to hand' },
  hepatitis_a_or_b: { severity: 'notable', why: 'infection control' },
  hiv_positive: { severity: 'notable', why: 'infection control, healing' },
  tb: { severity: 'notable', why: 'infection control' },
  emphysema: { severity: 'notable', why: 'avoid reclining fully' },
  kidney_problems: { severity: 'notable', why: 'affects drug choice and dosing' },
  anemia: { severity: 'notable', why: 'affects healing' },
  malignancy_tumor: {
    severity: 'notable',
    why: 'radiotherapy/chemo history affects healing',
  },
  thyroid_problem: {
    severity: 'notable',
    why: 'epinephrine sensitivity if uncontrolled',
  },
}
