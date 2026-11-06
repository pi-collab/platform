import 'server-only'
import { resolveSendMode } from '@/lib/send-gate'
import { NICHES } from '@/lib/niches'
import type { BriefFilters } from '@/lib/ai/creator-search-types'

/**
 * Creator invites are an outbound reach to creators, so they follow the SAME
 * approval rule as a brand's first deal (lib/send-gate.ts resolveSendMode),
 * with one difference: a deal from an unapproved brand is held, but an invite
 * is refused outright. Its link is never created, so it cannot exist or be
 * copied. Every route that creates, sends or (later) emails an invite must
 * call this first. The status is read from the database, never the client.
 */
export async function brandMayInvite(brandId: string): Promise<boolean> {
  return (await resolveSendMode(brandId)).mode === 'send'
}

export const NOT_APPROVED_MESSAGE = 'Invites open once Guapd approves your brand. You can still search and send offers.'

/**
 * What the invite page says about the campaign: built by Guapd from the
 * search's fixed-list fields only (niches, deliverables). Never text the brand
 * typed, and never the model's free-text summary or timeline: campaign text
 * has no review today, so none of it reaches a creator through an invite.
 */
export function inviteSummary(f: BriefFilters): string {
  const known = new Set<string>(NICHES)
  const niches = [...f.mustHave.niches, ...f.niceToHave.niches].filter((n) => known.has(n)).slice(0, 2)
  const what = niches.length ? `${niches.join(' and ')} creators` : 'creators'
  const deliverables = f.context.deliverables.filter((d) => d !== 'ugc' && d !== 'live')
  const making = deliverables.length ? ` to make ${deliverables.join(', ')}` : ''
  return `Looking for ${what}${making} for a campaign on Guapd.`
}
