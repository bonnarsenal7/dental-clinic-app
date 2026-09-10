import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../../core/supabaseClient'

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

  if (loading) return <p className="text-slate-400 text-sm">Loading…</p>

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-lg font-semibold text-slate-800">Clinic settings</h1>
        <p className="text-slate-500 text-sm mt-1">Shown in the app's header for every staff member.</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
      )}
      {saved && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
          Saved.
        </p>
      )}

      <form
        onSubmit={handleSubmit(onSave)}
        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4"
      >
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Clinic name
          <input {...register('clinic_name')} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Operating hours
          <input
            {...register('operating_hours')}
            placeholder="e.g. Mon–Sat, 9am–6pm"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="self-start rounded-md bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
