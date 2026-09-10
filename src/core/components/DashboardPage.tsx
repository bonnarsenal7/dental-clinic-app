import { useAuth } from '../../features/auth/AuthContext'

export default function DashboardPage() {
  const { staff } = useAuth()
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10">
      <h1 className="text-lg font-semibold text-slate-800">Welcome, {staff?.name}</h1>
      <p className="text-slate-500 text-sm mt-2">
        You're signed in as <span className="capitalize font-medium">{staff?.role}</span>. Use the nav above to get
        around — sections you don't have access to simply won't appear.
      </p>
    </div>
  )
}
