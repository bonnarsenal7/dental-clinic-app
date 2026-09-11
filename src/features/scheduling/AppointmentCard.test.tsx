import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AppointmentCard from './AppointmentCard'
import type { AppointmentStatus, AppointmentWithPatient } from './types'

function appointment(partial: Partial<AppointmentWithPatient> = {}): AppointmentWithPatient {
  return {
    id: 'appt-1',
    patient_id: 'pat-1',
    dentist_id: 'dent-1',
    scheduled_at: '2026-09-11T01:30:00Z',
    duration_minutes: 30,
    ends_at: '2026-09-11T02:00:00Z',
    reason: 'Oral prophylaxis',
    procedure_id: 'proc-1',
    status: 'completed',
    arrived_at: null,
    seated_at: null,
    completed_at: '2026-09-11T02:00:00Z',
    visit_id: 'visit-1',
    reception_notes: null,
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-11T02:00:00Z',
    patients: {
      id: 'pat-1',
      name: 'Maria Clara Santos',
      cell_number: '0917 555 0142',
      phone_number: null,
    },
    ...partial,
  }
}

const renderCard = (a: AppointmentWithPatient, invoiceId?: string | null) =>
  render(
    <MemoryRouter>
      <AppointmentCard appointment={a} onStatusChange={vi.fn()} busy={false} invoiceId={invoiceId} />
    </MemoryRouter>,
  )

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString()
}

describe('how long someone has been waiting', () => {
  // The number scales with how bad the answer is, so a long wait reads from
  // across the room rather than at a constant 12px.
  it('grows and turns red once a wait is overdue', () => {
    renderCard(appointment({ status: 'arrived', arrived_at: minutesAgo(30) }), null)
    const wait = screen.getByText(/waiting 30 min/i)
    expect(wait).toHaveClass('text-base', 'font-semibold', 'text-red-700')
  })

  it('stays quiet for a normal short wait', () => {
    renderCard(appointment({ status: 'arrived', arrived_at: minutesAgo(5) }), null)
    const wait = screen.getByText(/waiting 5 min/i)
    expect(wait).toHaveClass('text-xs')
    expect(wait.className).not.toContain('text-red')
  })

  // Amber would be the obvious middle step and is not available: it means
  // "crown" on the chart and carries the brand.
  it('never uses amber for a wait', () => {
    for (const mins of [5, 20, 40]) {
      const { unmount } = renderCard(appointment({ status: 'arrived', arrived_at: minutesAgo(mins) }), null)
      expect(screen.getByText(new RegExp(`waiting ${mins} min`, 'i')).className).not.toMatch(/amber|gold/)
      unmount()
    }
  })

  // Once seated the number is history, and reception is being asked about
  // someone else.
  it('stops showing a wait once the patient is in the chair', () => {
    renderCard(appointment({ status: 'in_chair', arrived_at: minutesAgo(30) }), null)
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument()
  })

  // The patient being treated is the one thing on this screen that is
  // happening rather than pending.
  it('marks the patient in the chair with an edge, not just a badge', () => {
    const { container } = renderCard(appointment({ status: 'in_chair' }), null)
    expect(container.firstElementChild).toHaveClass('border-l-4')
  })
})

describe('billing a completed appointment', () => {
  // Treatment finishing is when someone gets billed. Without this the
  // receptionist has to go and find the patient again.
  it('offers to create an invoice once treatment is complete', () => {
    renderCard(appointment(), null)
    const link = screen.getByRole('link', { name: /create invoice/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('/patients/pat-1/invoices/new'))
  })

  // The builder needs both: the appointment to prefill the line, the visit
  // to pull charted procedures.
  it('carries the appointment and the visit through to the builder', () => {
    renderCard(appointment(), null)
    const href = screen.getByRole('link', { name: /create invoice/i }).getAttribute('href') ?? ''
    expect(href).toContain('appointment=appt-1')
    expect(href).toContain('visit=visit-1')
  })

  it('links to the existing invoice instead when the visit is already billed', () => {
    renderCard(appointment(), 'inv-9')
    expect(screen.getByRole('link', { name: /view invoice/i })).toHaveAttribute('href', '/invoices/inv-9')
    expect(screen.queryByRole('link', { name: /create invoice/i })).not.toBeInTheDocument()
  })

  it.each<AppointmentStatus>(['booked', 'confirmed', 'arrived', 'in_chair'])(
    'does not offer billing while the appointment is %s',
    (status) => {
      renderCard(appointment({ status }), null)
      expect(screen.queryByRole('link', { name: /create invoice/i })).not.toBeInTheDocument()
    },
  )

  it('offers no billing for a cancelled appointment', () => {
    renderCard(appointment({ status: 'cancelled' }), null)
    expect(screen.queryByRole('link', { name: /invoice/i })).not.toBeInTheDocument()
  })

  it('still shows the reason, which becomes the invoice line', () => {
    renderCard(appointment(), null)
    expect(screen.getByText(/oral prophylaxis/i)).toBeInTheDocument()
  })
})
