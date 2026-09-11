/** The clinic's name as the app ships it.
 *
 *  Once a staff member is signed in, the name shown in the nav bar and on
 *  receipts comes from `clinic_settings.clinic_name`, which an admin edits
 *  at /admin/settings — that stays the source of truth for anything a
 *  logged-in user sees.
 *
 *  This constant covers the two cases that can't read it: the login screen,
 *  which is pre-auth and therefore blocked by the `clinic_settings` RLS
 *  policy (it requires an active staff role), and the fallback when the
 *  setting hasn't been filled in yet. Keeping it in one place is what stops
 *  the login screen and the nav bar disagreeing about the clinic's name,
 *  which is exactly what had happened.
 */
export const CLINIC_NAME = 'ToothCo Dental Clinic'
