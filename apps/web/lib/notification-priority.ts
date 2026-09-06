import 'server-only'

/**
 * "1 needs your reply" — the thing at the top of the notifications screen.
 *
 * ── Why this is a live query and not a notification ─────────────────────────
 * The obvious implementation is to count unread notifications of type
 * `offer_sent`. That is wrong in the way that matters: a notification records
 * that something HAPPENED, and this card claims something is STILL OUTSTANDING.
 * A creator who accepted the offer from the deal page, or from their inbox, or
 * on their phone last night, has an unread notification and nothing to reply
 * to. The card would nag them about work they had already done, which is the
 * fastest way to teach someone to ignore a banner.
 *
 * So it asks the deals table what is actually waiting.
 *
 * ── The two sides want different questions ─────────────────────────────────
 * The design is a creator screen and its card means "an offer you must answer".
 * A brand never answers offers — they send them. Their equivalent pending
 * action is content submitted and waiting on their approval, so that is what
 * the brand card shows. Rendering the creator's question on the brand screen
 * would have produced a card that is permanently empty and quietly implies
 * nothing needs them.
 *
 * ── About the deadline ─────────────────────────────────────────────────────
 * The mockup reads "Respond in 2 days". THERE IS NO SUCH FIELD. Nothing on
 * `deals` carries an offer expiry — `expires_at` exists only on phone
 * verifications, brand invites and Instagram tokens — and nothing anywhere
 * expires an offer.
 *
 * Inventing a countdown would be a promise the system does not keep: the
 * screen would say two days, nothing would happen on day three, and the number
 * would be a lie the product tells on a schedule. So this returns how long the
 * thing HAS been waiting, which is true, sourced, and carries the same urgency.
 * If a real expiry is added later, `waitingSince` is the field to build it on.
 */

export interface PriorityItem {
  dealId: string
  /** The other party — brand name for a creator, creator name for a brand. */
  counterpart: string
  title: string
  /** e.g. "1 static post + 1 story". Null when the deal has no summary. */
  deliverables: string | null
  pricePaise: number | null
  /** When it started waiting. Rendered as "waiting N days", never a countdown. */
  waitingSince: string
}

type Client = {
  from: (t: string) => any
}

/**
 * Offers a creator has not answered.
 *
 * `negotiating` is the only status where the ball is in the creator's court:
 * once they accept or counter it leaves that state. Held deals are excluded —
 * a deal awaiting brand approval has not reached the creator, so asking them to
 * reply to it would be asking about something they cannot see.
 */
export async function pendingForCreator(supabase: Client, creatorId: string): Promise<PriorityItem[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title, deliverables, price_paise, created_at, updated_at, brands(name)')
    .eq('creator_id', creatorId)
    .eq('status', 'negotiating')
    .is('held_at', null)
    .order('created_at', { ascending: true })
    .limit(5)

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map((d) => {
    const raw = d.brands
    const brand = Array.isArray(raw) ? raw[0] : (raw as { name?: string } | null)
    return {
      dealId: d.id as string,
      counterpart: brand?.name ?? 'A brand',
      title: (d.title as string) || 'Untitled deal',
      deliverables: (d.deliverables as string) || null,
      pricePaise: (d.price_paise as number) ?? null,
      waitingSince: (d.created_at as string),
    }
  })
}

/**
 * Content submitted and waiting on the brand.
 *
 * Counted per DEAL, not per item: a creator uploading three files produces one
 * review, and three cards for one job would misrepresent the size of the queue.
 */
export async function pendingForBrand(supabase: Client, brandId: string): Promise<PriorityItem[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('id, title, deliverables, price_paise, created_at, updated_at, creators(full_name)')
    .eq('brand_id', brandId)
    .eq('status', 'delivered')
    .order('updated_at', { ascending: true })
    .limit(5)

  if (error || !data) return []

  return (data as Record<string, unknown>[]).map((d) => {
    const raw = d.creators
    const creator = Array.isArray(raw) ? raw[0] : (raw as { full_name?: string } | null)
    return {
      dealId: d.id as string,
      counterpart: creator?.full_name ?? 'A creator',
      title: (d.title as string) || 'Untitled deal',
      deliverables: (d.deliverables as string) || null,
      pricePaise: (d.price_paise as number) ?? null,
      // Delivery is the moment the clock starts, and `updated_at` moved when the
      // deal entered `delivered`. created_at would say how old the DEAL is,
      // which on a months-old collaboration reads as a wildly overdue review.
      waitingSince: (d.updated_at as string) || (d.created_at as string),
    }
  })
}
