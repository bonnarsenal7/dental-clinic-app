import { supabase } from '../../core/supabaseClient'
import type {
  BillableCharting,
  DraftInvoice,
  Invoice,
  InvoiceWithDetail,
  PaymentMethod,
  Procedure,
} from './types'

// --- Price list ----------------------------------------------------------

export async function listProcedures(includeInactive = false): Promise<Procedure[]> {
  let q = supabase.from('procedures').select('*').order('name', { ascending: true })
  if (!includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as Procedure[]
}

export async function createProcedure(input: {
  name: string
  code: string | null
  default_fee: number
  chart_condition: 'filled' | 'crown' | null
}) {
  const { error } = await supabase.from('procedures').insert(input)
  if (error) throw new Error(error.message)
}

export async function updateProcedure(id: string, input: Partial<Procedure>) {
  const { error } = await supabase.from('procedures').update(input).eq('id', id)
  if (error) throw new Error(error.message)
}

// --- Invoices ------------------------------------------------------------

export async function listInvoices(patientId: string): Promise<InvoiceWithDetail[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), payments(*)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as InvoiceWithDetail[]
}

export async function getInvoice(id: string): Promise<InvoiceWithDetail> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), payments(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data as InvoiceWithDetail
}

/** Creates the invoice and its lines. total_amount and status are left
 *  alone — the triggers from 0005_billing.sql derive them from the lines. */
export async function createInvoice(params: {
  patientId: string
  visitId: string | null
  staffId: string
  lines: {
    description: string
    amount: number
    procedure_id: string | null
    tooth_record_id: string | null
    tooth_number: number | null
  }[]
}): Promise<Invoice> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      patient_id: params.patientId,
      visit_id: params.visitId,
      created_by: params.staffId,
    })
    .select()
    .single()
  if (error) throw new Error(`Invoice: ${error.message}`)

  if (params.lines.length > 0) {
    const { error: itemsError } = await supabase
      .from('invoice_items')
      .insert(params.lines.map((l) => ({ ...l, invoice_id: invoice.id })))
    if (itemsError) throw new Error(`Invoice lines: ${itemsError.message}`)
  }

  return invoice as Invoice
}

/** The invoice already raised for a visit, if there is one.
 *
 *  Completing an appointment offers to bill it, and that offer can be taken
 *  twice — by the dentist at the chair and by reception at checkout. The
 *  charted-procedure lines are protected from double-billing by a unique
 *  index, but a manually typed line is not, so the builder warns instead of
 *  quietly raising a second invoice for the same treatment. */
export async function findInvoiceForVisit(visitId: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('visit_id', visitId)
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Invoice | null) ?? null
}

/** The live invoice for each of several visits, in one query.
 *
 *  Replaces a loop of findInvoiceForVisit — the day sheet was issuing one
 *  round trip per finished appointment, over the clinic Wi-Fi this app is
 *  built to tolerate (TECHNICAL_REVIEW F-8). Drafts are excluded as well as
 *  voids: a draft is not a bill anyone can be asked to pay. */
export async function findInvoicesForVisits(visitIds: string[]): Promise<Record<string, string>> {
  if (visitIds.length === 0) return {}
  const { data, error } = await supabase
    .from('invoices')
    .select('id, visit_id')
    .in('visit_id', visitIds)
    .not('status', 'in', '("void","draft")')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const byVisit: Record<string, string> = {}
  for (const row of (data ?? []) as { id: string; visit_id: string | null }[]) {
    // Ordered newest first, so the first one seen for a visit wins.
    if (row.visit_id && !byVisit[row.visit_id]) byVisit[row.visit_id] = row.id
  }
  return byVisit
}

export async function voidInvoice(id: string) {
  const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', id)
  if (error) throw new Error(error.message)
}

// --- Chairside billing ---------------------------------------------------
//
// The dentist bills what they did while they are doing it. The working
// total lives on a `draft` invoice, which 0013 makes editable by the
// dentist and nobody else; finishing treatment takes it out of draft and
// the figures are fixed from then on.

/** The draft for a visit, if the dentist has started one. */
export async function findDraftInvoice(visitId: string): Promise<DraftInvoice | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('visit_id', visitId)
    .eq('status', 'draft')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as DraftInvoice | null) ?? null
}

/** Opens the draft on first use rather than when the patient is seated —
 *  an appointment where nothing is billable should not leave an empty
 *  invoice behind. */
export async function openDraftInvoice(params: {
  patientId: string
  visitId: string
  staffId: string
}): Promise<DraftInvoice> {
  const existing = await findDraftInvoice(params.visitId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      patient_id: params.patientId,
      visit_id: params.visitId,
      status: 'draft',
      created_by: params.staffId,
    })
    .select()
    .single()
  if (error) throw new Error(`Starting the bill: ${error.message}`)
  return { ...(data as Invoice), invoice_items: [] }
}

export async function addDraftLine(params: {
  invoiceId: string
  description: string
  amount: number
  procedureId?: string | null
  toothNumber?: number | null
  toothRecordId?: string | null
}) {
  const { error } = await supabase.from('invoice_items').insert({
    invoice_id: params.invoiceId,
    description: params.description,
    amount: params.amount,
    procedure_id: params.procedureId ?? null,
    tooth_number: params.toothNumber ?? null,
    tooth_record_id: params.toothRecordId ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function updateDraftLine(itemId: string, patch: { description?: string; amount?: number }) {
  const { error } = await supabase.from('invoice_items').update(patch).eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function removeDraftLine(itemId: string) {
  const { error } = await supabase.from('invoice_items').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
}

/** Writes the visit's note, which is now part of the bill rather than a
 *  clinical aside: the dentist writes it chairside, it locks when treatment
 *  finishes, and whoever takes payment can read it.
 *
 *  Upsert on `visit_id`, which is unique — a visit has one note, and
 *  re-saving replaces it. 0016 refuses the write once the visit is closed,
 *  so a dentist editing after finishing gets a refusal rather than a
 *  silently discarded edit. */
export async function saveVisitNote(params: { visitId: string; notes: string; staffId: string }) {
  const { error } = await supabase
    .from('visit_notes')
    .upsert(
      { visit_id: params.visitId, notes: params.notes, created_by: params.staffId },
      { onConflict: 'visit_id' },
    )
  if (error) throw new Error(error.message)
}

/** Takes the invoice out of draft. After this the figures are fixed for
 *  everyone but an admin — enforced by RLS, not by hiding the buttons. */
export async function lockInvoice(invoiceId: string) {
  const { error } = await supabase.from('invoices').update({ status: 'unpaid' }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
}

// --- Admin overrides ------------------------------------------------------
//
// No app-side logging here on purpose: 0006's triggers record every one of
// these unconditionally, including changes made outside the app entirely.
// A log the client writes is a log the client can skip.

export async function voidInvoice_admin(invoiceId: string) {
  const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', invoiceId)
  if (error) throw new Error(error.message)
}

// --- Payments ------------------------------------------------------------

/** Payments are append-only (0002_rls.sql) — a correction is another row,
 *  and a refund is a negative amount. */
export async function recordPayment(params: {
  invoiceId: string
  staffId: string
  amount: number
  method: PaymentMethod
  reference: string | null
}) {
  const { error } = await supabase.from('payments').insert({
    invoice_id: params.invoiceId,
    amount: params.amount,
    method: params.method,
    reference: params.reference,
    received_by: params.staffId,
  })
  if (error) throw new Error(error.message)
}

/** Sets the dentist's commission on an invoice.
 *
 *  An RPC rather than an update: reception has no update on `invoices`
 *  (0013), and a policy granting one would hand them the total and status
 *  along with it. `set_invoice_commission` (0017) writes that one column and
 *  refuses anyone but reception or an admin. */
export async function setInvoiceCommission(invoiceId: string, amount: number) {
  const { error } = await supabase.rpc('set_invoice_commission', {
    p_invoice_id: invoiceId,
    p_amount: amount,
  })
  if (error) throw new Error(error.message)
}

// --- Pulling charted procedures -----------------------------------------

/** The procedures charted at a visit that haven't been billed yet.
 *
 *  Reads tooth_records, so this only works for dentist/admin — reception
 *  has no RLS access and will get an empty list rather than an error. The
 *  invoice builder hides the whole section for them accordingly.
 *
 *  Only conditions representing work performed are billable: 'decayed' and
 *  'missing' are findings and 'planned' is future work. */
export async function listBillableCharting(visitId: string): Promise<BillableCharting[]> {
  const { data, error } = await supabase
    .from('tooth_records')
    .select('id, tooth_number, condition, surface, created_at')
    .eq('visit_id', visitId)
    .in('condition', ['filled', 'crown'])
    .order('tooth_number', { ascending: true })
  if (error) throw new Error(error.message)

  const records = (data ?? []) as {
    id: string
    tooth_number: number
    condition: 'filled' | 'crown'
    surface: string | null
    created_at: string
  }[]
  if (records.length === 0) return []

  // Already-billed lines are filtered out here rather than relied on the
  // unique index alone, so the builder shows what's actually outstanding
  // instead of failing at save time.
  const { data: billed, error: billedError } = await supabase
    .from('invoice_items')
    .select('tooth_record_id')
    .in(
      'tooth_record_id',
      records.map((r) => r.id),
    )
  if (billedError) throw new Error(billedError.message)

  const billedIds = new Set((billed ?? []).map((b) => b.tooth_record_id as string))

  return records
    .filter((r) => !billedIds.has(r.id))
    .map((r) => ({
      tooth_record_id: r.id,
      tooth_number: r.tooth_number,
      condition: r.condition,
      surface: r.surface,
      charted_at: r.created_at,
    }))
}

/** The dentist's write-up for a visit, so whoever raises the invoice can
 *  see what was actually done rather than billing from the tooth chart
 *  alone — a chart records findings, the note records the appointment.
 *
 *  `visit_notes` has no policy at all for reception (0002_rls.sql), so this
 *  returns null for them rather than erroring. That is the RLS boundary
 *  doing its job and must not be worked around: the builder says who can
 *  see it instead of quietly showing an empty panel. */
export async function getVisitNote(visitId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('visit_notes')
    .select('notes')
    .eq('visit_id', visitId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.notes as string | undefined) ?? null
}

/** Visits for the invoice builder's "which visit is this for" selector. */
export async function listPatientVisits(patientId: string): Promise<{ id: string; visit_date: string }[]> {
  const { data, error } = await supabase
    .from('visits')
    .select('id, visit_date')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data as { id: string; visit_date: string }[]
}
