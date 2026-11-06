import 'server-only'

/** Guapd AI search (/ai, /api/creators/search, the nav icon, the creator
 *  opt-in) is off unless CREATOR_SEARCH=1. Read server-side only. */
export function creatorSearchEnabled(): boolean {
  return process.env.CREATOR_SEARCH === '1'
}
