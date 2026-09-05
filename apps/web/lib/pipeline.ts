/**
 * Outreach pipeline vocabulary and types.
 *
 * No `server-only` marker: this is stage names, labels, colours and a date
 * helper, and the board and feedback log are client components that need all of
 * it. The queries that compute the activation checklist live in
 * `pipeline-activation.ts`, which IS server-only — keeping them here would have
 * forced the vocabulary to be duplicated for the client, and two copies of a
 * stage list is how a filter quietly stops matching a stage.
 *
 * ── Why the stage list is SHORT ─────────────────────────────────────────────
 * The original spec had six creator stages: Contacted, Signed up, Vetted,
 * Storefront complete, Bio link, Bringing deals. Three of those are facts the
 * database already owns — `creators.vetting_status`, whether a
 * `creator_storefronts` row is published, whether any deal exists. A hand-set
 * stage that duplicates a known fact does not stay equal to it: someone forgets
 * to drag the card, and from then on the board and the funnel both report
 * something that is not true.
 *
 * So the stage covers only what a human knows and no query can answer — did
 * they reply, are they interested — and everything after signup is DERIVED on
 * read. Same information on screen; the half that can rot is now the half a
 * person is actually maintaining.
 */

export const LEAD_STAGES = ['contacted', 'replied', 'interested', 'signed_up', 'lost'] as const
export type LeadStage = typeof LEAD_STAGES[number]

export const STAGE_LABEL: Record<LeadStage, string> = {
  contacted: 'Contacted',
  replied: 'Replied',
  interested: 'Interested',
  signed_up: 'Signed up',
  lost: 'Lost',
}

/** Funnel order. `lost` is deliberately outside it — a funnel that counts its
 *  own drop-outs as a stage reads as though losing were progress. */
export const FUNNEL_STAGES: LeadStage[] = ['contacted', 'replied', 'interested', 'signed_up']

export const STAGE_TONE: Record<LeadStage, { bg: string; fg: string }> = {
  contacted:  { bg: '#f1f5f9', fg: '#475569' },
  replied:    { bg: '#e0f2fe', fg: '#075985' },
  interested: { bg: '#fef3c7', fg: '#92400e' },
  signed_up:  { bg: '#dcfce7', fg: '#166534' },
  lost:       { bg: '#fee2e2', fg: '#991b1b' },
}

export const LEAD_SOURCES = [
  'utkarsh_network', 'referral', 'inbound', 'linkedin', 'instagram', 'event', 'cold_outreach', 'other',
] as const
export type LeadSource = typeof LEAD_SOURCES[number]

export const SOURCE_LABEL: Record<string, string> = {
  utkarsh_network: "Utkarsh's network",
  referral: 'Referral',
  inbound: 'Inbound',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  event: 'Event',
  cold_outreach: 'Cold outreach',
  other: 'Other',
}

export const FEEDBACK_CATEGORIES = ['objection', 'feature_request', 'pricing', 'trust', 'other'] as const
export const FEEDBACK_STATUSES = ['open', 'planned', 'shipped', 'wont_do'] as const

export const FEEDBACK_CATEGORY_LABEL: Record<string, string> = {
  objection: 'Objection',
  feature_request: 'Feature request',
  pricing: 'Pricing',
  trust: 'Trust',
  other: 'Other',
}

export const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  planned: 'Planned',
  shipped: 'Shipped',
  wont_do: "Won't do",
}

export function isLeadStage(v: unknown): v is LeadStage {
  return typeof v === 'string' && (LEAD_STAGES as readonly string[]).includes(v)
}

export interface LeadRow {
  id: string
  kind: 'brand' | 'creator'
  name: string
  handle: string | null
  contact_email: string | null
  contact_phone: string | null
  platform: string | null
  followers: number | null
  niche: string | null
  notes: string | null
  stage: LeadStage
  owner_email: string | null
  source: string | null
  brand_id: string | null
  creator_id: string | null
  last_touch_at: string
  created_at: string
}

/**
 * What a creator has actually done, computed from the real tables.
 *
 * Every field here is read from the system of record at request time. None of
 * it is stored on the lead, so none of it can disagree with the product.
 */
export interface Activation {
  vetted: boolean
  storefrontLive: boolean
  bioLink: boolean
  firstDeal: boolean
}

export const ACTIVATION_STEPS: { key: keyof Activation; label: string }[] = [
  { key: 'vetted', label: 'Vetted' },
  { key: 'storefrontLive', label: 'Storefront live' },
  { key: 'bioLink', label: 'Bio link' },
  { key: 'firstDeal', label: 'First deal' },
]

/** Days since the last touch, for the "nobody has looked at this" column. */
export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
