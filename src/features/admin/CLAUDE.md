# Admin — working notes

Moved out of the root CLAUDE.md so it loads only when working in this
directory. The root file keeps the project-wide rules — including that
deactivation is two things and a restore must undo both — and points here.
The server side of these rules is `supabase/functions/manage-staff/`.

## Staff passwords

### An admin may set a password, or let one be generated
Both `create` and `reset_password` take an **optional** `password`. Left
blank, the server generates one and nothing changes. Supplied, that becomes
the password — because reading `Tmp-9fA2xQ` down the phone is how a new
starter is locked out on their first morning, and a clinic will otherwise
invent its own workaround.

**The eight-character minimum is enforced in the Edge Function, not only in
the form.** The endpoint is reachable with any HTTP client, so "the UI
checks it" is not a check. It matches the minimum `ResetPasswordPage`
already applies, so a password an admin sets is one the staff member could
have set themselves. A refused attempt leaves the old password working —
verified live, not assumed.

The response carries `chosen`, so the screen can say "Password set" rather
than "New temporary password". A chosen password is echoed back too: that is
how the admin sees what they actually typed.

The field is cleared whenever the dialog opens. Carrying a typed password
from one account's dialog to the next would set it on somebody it was never
meant for.

### Resetting a password issues one, rather than emailing a link
`reset_password` sets a new temporary password and returns it once, the same
shape as `create`. It is not an emailed reset link, because the case it
exists for is a staff member locked out mid-clinic-day who often cannot
reach the mailbox on file — or whose address is shared. Self-service by
email still lives at `/forgot-password` for anyone who can receive mail.

**Only offered for active accounts.** A new password does nothing against a
deactivated one: the GoTrue ban refuses the login before the password is
ever checked, so handing an admin a credential that cannot be used would be
worse than refusing. The Edge Function enforces this too, not just the UI.

**It does not cut off an open session.** Changing a password leaves existing
refresh tokens valid. If the point of the reset is that the old password
leaked, deactivate and restore instead — that bans and unbans in GoTrue,
which does end the session. The confirmation dialog says this.
