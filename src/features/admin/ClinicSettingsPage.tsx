import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../../core/supabaseClient'
import { ErrorState, LoadingState } from '../../core/components/states'
import Button from '../../core/components/ui/Button'
import { Field, TextInput } from '../../core/components/ui/Field'
import { PageHeader } from '../../core/components/ui/Page'

interface SettingsForm {
  clinic_name: string
  operating_hours: string
}

export default function ClinicSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SettingsForm>({ defaultValues: { clinic_name: '', operating_hours: '' } })

  useEffect(() => {
    supabase
      .from('clinic_settings')
      .select('clinic_name, operating_hours')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        if (data) reset(data)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSave(values: SettingsForm) {
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('clinic_settings')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) {
      setError(error.message)
      return
    }
    setSaved(true)
  }

  if (loading) return <LoadingState />

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <PageHeader title="Clinic settings" description="Shown in the app's header for every staff member." />

      {error && <ErrorState message={error} />}
      {saved && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Saved.
        </p>
      )}

      <form
        onSubmit={handleSubmit(onSave)}
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4"
      >
        <Field label="Clinic name">
          <TextInput {...register('clinic_name')} />
        </Field>
        <Field label="Operating hours">
          <TextInput {...register('operating_hours')} placeholder="e.g. Mon–Sat, 9am–6pm" />
        </Field>
        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </div>
  )
}
