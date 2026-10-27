import type { ReactNode } from 'react'
import { CLINIC_NAME } from '../../core/branding'
import toothcoLogo from '../../assets/toothco-logo.png'

/** The frame every signed-out screen shares: logo, a card with the gold
 *  strip, and an optional line beneath it. One place, so the login and the
 *  password screens cannot drift into looking like different apps.
 *
 *  The page's <h1> is the clinic name, hidden — the logo shows it, and
 *  LoginPage.test.tsx pins that the heading carries it. */
export default function AuthLayout({
  title,
  intro,
  footer,
  children,
}: {
  title: string
  intro?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src={toothcoLogo} alt={CLINIC_NAME} className="h-16 w-auto" />
        </div>
        <h1 className="sr-only">{CLINIC_NAME}</h1>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="h-1 bg-gold-700" />
          <div className="px-8 pt-7 pb-8">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {intro && <p className="text-sm text-slate-500 mt-1 mb-6">{intro}</p>}
            {children}
          </div>
        </div>

        {footer && <p className="text-xs text-slate-500 text-center mt-6">{footer}</p>}
      </div>
    </div>
  )
}

export const authAlertCls = 'mb-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2'

export const authLinkCls = 'block text-center text-sm text-gold-700 hover:text-gold-800 hover:underline mt-5'
