import { supabase } from '../../core/supabaseClient'
import type { BillableCharting, Invoice, InvoiceWithDetail, PaymentMethod, Procedure } from './types'

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

export async function voidInvoice(id: string) {
  const { error } = await supabase.from('invoices').update({ status: 'void' }).eq('id', id)
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
