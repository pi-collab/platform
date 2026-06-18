/** Single source of truth for creator product types. Import this everywhere. */
export const PRODUCT_TYPES = [
  // Instagram
  'Sponsored Reel',
  'Sponsored Post',
  'Sponsored Story',
  'Story Series',
  'Carousel Post',
  'IG Live',
  // YouTube
  'YouTube Integration',
  'YouTube Dedicated Video',
  'YouTube Short',
  'Community Post',
  // Other platforms
  'TikTok Video',
  'X/Twitter Post',
  'X/Twitter Thread',
  'LinkedIn Post',
  'Newsletter Mention',
  'Podcast Read',
  'Blog Post',
  // Catch-all
  'Other / Custom',
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]

/** Product types available per social platform. */
export const PRODUCT_TYPES_BY_PLATFORM: Record<string, readonly ProductType[]> = {
  instagram: ['Sponsored Reel', 'Sponsored Post', 'Sponsored Story', 'Story Series', 'Carousel Post', 'IG Live', 'Other / Custom'],
  youtube: ['YouTube Integration', 'YouTube Dedicated Video', 'YouTube Short', 'Community Post', 'Other / Custom'],
  twitter: ['X/Twitter Post', 'X/Twitter Thread', 'Other / Custom'],
  linkedin: ['LinkedIn Post', 'Other / Custom'],
  other: PRODUCT_TYPES,
}
