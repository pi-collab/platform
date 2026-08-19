/**
 * The audience band a creator picked during onboarding.
 *
 * Stored on the primary social account inside `creators.social_accounts`, not
 * in a column of its own — the answer belongs to an account, and a creator can
 * eventually have several. Reading it goes through here so the shape is
 * described in one place rather than re-derived at every call site.
 *
 * Deliberately tolerant. `social_accounts` is jsonb written by more than one
 * path (onboarding, the ops editor, older rows created before the field
 * existed), so anything unexpected reads as "not answered" rather than
 * throwing inside a page render or an email.
 */
export function followerRangeOf(socialAccounts: unknown): string | null {
  if (!Array.isArray(socialAccounts)) return null
  for (const entry of socialAccounts) {
    if (entry && typeof entry === 'object') {
      const value = (entry as Record<string, unknown>).follower_range
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return null
}
