/**
 * Marker proving the current session arrived via a password-recovery link.
 *
 * Set by /auth/confirm after a successful verifyOtp, required by
 * /reset-password, and cleared once the password is changed.
 *
 * Why this exists: after recovery, Supabase gives an ordinary session — there
 * is no durable "this is a recovery session" flag to read back. Without a
 * marker, ANY logged-in user could open /reset-password and set a new password
 * without knowing the current one, which on a shared or unattended machine
 * means locking the real owner out of their account.
 *
 * Short-lived on purpose: long enough to fill in a form, not long enough to
 * linger. httpOnly so page scripts cannot read or forge it.
 */
export const RECOVERY_COOKIE = 'guapd_pw_recovery'

/** 15 minutes — ample to set a password, short enough to not linger. */
export const RECOVERY_COOKIE_MAX_AGE = 60 * 15
