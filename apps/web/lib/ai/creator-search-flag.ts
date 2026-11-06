import 'server-only'

/** Guapd AI search for brands (/ai, /api/creators/search, the nav icon) is
 *  off unless CREATOR_SEARCH=1. Read server-side only. */
export function creatorSearchEnabled(): boolean {
  return process.env.CREATOR_SEARCH === '1'
}

/** The creator side (the Settings switch and optional fields, the creator
 *  home card) can go live first, on its own, with CREATOR_SEARCH_OPTIN=1, so
 *  creators opt in before brands can search. Brand search implies it. */
export function creatorSearchOptInEnabled(): boolean {
  return process.env.CREATOR_SEARCH_OPTIN === '1' || creatorSearchEnabled()
}
