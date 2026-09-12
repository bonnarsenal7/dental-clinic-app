/** `draft` is the dentist's working total while the patient is in the
 *  chair — editable by them and nobody else (0013). Everything after it is
 *  derived from payments by the totals trigger, except `void`, which is
 *  sticky like `draft`. */
export type InvoiceStatus = 'draft' | 'unpaid' | 'partial' | 'paid' | 'void'

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'other'

/** One entry in the configurable price list. `chart_condition` links a
 *  procedure to Phase 3's charting vocabulary, so the invoice builder can
 *  offer the right procedures for what was charted at a visit. */
export interface Procedure {
  id: string
  name: string
  code: string | null
  default_fee: number
  chart_condition: 'filled' | 'crown' | null
  active: boolean
  created_at: string
}

/** description and tooth_number are copied onto the line at creation time
 *  rather than read through tooth_record_id: reception has no access to
 *  tooth_records, and an invoice must not re-word itself when the chart is
 *  later re-charted. */
export interface InvoiceItem {
  id: string
  invoice_id: string
  description: string
  amount: number
  procedure_id: string | null
  tooth_record_id: string | null
  tooth_number: number | null
  created_at: string
}

export interface Payment {
  id: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  received_by: string | null
  paid_at: string
}

/** total_amount and status are maintained by database triggers, not by the
 *  client — never write them directly. */
export interface Invoice {
  id: string
  patient_id: string
  visit_id: string | null
  status: InvoiceStatus
  total_amount: number
  created_by: string | null
  created_at: string
}

/** A draft carries its lines but never any payments — nothing can be paid
 *  against an invoice that is still being written. */
export interface DraftInvoice extends Invoice {
  invoice_items: InvoiceItem[]
}

export interface InvoiceWithDetail extends Invoice {
  invoice_items: InvoiceItem[]
  payments: Payment[]
}

/** A procedure charted at a visit that hasn't been billed yet. Only
 *  dentist/admin can build this — it reads tooth_records. */
export interface BillableCharting {
  tooth_record_id: string
  tooth_number: number
  condition: 'filled' | 'crown'
  surface: string | null
  charted_at: string
}

/** One row of the patient's treatment ledger — the digital equivalent of
 *  the clinic's paper Date / Treatment / Fee / Balance sheet. Charges and
 *  payments interleave chronologically, with a running balance. */
export interface LedgerRow {
  key: string
  date: string
  description: string
  /** Positive for a charge, null for a payment row. */
  fee: number | null
  /** Positive for a payment, null for a charge row. */
  paid: number | null
  balance: number
  invoiceId: string
}
