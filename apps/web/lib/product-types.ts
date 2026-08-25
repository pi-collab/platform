/** Single source of truth for creator product types. Import this everywhere. */
export const PRODUCT_TYPES = [
  // ── Instagram ──
  'Instagram Reel',
  'Instagram Static/Carousel',
  'Instagram Story',
  // ── YouTube ──
  'YouTube Shorts',
  'YouTube Long form',
  'YouTube Integration',
  // ── Other platforms ──
  'TikTok Video',
  'X/Twitter Post',
  'X/Twitter Thread',
  'LinkedIn Post',
  'Newsletter Mention',
  'Podcast Read',
  'Blog Post',
  // ── Catch-all ──
  'Other / Custom',

  // ── Retired ─────────────────────────────────────────────────────────────
  // Not offered any more, but still stored against packages created before the
  // vocabulary changed. They stay in this list because savePackage validates
  // against it — drop them and editing an old package fails on a value the
  // creator never chose.
  //
  // The bare names below are the largest group: every package sold as "Reel",
  // "Story" or "Shorts" before the names carried their platform. A creator who
  // opens one of those still sees exactly what they set; only new packages get
  // the fuller name.
  'Reel',
  'Static/Carousel',
  'Story',
  'Shorts',
  'Long form',
  'Integration',
  'Sponsored Reel',
  'Sponsored Post',
  'Sponsored Story',
  'Story Series',
  'Carousel Post',
  'IG Live',
  'YouTube Dedicated Video',
  'YouTube Short',
  'Community Post',
  'Instagram Story Set',
  // Offered briefly, then withdrawn before anyone used it. Kept only so a
  // package created in that window would still validate.
  'Collab Reel',
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]

/**
 * Product types available per social platform.
 *
 * The platform is IN THE NAME rather than only in the column beside it. A rate
 * card that lists "Reel" and "Shorts" reads fine while it is grouped by
 * channel, and stops reading at all the moment those rows are flattened into
 * one list — which is what a brand sees on a phone, in an offer, and in the
 * deal it eventually signs. The name has to survive being taken out of its
 * group.
 */
export const PRODUCT_TYPES_BY_PLATFORM: Record<string, readonly ProductType[]> = {
  instagram: ['Instagram Reel', 'Instagram Static/Carousel', 'Instagram Story', 'Other / Custom'],
  youtube: ['YouTube Shorts', 'YouTube Long form', 'YouTube Integration', 'Other / Custom'],
  twitter: ['X/Twitter Post', 'X/Twitter Thread', 'Other / Custom'],
  linkedin: ['LinkedIn Post', 'Other / Custom'],
  other: PRODUCT_TYPES,
}
