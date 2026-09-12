// Edge Function: manage-staff
//
// Handles the privileged staff-account operations (create, deactivate,
// reactivate, reset_password) that need the service-role key. That key must never reach the browser,
// so this function is the only place it's used — the React app calls this
// function instead of touching auth.admin.* directly.
//
// Deploy with: supabase functions deploy manage-staff
// (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
// injected automatically by Supabase — no manual secrets needed.)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** The one rule an admin-chosen password has to clear.
 *
 *  Matches ResetPasswordPage's own minimum, so a password an admin sets is
 *  one the staff member could have set themselves. Enforced here rather
 *  than only in the browser: this function is reachable with any HTTP
 *  client, and "the UI checks it" is not a check. */
function rejectWeakPassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password.trim().length === 0) return 'Password cannot be only spaces.'
  return null
}

function generateTempPassword() {
  // 16 random bytes -> base64url, trimmed to a comfortable length.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, 'A')
    .replace(/\//g, 'B')
    .replace(/=/g, '')
    .slice(0, 16)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401)
  }

  // Client scoped to the caller's own JWT — used only to find out who is
  // calling and confirm they are an active admin.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()
  if (userError || !user) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const { data: callerStaff, error: staffError } = await callerClient
    .from('staff')
    .select('role, active')
    .eq('id', user.id)
    .single()
  if (staffError || !callerStaff || !callerStaff.active || callerStaff.role !== 'admin') {
    return json({ error: 'Admin role required' }, 403)
  }

  // Elevated client — service-role key never leaves this function.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const action = payload.action

  if (action === 'create') {
    const { name, email, role, password } = payload as {
      name?: string
      email?: string
      role?: string
      password?: string
    }
    if (!name || !email || !role) {
      return json({ error: 'name, email, and role are required' }, 400)
    }
    if (!['dentist', 'receptionist', 'admin'].includes(role)) {
      return json({ error: 'role must be dentist, receptionist, or admin' }, 400)
    }

    // An admin may set the password rather than relay a generated one —
    // reading "Tmp-9fA2xQ" down the phone is how a new starter ends up
    // locked out on their first morning.
    if (password !== undefined && password !== '') {
      const weak = rejectWeakPassword(password)
      if (weak) return json({ error: weak }, 400)
    }
    const chosen = password !== undefined && password !== ''
    const tempPassword = chosen ? password! : generateTempPassword()

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createError || !created.user) {
      return json({ error: createError?.message ?? 'Failed to create auth user' }, 400)
    }

    const { error: insertError } = await adminClient.from('staff').insert({
      id: created.user.id,
      name,
      email,
      role,
      active: true,
    })
    if (insertError) {
      // Roll back the auth user so we don't leave an orphaned login with
      // no matching staff row.
      await adminClient.auth.admin.deleteUser(created.user.id)
      return json({ error: insertError.message }, 400)
    }

    return json({
      staffId: created.user.id,
      // Echoed back either way: a generated one has to be, and repeating a
      // chosen one is how the admin checks they typed what they meant.
      tempPassword,
      chosen,
      note: chosen
        ? 'Give this password to the new staff member directly. They should change it after logging in.'
        : 'Share this temporary password with the new staff member out of band. They should change it after first login.',
    })
  }

  if (action === 'deactivate') {
    const { staffId } = payload as { staffId?: string }
    if (!staffId) {
      return json({ error: 'staffId is required' }, 400)
    }
    if (staffId === user.id) {
      return json({ error: "You can't deactivate your own account." }, 400)
    }

    const { error: updateError } = await adminClient.from('staff').update({ active: false }).eq('id', staffId)
    if (updateError) {
      return json({ error: updateError.message }, 400)
    }

    // Ban at the auth level too, so a still-valid session token can't be
    // used to sign in again or refresh — not just blocked by RLS.
    const { error: banError } = await adminClient.auth.admin.updateUserById(staffId, {
      ban_duration: '876000h',
    })
    if (banError) {
      return json({ error: banError.message }, 400)
    }

    return json({ ok: true })
  }

  if (action === 'reset_password') {
    const { staffId, password } = payload as { staffId?: string; password?: string }
    if (!staffId) {
      return json({ error: 'staffId is required' }, 400)
    }

    // Issues a new temporary password rather than emailing a reset link.
    // The reason is the failure this exists for: a staff member locked out
    // mid-clinic-day often cannot reach the mailbox on file, or the address
    // is a shared one. A password an admin can read out is recoverable in
    // the room. It also matches how accounts are created here — there is no
    // email-invite flow either.
    //
    // The self-service email route still exists at /forgot-password for
    // anyone who can receive mail.
    const { data: target, error: lookupError } = await adminClient
      .from('staff')
      .select('name, active')
      .eq('id', staffId)
      .maybeSingle()
    if (lookupError) {
      return json({ error: lookupError.message }, 400)
    }
    if (!target) {
      // Without this the admin API returns a bare 404 that reads as a bug.
      return json({ error: 'No staff account with that id.' }, 404)
    }
    if (!target.active) {
      // A new password does nothing for a deactivated account: the GoTrue
      // ban blocks the login before the password is ever checked. Saying so
      // is better than handing over a credential that cannot be used.
      return json(
        { error: 'That account is deactivated. Restore access first, then reset the password.' },
        400,
      )
    }

    if (password !== undefined && password !== '') {
      const weak = rejectWeakPassword(password)
      if (weak) return json({ error: weak }, 400)
    }
    const chosen = password !== undefined && password !== ''
    const tempPassword = chosen ? password! : generateTempPassword()

    const { error: updateError } = await adminClient.auth.admin.updateUserById(staffId, {
      password: tempPassword,
    })
    if (updateError) {
      return json({ error: updateError.message }, 400)
    }

    return json({
      staffId,
      tempPassword,
      chosen,
      note: 'Give this password to them directly. They should change it after logging in. Any session they already have open stays valid until it times out — deactivate and restore the account if you need to cut those off.',
    })
  }

  if (action === 'reactivate') {
    const { staffId } = payload as { staffId?: string }
    if (!staffId) {
      return json({ error: 'staffId is required' }, 400)
    }

    // Deactivation does two things, so restoring has to undo both. Clearing
    // staff.active alone would leave the account able to reach data via RLS
    // while GoTrue still refused the login — an account that looks restored
    // in the Staff screen and cannot sign in.
    const { error: updateError } = await adminClient.from('staff').update({ active: true }).eq('id', staffId)
    if (updateError) {
      return json({ error: updateError.message }, 400)
    }

    // 'none' lifts the ban. Order matters: if this fails after the flag is
    // set, the account is visibly active but cannot log in — so the flag is
    // put back rather than left inconsistent.
    const { error: unbanError } = await adminClient.auth.admin.updateUserById(staffId, {
      ban_duration: 'none',
    })
    if (unbanError) {
      await adminClient.from('staff').update({ active: false }).eq('id', staffId)
      return json({ error: `Could not lift the login ban: ${unbanError.message}` }, 400)
    }

    return json({ ok: true })
  }

  return json({ error: 'Unknown action. Use "create", "deactivate", "reactivate" or "reset_password".' }, 400)
})
