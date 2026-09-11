import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useAuth } from '../auth/AuthContext'
import type { StaffProfile, StaffRole } from '../auth/types'
import { createStaff, deactivateStaff, listStaff, reactivateStaff } from './api'
import { toMessage } from '../../core/errors'
import { ErrorState } from '../../core/components/states'
import ConfirmDialog from '../../core/components/ui/ConfirmDialog'
import Button from '../../core/components/ui/Button'
import { Field, NativeSelect, TextInput } from '../../core/components/ui/Field'
import { PageHeader } from '../../core/components/ui/Page'

interface CreateStaffForm {
  name: string
  email: string
  role: StaffRole
}

export default function StaffManagementPage() {
  const { staff: currentStaff } = useAuth()
  const [staffList, setStaffList] = useState<StaffProfile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newAccountNotice, setNewAccountNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // The account the confirmation is currently asking about, or null.
  const [pendingDeactivation, setPendingDeactivation] = useState<StaffProfile | null>(null)
  const [pendingReactivation, setPendingReactivation] = useState<StaffProfile | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<CreateStaffForm>({ defaultValues: { role: 'receptionist' } })

  async function refresh() {
    try {
      setStaffList(await listStaff())
    } catch (e) {
      setError(toMessage(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCreate(values: CreateStaffForm) {
    setError(null)
    setNewAccountNotice(null)
    try {
      const result = await createStaff(values)
      setNewAccountNotice(
        `Account created for ${values.email}. Temporary password: ${result.tempPassword} — share this with them directly; they should change it after first login.`,
      )
      reset({ name: '', email: '', role: 'receptionist' })
      await refresh()
    } catch (e) {
      setError(toMessage(e))
    }
  }

  // These throw rather than catching: ConfirmDialog shows the failure inside
  // itself, where the person who pressed the button is still looking.
  async function onDeactivate(id: string) {
    setBusyId(id)
    try {
      await deactivateStaff(id)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  async function onReactivate(id: string) {
    setBusyId(id)
    try {
      await reactivateStaff(id)
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Staff accounts" description="Create, list, and deactivate staff logins." />

      {error && <ErrorState message={error} />}
      {newAccountNotice && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          {newAccountNotice}
        </p>
      )}

      <form
        noValidate
        onSubmit={handleSubmit(onCreate)}
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4 max-w-lg"
      >
        <h2 className="text-sm font-semibold text-slate-700">Add a staff account</h2>
        <Field label="Full name" error={errors.name?.message}>
          <TextInput {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <TextInput type="email" {...register('email', { required: 'Email is required' })} />
        </Field>
        <Field label="Role">
          <NativeSelect {...register('role')}>
            <option value="receptionist">Receptionist</option>
            <option value="dentist">Dentist</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </Field>
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staffList === null && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            )}
            {staffList?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No staff accounts yet.
                </td>
              </tr>
            )}
            {staffList?.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-700">{s.name}</td>
                <td className="px-4 py-2 text-slate-500">{s.email}</td>
                <td className="px-4 py-2 text-slate-500 capitalize">{s.role}</td>
                <td className="px-4 py-2">
                  {s.active ? (
                    <span className="text-emerald-700 bg-emerald-50 text-xs px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="text-slate-500 bg-slate-100 text-xs px-2 py-0.5 rounded-full">
                      Deactivated
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {s.active && s.id !== currentStaff?.id && (
                    <button
                      onClick={() => setPendingDeactivation(s)}
                      disabled={busyId === s.id}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      {busyId === s.id ? 'Deactivating…' : 'Deactivate'}
                    </button>
                  )}
                  {/* The list deliberately keeps deactivated accounts, which
                      implies you can do something about them. Until now you
                      could not: undoing a deactivation meant a database edit
                      plus lifting the GoTrue ban by hand. */}
                  {!s.active && (
                    <button
                      onClick={() => setPendingReactivation(s)}
                      disabled={busyId === s.id}
                      className="text-xs text-slate-600 hover:underline disabled:opacity-50"
                    >
                      {busyId === s.id ? 'Restoring…' : 'Restore access'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingReactivation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReactivation(null)
        }}
        title={`Restore access for ${pendingReactivation?.name ?? 'this account'}?`}
        description="They will be able to log in again immediately, with the role shown. Their password is unchanged — if they no longer have it, they can reset it from the login screen."
        confirmLabel="Restore access"
        tone="default"
        onConfirm={async () => {
          if (pendingReactivation) await onReactivate(pendingReactivation.id)
        }}
      />

      <ConfirmDialog
        open={pendingDeactivation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivation(null)
        }}
        title={`Deactivate ${pendingDeactivation?.name ?? 'this account'}?`}
        description="They will be signed out immediately and will not be able to log in again. Their record stays, and an admin can restore access later."
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (pendingDeactivation) await onDeactivate(pendingDeactivation.id)
        }}
      />
    </div>
  )
}
