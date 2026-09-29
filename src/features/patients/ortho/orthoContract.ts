/** The clinic's own orthodontic treatment consent form ("ORTHO CONSENT
 *  PACKAGE – DAVAO"), transcribed from the paper original so the tablet shows
 *  and the PDF prints exactly the words the patient agrees to.
 *
 *  An orthodontic patient signs this **instead of** the general CONSENT_TEXT.
 *  Re-wording anything here — a clause, a package price, an add-on — means
 *  bumping ORTHO_CONTRACT_VERSION, because the version is stored on the
 *  consents row and every earlier signature has to stay attached to the
 *  words that were actually on screen when it was given.
 *
 *  Amounts are plain numbers and printed as "P 1,234" — jsPDF's built-in
 *  Helvetica cannot draw the peso sign (see billing's receipt). */
export const ORTHO_CONTRACT_VERSION = 'ortho-v1'

/** Whether a consents row is a signing of this form (any version), rather
 *  than of the general CONSENT_TEXT. The version is the only thing on the row
 *  that tells the two apart — an orthodontic patient who self-registered
 *  signed the general consent first, and that must not read as a contract. */
export function isOrthoContractVersion(version: string): boolean {
  return version.startsWith('ortho-')
}

export const ORTHO_DENTIST = 'Dr. Sara Pamela Therese Abella'

export interface OrthoSection {
  heading: string
  points: string[]
}

export const ORTHO_INTRO = `I, the undersigned, hereby authorize ${ORTHO_DENTIST} to perform and complete orthodontic treatment for myself / my child.`

export const ORTHO_UNDERSTANDING =
  'By signing this consent form, I confirm that I have been fully informed and understand the following:'

export const ORTHO_SECTIONS: OrthoSection[] = [
  {
    heading: 'Treatment Responsibility',
    points: [
      'The success and outcome of orthodontic treatment depend on several factors under my control, including oral hygiene, diet, nutrition, compliance with prescribed appliances (fixed or removable), and regular attendance at scheduled appointments.',
    ],
  },
  {
    heading: 'Monitoring and Referrals',
    points: [
      `My case will be regularly monitored by ${ORTHO_DENTIST}.`,
      'If problems arise requiring the expertise of another specialist (e.g., periodontist, oral surgeon, or TMJ specialist), I will be referred accordingly.',
    ],
  },
  {
    heading: 'Treatment Limitations',
    points: [
      'Despite estimates of success, treatment results may vary due to individual biological factors that cannot be predicted in advance.',
    ],
  },
  {
    heading: 'Temporomandibular Joint (TMJ)',
    points: [
      'One possible complication of orthodontic treatment involves the temporomandibular joint (TMJ), located in front of each ear and connecting the lower jaw to the skull.',
      'If I experience any TMJ-related discomfort, I will promptly inform the dentist. Repeated discomfort may require consultation with a TMJ specialist.',
    ],
  },
  {
    heading: 'Adverse Effects and Reporting',
    points: [
      'I will immediately report any unusual or adverse effects experienced during or after treatment.',
    ],
  },
  {
    heading: 'Retention and Additional Procedures',
    points: [
      'Completion of orthodontic treatment requires the use of retainers to maintain corrected tooth positions.',
      'Minor procedures such as tooth grinding, reshaping, and/or extractions may be necessary to achieve the best results.',
    ],
  },
  {
    heading: 'Appointments and Payments',
    points: [
      'If I miss a scheduled appointment, I remain responsible for the corresponding monthly payment (remaining balance).',
      'All payments made are non-refundable and non-transferable.',
      'If I choose to discontinue treatment, I may opt out at any time without incurring additional penalties, but payments already made will not be refunded.',
      'If I fail to attend adjustments for five (5) consecutive months, a penalty fee of P 5,000 will apply, or treatment may be subject to termination and removal of the orthodontic appliance at the discretion of the dentist.',
    ],
  },
  {
    heading: 'Treatment Duration',
    points: ['The estimated treatment time is 2 to 3 years, depending on case difficulty.'],
  },
  {
    heading: 'Fees and Inclusions',
    points: [
      // {FEE} is filled with the agreed fee on screen and in the PDF.
      'The regular fee for orthodontic treatment is {FEE}, which includes the use of conventional brackets.',
      'The treatment also includes a complimentary orthodontic kit.',
      'The treatment package availed is marked below.',
    ],
  },
]

export interface OrthoPackage {
  id: string
  group: 'Conventional bracket' | 'Ceramic' | 'Self-ligating'
  label: string
  /** The full fee — what "regular fee" is filled with when this is chosen. */
  total: number
  terms: string[]
}

export const ORTHO_PACKAGES: OrthoPackage[] = [
  {
    id: 'conv-a',
    group: 'Conventional bracket',
    label: 'Package A (Upper and Lower)',
    total: 50_000,
    terms: ['Down payment: 8,000', 'Balance: 42,000', 'Monthly: 1,800 for 24 months'],
  },
  {
    id: 'conv-b',
    group: 'Conventional bracket',
    label: 'Package B (Upper and Lower)',
    total: 50_000,
    terms: ['Down payment: 10,000', 'Balance: 40,000', 'Monthly: 1,600 for 25 months'],
  },
  {
    id: 'conv-c',
    group: 'Conventional bracket',
    label: 'Package C (Upper and Lower)',
    total: 50_000,
    terms: ['Down payment: 15,000', 'Balance: 35,000', 'Monthly: 1,400 for 25 months'],
  },
  {
    id: 'conv-d',
    group: 'Conventional bracket',
    label: 'Package D (Upper or Lower)',
    total: 30_000,
    terms: ['Down payment: 6,000', 'Balance: 24,000', 'Monthly: 1,000 for 24 months'],
  },
  {
    id: 'ceramic-both',
    group: 'Ceramic',
    label: 'Ceramic (Upper and Lower)',
    total: 70_000,
    terms: [
      'Down payment: 20,000',
      'Balance: 50,000',
      'Monthly: 2,000 for 25 months',
      'Add-on: 1,000 recement after 3 months',
    ],
  },
  {
    id: 'ceramic-one',
    group: 'Ceramic',
    label: 'Ceramic (Upper or Lower)',
    total: 45_000,
    terms: [
      'Down payment: 10,000',
      'Balance: 35,000',
      'Monthly: 1,500 for 24 months',
      'Add-on: 1,000 recement after 3 months',
    ],
  },
  {
    id: 'self-ligating',
    group: 'Self-ligating',
    label: 'Self-ligating (Upper and Lower)',
    total: 90_000,
    terms: [
      'Down payment: 45,000',
      'Balance: 45,000',
      'Payment: 15,000 annually for 3 years',
      'Add-on: 1,000 recement after 6 months',
    ],
  },
]

export const ORTHO_ADD_ONS: string[] = [
  '500 - recement and replacement bracket after 3 months.',
  '2,000 - occlusal pad (right and left) or bite turbo (2 pcs) if needed.',
  '10,000 - removal of braces with upper and lower retainers with oral prophylaxis and fluoride application after orthodontic treatment. 6,000 for lower or upper.',
  '4,000 - removal of upper and lower old braces. 2,500 for upper or lower only.',
  '10,000 - upper or lower mouthguard.',
  '15,000 - T4K trainer for kids.',
]

export const ORTHO_ACKNOWLEDGMENTS: string[] = [
  'I have discussed this consent form thoroughly with Dr. Abella.',
  'All my questions have been answered to my satisfaction.',
  'I understand the necessity, limitations, and possible risks of treatment, as well as the consequences of refusing recommended care.',
]

/** "P 50,000" — never the peso sign; see the note at the top. */
export function orthoMoney(amount: number): string {
  return `P ${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
}

export function withFee(point: string, fee: string): string {
  return point.replace('{FEE}', fee)
}

/** "Maria Clara Santos - 2026-09-29.pdf": the patient's name and the
 *  signing date, as the clinic asked. Characters a file system or a Storage
 *  key would choke on are dropped; the name otherwise stays readable. */
export function orthoContractFileName(patientName: string, signedOn: string): string {
  const safe =
    patientName
      .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Patient'
  return `${safe} - ${signedOn}.pdf`
}

/** Everything a filled-in, signed form carries — shared by the screen and
 *  the PDF so both say the same thing. */
export interface OrthoContractDetails {
  patientName: string
  patientAge: number | null
  packageId: string
  /** The agreed fee as a number; defaults to the package total. */
  fee: number
  signedByName: string
  signerRelationshipLabel: string
  /** yyyy-mm-dd in Manila. */
  signedOn: string
  patientSignatureDataUrl: string
  /** Optional — the dentist may countersign on the tablet or on paper. */
  dentistSignatureDataUrl: string | null
}
