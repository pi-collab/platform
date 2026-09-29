import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { brandDomainMatch, type DomainMatch } from '@/lib/brand-domain'

/**
 * Whether this brand may read the creator roster yet.
 *
 * ── The thing being protected ───────────────────────────────────────────────
 * /browse is the whole vetted roster with names, handles, past brands, RATE
 * CARDS, package prices and audience data. It is the supply side and the moat,
 * and until now any signup that got past the free-email check could read all of
 * it before a human had looked at the account.
 *
 * ── Why not gate every unapproved brand ─────────────────────────────────────
 * Because most of them are real, and a wall in front of a real brand costs a
 * customer. The narrow version holds only the accounts where the signup itself
 * does not add up — today, where the contact email's domain has nothing to do
 * with the website's. That is a small share of signups and the one where a
 * reviewer's eye is actually worth something.
 *
 * ── The false positives are the point, not a flaw ───────────────────────────
 * Blinkit's staff are on grofers.com and will be held. That is acceptable ONLY
 * because holding is not refusing: they wait for an approval that a founder can
 * give in minutes, and lib/brand-domain.ts never rejects anyone. If this ever
 * becomes a block, this reasoning stops holding.
 *
 * ── What is NOT gated ───────────────────────────────────────────────────────
 * Signup, onboarding, their own dashboard, their own deals. And the creator
 * they arrived from, if they came through a storefront link — that creator sent
 * them here personally, and walling a brand off from the person who invited
 * them is the one outcome worse than showing them a rate.
 *
 * Sending is a separate gate and always was: lib/send-gate.ts holds the deal
 * of any brand that is not approved, mismatch or no mismatch.
 */
export interface BrandRosterAccess {
  /** True when the roster must be withheld from this brand. */
  held: boolean
  /** Why, for the screen they see and for ops. Null when nothing is held. */
  reason: string | null
  /** The creator whose link brought them, who stays visible regardless. */
  originCreatorId: string | null
  /** The raw comparison, so ops can show what did not line up. */
  domain: DomainMatch | null
}

export async function brandRosterAccess(brandId: string): Promise<BrandRosterAccess> {
  const admin = createAdminClient()
  const { data: brand } = await admin
    .from('brands')
    .select('brand_status, website, contact_email, signup_origin_creator_id')
    .eq('id', brandId)
    .maybeSingle()

  // No row is an integrity problem rather than an approval one. Hold, because
  // the alternative is handing the roster to an account we cannot describe.
  if (!brand) {
    return { held: true, reason: 'Brand account not found.', originCreatorId: null, domain: null }
  }

  const originCreatorId = (brand.signup_origin_creator_id as string | null) ?? null

  // Approved is approved. The check exists to decide what happens BEFORE a
  // human has looked; once one has, it has no further say.
  if (brand.brand_status === 'approved') {
    return { held: false, reason: null, originCreatorId, domain: null }
  }

  const domain = brandDomainMatch(
    brand.website as string | null,
    brand.contact_email as string | null,
  )

  if (domain.match) {
    return { held: false, reason: null, originCreatorId, domain }
  }

  return {
    held: true,
    reason: domain.reason,
    originCreatorId,
    domain,
  }
}
