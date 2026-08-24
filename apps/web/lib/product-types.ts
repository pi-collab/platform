/** Single source of truth for creator product types. Import this everywhere. */
export const PRODUCT_TYPES = [
  // ── Instagram ──
  'Collab Reel',
  'Reel',
  'Static/Carousel',
  'Story',
  // ── YouTube ──
  'Shorts',
  'Long form',
  'Integration',
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
  'Sponsored Reel',
  'Sponsored Post',
  'Sponsored Story',
  'Story Series',
  'Carousel Post',
  'IG Live',
  'YouTube Integration',
  'YouTube Dedicated Video',
  'YouTube Short',
  'Community Post',
  'Instagram Reel',
  'Instagram Story Set',
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]

/** Product types available per social platform. */
export const PRODUCT_TYPES_BY_PLATFORM: Record<string, readonly ProductType[]> = {
  instagram: ['Collab Reel', 'Reel', 'Static/Carousel', 'Story', 'Other / Custom'],
  youtube: ['Shorts', 'Long form', 'Integration', 'Other / Custom'],
  twitter: ['X/Twitter Post', 'X/Twitter Thread', 'Other / Custom'],
  linkedin: ['LinkedIn Post', 'Other / Custom'],
  other: PRODUCT_TYPES,
}
