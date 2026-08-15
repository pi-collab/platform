import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Storefront attribution — which creator brought a brand to Guapd.
 *
 * Captured at the storefront visit, resolved onto the brand↔creator pair when
 * the brand is created at onboarding. Set once, never recomputed.
 *
 * ── COOKIE CLASSIFICATION: FUNCTIONAL, NOT ANALYTICS ─────────────────────────
 * This cookie is deliberately NOT gated by the analytics consent banner. It
 * carries no behavioural or profiling data — it records which link a user
 * arrived through so the resulting commercial relationship is attributed to the
 * right creator, which is a term of that relationship, not measurement.
 *
 * Gating it on analytics consent would mean a brand who declines analytics
 * silently strips their referring creator of attribution — a real financial
 * consequence for a third party who had no say in the choice. That is exactly
 * the case functional/necessary classification exists for.
 *
 * It stores a public storefront slug, no identifiers, and is httpOnly so page
 * scripts cannot read or forge it. Disclosed as functional in the privacy page.
 *
 * ── FIRST-TOUCH, NOT LAST-TOUCH ──────────────────────────────────────────────
 * If a brand browses Creator A's storefront, then Creator B's, then signs up,
 * A wins. The cookie is written only when absent, so the first storefront seen
 * is the one that persists.
 *
 * This is a deliberate choice, not a side effect of cookie mechanics:
 *   - The fee rule this feeds is "creator-brought = 0%". The creator who
 *     BROUGHT the brand is the one who introduced them, not whoever they
 *     happened to look at last.
 *   - Last-touch would let any creator capture someone else's referral simply
 *     by being viewed later, which is a perverse incentive to publish
 *     storefront links to traffic you did not earn.
 *   - It matches first-touch attribution already in the product (PostHog's
 *     $initial_utm_* person properties).
 */

/** Functional cookie. Name is stable — changing it orphans in-flight referrals. */
export const ORIGIN_COOKIE = 'guapd_ref_slug'

/** 30 days: long enough for a considered B2B signup, short enough to stay honest. */
export const ORIGIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/**
 * Resolve a stored slug and stamp the origin for a newly created brand.
 *
 * Writes BOTH facts:
 *   - brands.signup_origin_creator_id — brand-level ("who brought this brand")
 *   - brand_creator_origin            — pair-level ("how did this relationship start")
 *
 * Never throws: losing attribution must not fail a brand's onboarding.
 */
export async function captureSignupOrigin(brandId: string, slug: string | undefined): Promise<void> {
  if (!slug) return

  try {
    const admin = createAdminClient()

    const { data: storefront } = await admin
      .from('creator_storefronts')
      .select('creator_id')
      .ilike('slug', slug)
      .maybeSingle()

    if (!storefront?.creator_id) {
      console.warn(`[attribution] brand=${brandId} unresolvable storefront slug`)
      return
    }

    const creatorId = storefront.creator_id

    // Brand-level fact. Conditional on it being unset so a re-run cannot
    // overwrite an earlier signup origin.
    await admin
      .from('brands')
      .update({ signup_origin_creator_id: creatorId })
      .eq('id', brandId)
      .is('signup_origin_creator_id', null)

    // Pair-level fact. ON CONFLICT DO NOTHING is the set-once guarantee.
    await admin
      .from('brand_creator_origin')
      .upsert(
        {
          brand_id: brandId,
          creator_id: creatorId,
          origin: 'storefront',
          source_detail: { slug },
        },
        { onConflict: 'brand_id,creator_id', ignoreDuplicates: true },
      )

    await admin.from('events').insert({
      event_type: 'brand.origin_captured',
      detail: { brand_id: brandId, creator_id: creatorId, origin: 'storefront', slug },
    })
  } catch (err) {
    console.error(
      `[attribution] captureSignupOrigin failed brand=${brandId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

/**
 * Record a pair as Guapd-sourced when it has no origin yet.
 *
 * Called on deal creation. ignoreDuplicates means an existing storefront row
 * always wins — a pair that began through a creator's link is never rewritten
 * to 'guapd' just because a later deal came through browse.
 */
export async function ensurePairOrigin(brandId: string, creatorId: string, via: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('brand_creator_origin')
      .upsert(
        {
          brand_id: brandId,
          creator_id: creatorId,
          origin: 'guapd',
          source_detail: { via },
        },
        { onConflict: 'brand_id,creator_id', ignoreDuplicates: true },
      )
  } catch (err) {
    console.error(
      `[attribution] ensurePairOrigin failed brand=${brandId} creator=${creatorId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}
