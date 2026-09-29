/** Single source of truth for creator niche categories. Import this everywhere. */
export const NICHES = [
  'Finance / Investing',
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

/**
 * Aliases seen in the wild, mapped to the canonical niche above.
 *
 * The storefront editor accepted free text, so the same category arrived
 * spelled several ways — "Fashion", "fashion" and "beauty" are one bucket to a
 * brand, and "liefestyle" is a typo nobody should have to filter around. Keys
 * are lowercased and stripped of punctuation before lookup, so only real
 * synonyms need listing here, not every capitalisation.
 *
 * Add to this rather than inventing a new canonical value: the list above is
 * what a brand filters by, and it stops being useful the moment it grows a tail
 * of near-duplicates.
 */
const NICHE_ALIASES: Record<string, Niche> = {
  // Finance / Investing. `finance` is listed because it WAS the canonical
  // value: every row already carrying it has to keep resolving.
  finance: 'Finance / Investing', investing: 'Finance / Investing',
  investment: 'Finance / Investing', personalfinance: 'Finance / Investing',
  stocks: 'Finance / Investing', stockmarket: 'Finance / Investing',
  trading: 'Finance / Investing', mutualfunds: 'Finance / Investing',
  money: 'Finance / Investing', wealth: 'Finance / Investing',
  insurance: 'Finance / Investing',
  // Fintech
  fintech: 'Fintech', banking: 'Fintech', payments: 'Fintech',
  // Crypto
  crypto: 'Crypto / Web3', cryptocurrency: 'Crypto / Web3', web3: 'Crypto / Web3',
  blockchain: 'Crypto / Web3', nft: 'Crypto / Web3',
  // Tech
  tech: 'Tech / Gadgets', technology: 'Tech / Gadgets', gadgets: 'Tech / Gadgets',
  mobile: 'Tech / Gadgets', ai: 'Tech / Gadgets', software: 'Tech / Gadgets',
  // Business
  business: 'Business / Startups', startup: 'Business / Startups',
  startups: 'Business / Startups', entrepreneurship: 'Business / Startups',
  career: 'Business / Startups', marketing: 'Business / Startups',
  // Education
  education: 'Education', edtech: 'Education', learning: 'Education',
  study: 'Education', exams: 'Education',
  // Lifestyle
  lifestyle: 'Lifestyle', liefestyle: 'Lifestyle', lifestlye: 'Lifestyle',
  vlog: 'Lifestyle', vlogs: 'Lifestyle', dailyvlogs: 'Lifestyle', home: 'Lifestyle',
  parenting: 'Lifestyle', family: 'Lifestyle',
  // Fitness
  fitness: 'Fitness', gym: 'Fitness', health: 'Fitness', wellness: 'Fitness',
  yoga: 'Fitness', nutrition: 'Fitness', sports: 'Fitness',
  // Food
  food: 'Food', cooking: 'Food', recipes: 'Food', foodie: 'Food',
  baking: 'Food', restaurants: 'Food',
  // Travel
  travel: 'Travel', tourism: 'Travel', adventure: 'Travel',
  // Fashion / Beauty
  fashion: 'Fashion / Beauty', beauty: 'Fashion / Beauty', makeup: 'Fashion / Beauty',
  skincare: 'Fashion / Beauty', style: 'Fashion / Beauty', grooming: 'Fashion / Beauty',
  hair: 'Fashion / Beauty', cosmetics: 'Fashion / Beauty', luxury: 'Fashion / Beauty',
  // Entertainment
  entertainment: 'Entertainment', comedy: 'Entertainment', memes: 'Entertainment',
  music: 'Entertainment', film: 'Entertainment', movies: 'Entertainment',
  gaming: 'Entertainment', dance: 'Entertainment', art: 'Entertainment',
}

/** Lowercased, letters and digits only — "Personal Finance" → "personalfinance". */
function nicheKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * The canonical niche for a value a human typed, or null if we do not know it.
 *
 * Null rather than 'Other' on purpose: the caller decides. A migration should
 * LEAVE an unrecognised value alone — a creator's own description of their work
 * is not ours to throw away — while a form should offer Other and let them say
 * it themselves.
 */
export function canonicalNiche(raw: string | null | undefined): Niche | null {
  if (!raw) return null
  const key = nicheKey(raw)
  if (!key) return null

  // An exact canonical value, in any casing or spacing.
  for (const n of NICHES) {
    if (nicheKey(n) === key) return n
  }
  return NICHE_ALIASES[key] ?? null
}

/**
 * Clean a list of typed niches: canonicalise what we recognise, keep what we
 * do not, drop blanks and duplicates, preserve order.
 */
export function canonicalNiches(raw: (string | null | undefined)[]): string[] {
  const out: string[] = []
  for (const v of raw) {
    const trimmed = (v ?? '').trim()
    if (!trimmed) continue
    const resolved = canonicalNiche(trimmed) ?? trimmed
    if (!out.includes(resolved)) out.push(resolved)
  }
  return out
}
