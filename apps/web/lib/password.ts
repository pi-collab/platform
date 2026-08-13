/**
 * Password rules — the single definition, used by BOTH signup and reset.
 *
 * Deliberately not `server-only`: the same function runs client-side for
 * instant feedback and server-side as the actual gate. Client validation is a
 * convenience; the server call is what enforces. Keeping one implementation
 * means the two can never drift apart, which is how a "min 8" rule quietly
 * becomes "min 8 on one screen, anything on the other".
 *
 * Supabase enforces its own project-level minimum as a final backstop.
 */

export const MIN_PASSWORD_LENGTH = 8

export type PasswordCheck = { ok: true } | { ok: false; message: string }

/**
 * Validate a new password and its confirmation.
 * `confirmation` is optional — omit it where there is no confirm field.
 */
export function validateNewPassword(password: string, confirmation?: string): PasswordCheck {
  if (!password) {
    return { ok: false, message: 'Enter a password.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (confirmation !== undefined && password !== confirmation) {
    return { ok: false, message: 'Passwords do not match.' }
  }
  return { ok: true }
}
