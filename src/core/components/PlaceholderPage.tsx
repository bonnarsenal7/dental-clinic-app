export default function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <p className="text-slate-500 text-sm mt-2">Coming in {phase} of the build roadmap.</p>
    </div>
  )
}
