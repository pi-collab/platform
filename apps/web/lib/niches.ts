/** Single source of truth for creator niche categories. Import this everywhere. */
export const NICHES = [
  'Finance',
  'Fintech',
  'Crypto / Web3',
  'Tech / Gadgets',
  'Business / Startups',
  'Education',
  'Lifestyle',
  'Fitness',
  'Food',
  'Travel',
  'Fashion / Beauty',
  'Entertainment',
  'Other',
] as const

export type Niche = (typeof NICHES)[number]
