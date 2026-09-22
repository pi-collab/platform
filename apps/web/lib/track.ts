/**
 * The two tracks, and how they are shown.
 *
 * Client-safe: the tag renders in the browser, and a server-only module could
 * not be imported by the components doing the rendering. Same split as
 * creator-onboarding-labels vs creator-onboarding.
 *
 * ── One source for the words and the colour ─────────────────────────────────
 * Growth is indigo here because it is indigo in ops (VETTING_TONE.growth) and
 * indigo on the "Move to Guapd Growth" button. A brand and a founder looking at
 * the same creator should be looking at the same colour.
 */

export type Track = 'deals' | 'growth'

export const TRACKS: Track[] = ['deals', 'growth']

export const TRACK_LABEL: Record<Track, string> = {
  deals: 'Deals',
  growth: 'Growth',
}

export const TRACK_TONE: Record<Track, { bg: string; fg: string; border: string }> = {
  // Slate: the default track, and a tag that should not shout on every row.
  deals:  { bg: 'rgba(120,130,150,.10)', fg: '#4A4F58', border: 'rgba(120,130,150,.22)' },
  growth: { bg: '#eef2ff',               fg: '#4338ca', border: '#c7d2fe' },
}

/** What each track means to a brand, for the one place that has to explain it. */
export const TRACK_BLURB: Record<Track, string> = {
  deals: 'Established creators, negotiated one deal at a time. Billed per deal.',
  growth: 'Emerging creators with fixed packages, grouped into one campaign. Billed as one campaign.',
}

/**
 * The track a creator belongs to, from their vetting status.
 *
 * Returns null for pending and rejected creators — they belong to no track and
 * a brand should never see them. Callers render nothing rather than guessing.
 */
export function trackOfVettingStatus(status: string | null | undefined): Track | null {
  if (status === 'deals_approved') return 'deals'
  if (status === 'growth') return 'growth'
  return null
}

/** The vetting status a campaign of this track requires of its creators. */
export function requiredVettingStatus(track: Track): 'deals_approved' | 'growth' {
  return track === 'growth' ? 'growth' : 'deals_approved'
}
