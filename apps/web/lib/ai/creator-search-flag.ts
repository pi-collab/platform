import 'server-only'

/**
 * Guapd AI search for brands (/ai, /api/creators/search, the nav icon):
 * CREATOR_SEARCH=1. Optionally limited to some brands while it is tried out:
 * CREATOR_SEARCH_BRAND_IDS=<uuid>,<uuid> (unset = every brand). Server only.
 */
export function creatorSearchEnabled(brandId?: string | null): boolean {
  if (process.env.CREATOR_SEARCH !== '1') return false
  const only = (process.env.CREATOR_SEARCH_BRAND_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (only.length === 0) return true
  return !!brandId && only.includes(brandId)
}

/** The creator side (the one-time notice on the creator home, the "Show me
 *  in Guapd AI search" switch and the optional fields in Settings) can go
 *  live before brands search, with CREATOR_SEARCH_NOTICE=1. Brand search
 *  implies it. */
export function creatorSearchCreatorSideEnabled(): boolean {
  return process.env.CREATOR_SEARCH_NOTICE === '1' || process.env.CREATOR_SEARCH === '1'
}
