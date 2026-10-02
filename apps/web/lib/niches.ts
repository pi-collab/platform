/** Single source of truth for creator niche categories. Import this everywhere. */
export const NICHES = [
  'Anime, Comics & Geek Culture',
  'Art, Crafts & Creative Design',
  'Automotive & Motorsports',
  'Beauty & Skincare',
  'Business, SaaS & Entrepreneurship',
  'Career & Education',
  'Entertainment, Comedy & Pop Culture',
  'Family, Parenting & Kids',
  'Fashion & Apparel',
  'Finance, Crypto & Investing',
  'Fitness, Sports & Bodybuilding',
  'Food, Beverage & Cooking',
  'Gaming & Esports',
  'Home, Interior Design & DIY',
  'Lifestyle & Luxury',
  'Mental Health & Mindfulness',
  'Music, Dance & Performing Arts',
  'Pets & Animal Care',
  'Photography & Videography',
  'Real Estate & Property',
  'Sustainability, Eco & Gardening',
  'Technology, AI & Gadgets',
  'Travel, Hospitality & Adventure',
  'Other / Not Listed',
] as const

export type Niche = (typeof NICHES)[number]

/** The escape hatch. Pickers show it as "+ Other" and open a text box; what
 *  is typed is stored, not this label, so we learn what the list is missing. */
export const OTHER_NICHE: Niche = 'Other / Not Listed'

/**
 * Words and old values, mapped to the canonical niche above.
 *
 * Keys are lowercased and stripped of punctuation before lookup, so only real
 * synonyms need listing, not every capitalisation. The block of former
 * canonical values ('Finance / Investing', 'Tech / Gadgets'...) is the 12-niche
 * list this replaced (migration 0517); every row carrying one has to keep
 * resolving.
 *
 * Add to this rather than inventing a new canonical value: the list above is
 * what a brand filters by, and it stops being useful the moment it grows a tail
 * of near-duplicates.
 */
const NICHE_ALIASES: Record<string, Niche> = {
  // ── Former canonical values (the pre-0517 list) ──
  financeinvesting: 'Finance, Crypto & Investing', fintech: 'Finance, Crypto & Investing',
  cryptoweb3: 'Finance, Crypto & Investing', techgadgets: 'Technology, AI & Gadgets',
  businessstartups: 'Business, SaaS & Entrepreneurship', education: 'Career & Education',
  lifestyle: 'Lifestyle & Luxury', fitness: 'Fitness, Sports & Bodybuilding',
  food: 'Food, Beverage & Cooking', travel: 'Travel, Hospitality & Adventure',
  entertainment: 'Entertainment, Comedy & Pop Culture', other: 'Other / Not Listed',
  // 'Fashion / Beauty' is NOT here: it splits into two, see LEGACY_SPLITS.

  // Anime / geek
  anime: 'Anime, Comics & Geek Culture', manga: 'Anime, Comics & Geek Culture',
  comics: 'Anime, Comics & Geek Culture', cosplay: 'Anime, Comics & Geek Culture',
  geek: 'Anime, Comics & Geek Culture', otaku: 'Anime, Comics & Geek Culture',
  // Art
  art: 'Art, Crafts & Creative Design', crafts: 'Art, Crafts & Creative Design',
  craft: 'Art, Crafts & Creative Design', design: 'Art, Crafts & Creative Design',
  illustration: 'Art, Crafts & Creative Design', painting: 'Art, Crafts & Creative Design',
  // Automotive
  auto: 'Automotive & Motorsports', automotive: 'Automotive & Motorsports',
  cars: 'Automotive & Motorsports', bikes: 'Automotive & Motorsports',
  motorsports: 'Automotive & Motorsports', motorsport: 'Automotive & Motorsports',
  // Beauty
  beauty: 'Beauty & Skincare', makeup: 'Beauty & Skincare', skincare: 'Beauty & Skincare',
  cosmetics: 'Beauty & Skincare', grooming: 'Beauty & Skincare', hair: 'Beauty & Skincare',
  haircare: 'Beauty & Skincare',
  // Business
  business: 'Business, SaaS & Entrepreneurship', startup: 'Business, SaaS & Entrepreneurship',
  startups: 'Business, SaaS & Entrepreneurship', saas: 'Business, SaaS & Entrepreneurship',
  entrepreneurship: 'Business, SaaS & Entrepreneurship', marketing: 'Business, SaaS & Entrepreneurship',
  // Career & education
  career: 'Career & Education', careers: 'Career & Education', edtech: 'Career & Education',
  learning: 'Career & Education', study: 'Career & Education', exams: 'Career & Education',
  jobs: 'Career & Education',
  // Entertainment
  comedy: 'Entertainment, Comedy & Pop Culture', memes: 'Entertainment, Comedy & Pop Culture',
  film: 'Entertainment, Comedy & Pop Culture', movies: 'Entertainment, Comedy & Pop Culture',
  popculture: 'Entertainment, Comedy & Pop Culture', bollywood: 'Entertainment, Comedy & Pop Culture',
  // Family
  family: 'Family, Parenting & Kids', parenting: 'Family, Parenting & Kids',
  kids: 'Family, Parenting & Kids', mom: 'Family, Parenting & Kids', momlife: 'Family, Parenting & Kids',
  // Fashion
  fashion: 'Fashion & Apparel', apparel: 'Fashion & Apparel', style: 'Fashion & Apparel',
  clothing: 'Fashion & Apparel', streetwear: 'Fashion & Apparel',
  // Finance
  finance: 'Finance, Crypto & Investing', investing: 'Finance, Crypto & Investing',
  investment: 'Finance, Crypto & Investing', personalfinance: 'Finance, Crypto & Investing',
  stocks: 'Finance, Crypto & Investing', stockmarket: 'Finance, Crypto & Investing',
  trading: 'Finance, Crypto & Investing', mutualfunds: 'Finance, Crypto & Investing',
  money: 'Finance, Crypto & Investing', wealth: 'Finance, Crypto & Investing',
  insurance: 'Finance, Crypto & Investing', banking: 'Finance, Crypto & Investing',
  payments: 'Finance, Crypto & Investing', crypto: 'Finance, Crypto & Investing',
  cryptocurrency: 'Finance, Crypto & Investing', web3: 'Finance, Crypto & Investing',
  blockchain: 'Finance, Crypto & Investing', nft: 'Finance, Crypto & Investing',
  // Fitness
  gym: 'Fitness, Sports & Bodybuilding', sports: 'Fitness, Sports & Bodybuilding',
  bodybuilding: 'Fitness, Sports & Bodybuilding', workout: 'Fitness, Sports & Bodybuilding',
  yoga: 'Fitness, Sports & Bodybuilding', health: 'Fitness, Sports & Bodybuilding',
  nutrition: 'Fitness, Sports & Bodybuilding', cricket: 'Fitness, Sports & Bodybuilding',
  // Food
  cooking: 'Food, Beverage & Cooking', recipes: 'Food, Beverage & Cooking',
  foodie: 'Food, Beverage & Cooking', baking: 'Food, Beverage & Cooking',
  restaurants: 'Food, Beverage & Cooking', beverage: 'Food, Beverage & Cooking',
  drinks: 'Food, Beverage & Cooking',
  // Gaming
  gaming: 'Gaming & Esports', esports: 'Gaming & Esports', games: 'Gaming & Esports',
  // Home
  home: 'Home, Interior Design & DIY', interior: 'Home, Interior Design & DIY',
  interiordesign: 'Home, Interior Design & DIY', diy: 'Home, Interior Design & DIY',
  homedecor: 'Home, Interior Design & DIY', decor: 'Home, Interior Design & DIY',
  // Lifestyle
  liefestyle: 'Lifestyle & Luxury', lifestlye: 'Lifestyle & Luxury', luxury: 'Lifestyle & Luxury',
  vlog: 'Lifestyle & Luxury', vlogs: 'Lifestyle & Luxury', dailyvlogs: 'Lifestyle & Luxury',
  // Mental health
  mentalhealth: 'Mental Health & Mindfulness', mindfulness: 'Mental Health & Mindfulness',
  meditation: 'Mental Health & Mindfulness', wellness: 'Mental Health & Mindfulness',
  selfcare: 'Mental Health & Mindfulness', therapy: 'Mental Health & Mindfulness',
  // Music
  music: 'Music, Dance & Performing Arts', dance: 'Music, Dance & Performing Arts',
  singing: 'Music, Dance & Performing Arts', theatre: 'Music, Dance & Performing Arts',
  // Pets
  pets: 'Pets & Animal Care', pet: 'Pets & Animal Care', dogs: 'Pets & Animal Care',
  cats: 'Pets & Animal Care', animals: 'Pets & Animal Care',
  // Photography
  photography: 'Photography & Videography', videography: 'Photography & Videography',
  filmmaking: 'Photography & Videography',
  // Real estate
  realestate: 'Real Estate & Property', property: 'Real Estate & Property',
  // Sustainability
  sustainability: 'Sustainability, Eco & Gardening', eco: 'Sustainability, Eco & Gardening',
  gardening: 'Sustainability, Eco & Gardening', environment: 'Sustainability, Eco & Gardening',
  plants: 'Sustainability, Eco & Gardening',
  // Tech
  tech: 'Technology, AI & Gadgets', technology: 'Technology, AI & Gadgets',
  gadgets: 'Technology, AI & Gadgets', mobile: 'Technology, AI & Gadgets',
  ai: 'Technology, AI & Gadgets', software: 'Technology, AI & Gadgets',
  // Travel
  tourism: 'Travel, Hospitality & Adventure', adventure: 'Travel, Hospitality & Adventure',
  hospitality: 'Travel, Hospitality & Adventure', hotels: 'Travel, Hospitality & Adventure',
}

/**
 * Old values that became MORE THAN ONE niche. "Fashion / Beauty" was one bucket
 * and is now two; a creator in it is kept findable under both rather than
 * guessed into one. They can untick the one that does not apply.
 */
const LEGACY_SPLITS: Record<string, Niche[]> = {
  fashionbeauty: ['Fashion & Apparel', 'Beauty & Skincare'],
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
  return NICHE_ALIASES[key] ?? LEGACY_SPLITS[key]?.[0] ?? null
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
    const resolved = LEGACY_SPLITS[nicheKey(trimmed)] ?? [canonicalNiche(trimmed) ?? trimmed]
    for (const r of resolved) if (!out.includes(r)) out.push(r)
  }
  return out
}
