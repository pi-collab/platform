import { z } from 'zod'
import type { BriefFilters } from '@/lib/ai/creator-search-types'

/**
 * Parameters for /{ig-user-id}/creator_marketplace_creators, validated against
 * Meta's documented allowed values BEFORE any call. Pure: built from Guapd's
 * own validated filters plus the brand's options, never from raw brief text
 * except the redacted `query` in direct mode.
 *
 * Not sent, ever: the full brief, a budget, dates or timeline, exclusions
 * (where competitor names live), and anything from the brand's account.
 */

export const META_INTERESTS = [
  'ANIMALS_AND_PETS', 'BOOKS_AND_LITERATURE', 'BUSINESS_FINANCE_AND_ECONOMICS', 'EDUCATION_AND_LEARNING', 'BEAUTY',
  'FASHION', 'FITNESS_AND_WORKOUTS', 'FOOD_AND_DRINK', 'GAMES_PUZZLES_AND_PLAY', 'HISTORY_AND_PHILOSOPHY',
  'HOLIDAYS_AND_CELEBRATIONS', 'HOME_AND_GARDEN', 'MUSIC_AND_AUDIO', 'PERFORMING_ARTS', 'SCIENCE_AND_TECH', 'SPORTS',
  'TV_AND_MOVIES', 'TRAVEL_AND_LEISURE_ACTIVITIES', 'VEHICLES_AND_TRANSPORTATION', 'VISUAL_ARTS_ARCHITECTURE_AND_CRAFTS',
] as const
export const MIN_FOLLOWERS = [0, 10000, 25000, 50000, 75000, 100000, 250000, 1000000] as const
export const MAX_FOLLOWERS = [10000, 25000, 50000, 75000, 100000, 250000, 1000000] as const
export const MIN_ENGAGED = [0, 2000, 10000, 50000, 100000] as const
export const MAX_ENGAGED = [2000, 10000, 50000, 100000] as const
export const POST_ACTIVITY = ['last_7_days', 'last_30_days', 'last_90_days'] as const
export const QUERY_MAX = 200
export const PAGE_LIMIT = 25

const oneOf = <T extends readonly number[]>(xs: T) => z.number().refine((n) => (xs as readonly number[]).includes(n), 'not an allowed value')
const ISO2 = z.string().regex(/^[A-Z]{2}$/)
const ISO_STATE = z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)
// Built with the constructor: the TS target predates the `u` flag in literals.
const QUERY_OK = new RegExp("^[\\p{L}\\p{M}\\p{N} &'.,-]+$", 'u')
const QUERY_STRIP = new RegExp("[^\\p{L}\\p{M}\\p{N} &'.,-]", 'gu')

export const MetaParamsSchema = z.object({
  creator_countries: z.array(ISO2).min(1).max(10).optional(),
  creator_states: z.array(ISO_STATE).max(10).optional(),
  creator_min_followers: oneOf(MIN_FOLLOWERS).optional(),
  creator_max_followers: oneOf(MAX_FOLLOWERS).optional(),
  creator_interests: z.array(z.enum(META_INTERESTS)).min(1).max(5).optional(),
  creator_language: z.array(z.string().regex(/^[a-z]{2}$/)).min(1).max(10).optional(),
  creator_min_engaged_accounts: oneOf(MIN_ENGAGED).optional(),
  creator_max_engaged_accounts: oneOf(MAX_ENGAGED).optional(),
  /** Documented only as a percentage; verify accepted values in Graph API Explorer. */
  reels_interaction_rate: z.number().min(0).max(100).optional(),
  creator_latest_post_activity: z.enum(POST_ACTIVITY).optional(),
  has_public_contact_email: z.boolean().optional(),
  exclude_messaged_creators: z.boolean().optional(),
  verified_account: z.boolean().optional(),
  query: z.string().min(1).max(QUERY_MAX).regex(QUERY_OK).optional(),
}).strict()
  .refine((p) => !p.creator_states || (p.creator_countries?.length === 1), 'creator_states needs exactly one country')
  .refine((p) => p.creator_min_followers === undefined || p.creator_max_followers === undefined || p.creator_min_followers < p.creator_max_followers, 'followers range')
  .refine((p) => p.creator_min_engaged_accounts === undefined || p.creator_max_engaged_accounts === undefined || p.creator_min_engaged_accounts < p.creator_max_engaged_accounts, 'engaged range')

export type MetaParams = z.infer<typeof MetaParamsSchema>

/** What a brand can switch on in the UI. Validated strictly by the route. */
export const MetaOptionsSchema = z.object({
  latestPostActivity: z.enum(POST_ACTIVITY).nullable(),
  hasPublicContactEmail: z.boolean(),
  excludeMessagedCreators: z.boolean(),
  verifiedAccount: z.boolean(),
  minEngagedAccounts: oneOf(MIN_ENGAGED).nullable(),
  maxEngagedAccounts: oneOf(MAX_ENGAGED).nullable(),
  reelsInteractionRate: z.number().min(0).max(100).nullable(),
}).strict()
export type MetaOptions = z.infer<typeof MetaOptionsSchema>
export const DEFAULT_META_OPTIONS: MetaOptions = {
  latestPostActivity: null, hasPublicContactEmail: false, excludeMessagedCreators: false, verifiedAccount: false,
  minEngagedAccounts: null, maxEngagedAccounts: null, reelsInteractionRate: null,
}

const NICHE_TO_INTERESTS: Record<string, (typeof META_INTERESTS)[number][]> = {
  'Anime, Comics & Geek Culture': ['TV_AND_MOVIES', 'GAMES_PUZZLES_AND_PLAY'],
  'Art, Crafts & Creative Design': ['VISUAL_ARTS_ARCHITECTURE_AND_CRAFTS'],
  'Automotive & Motorsports': ['VEHICLES_AND_TRANSPORTATION'],
  'Beauty & Skincare': ['BEAUTY'],
  'Business, SaaS & Entrepreneurship': ['BUSINESS_FINANCE_AND_ECONOMICS'],
  'Career & Education': ['EDUCATION_AND_LEARNING'],
  'Entertainment, Comedy & Pop Culture': ['TV_AND_MOVIES'],
  'Fashion & Apparel': ['FASHION'],
  'Finance, Crypto & Investing': ['BUSINESS_FINANCE_AND_ECONOMICS'],
  'Fitness, Sports & Bodybuilding': ['FITNESS_AND_WORKOUTS', 'SPORTS'],
  'Food, Beverage & Cooking': ['FOOD_AND_DRINK'],
  'Gaming & Esports': ['GAMES_PUZZLES_AND_PLAY'],
  'Home, Interior Design & DIY': ['HOME_AND_GARDEN'],
  'Music, Dance & Performing Arts': ['MUSIC_AND_AUDIO', 'PERFORMING_ARTS'],
  'Pets & Animal Care': ['ANIMALS_AND_PETS'],
  'Photography & Videography': ['VISUAL_ARTS_ARCHITECTURE_AND_CRAFTS'],
  'Real Estate & Property': ['HOME_AND_GARDEN'],
  'Sustainability, Eco & Gardening': ['HOME_AND_GARDEN'],
  'Technology, AI & Gadgets': ['SCIENCE_AND_TECH'],
  'Travel, Hospitality & Adventure': ['TRAVEL_AND_LEISURE_ACTIVITIES'],
}

/** ISO 639-1. Bhojpuri has no two-letter code, so it is not sent. */
const LANGUAGE_ISO: Record<string, string> = {
  English: 'en', Hindi: 'hi', Bengali: 'bn', Marathi: 'mr', Telugu: 'te', Tamil: 'ta', Gujarati: 'gu',
  Kannada: 'kn', Malayalam: 'ml', Punjabi: 'pa', Odia: 'or', Urdu: 'ur', Assamese: 'as',
}

/** ISO 3166-2:IN for the cities a brief most often names. Sent only when
 *  EVERY named city maps, so a search is never narrowed to part of what was
 *  asked. Telangana is IN-TG since 2023 (was IN-TS): verify in Explorer. */
const CITY_STATE: Record<string, string> = {
  mumbai: 'IN-MH', pune: 'IN-MH', nagpur: 'IN-MH', thane: 'IN-MH', delhi: 'IN-DL', 'new delhi': 'IN-DL',
  bengaluru: 'IN-KA', bangalore: 'IN-KA', mysuru: 'IN-KA', chennai: 'IN-TN', coimbatore: 'IN-TN', hyderabad: 'IN-TG',
  kolkata: 'IN-WB', ahmedabad: 'IN-GJ', surat: 'IN-GJ', vadodara: 'IN-GJ', jaipur: 'IN-RJ', lucknow: 'IN-UP', noida: 'IN-UP',
  gurugram: 'IN-HR', gurgaon: 'IN-HR', chandigarh: 'IN-CH', kochi: 'IN-KL', goa: 'IN-GA', indore: 'IN-MP', bhopal: 'IN-MP',
}

const snapDown = (v: number, allowed: readonly number[]) => [...allowed].reverse().find((a) => a <= v)
const snapUp = (v: number, allowed: readonly number[]) => allowed.find((a) => a >= v)

/** Money, dates and timeline words: a sentence carrying any is dropped from a
 *  direct query. */
const SENSITIVE = /₹|\brs\.?\b|\binr\b|rupee|lakh|crore|budget|\bfee\b|\bpay|price|cost|\d+\s*k\b|\d{3,}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\bq[1-4]\b|\b(week|month|day|deadline|launch|date|timeline|by)\b/i

/** Direct mode: the brief, trimmed and redacted. Sentences with money, dates,
 *  timing or an exclusion term (competitors) are dropped, characters
 *  outside the allowed set removed, cut to QUERY_MAX at a word boundary. */
export function directQuery(brief: string, f: BriefFilters): string | null {
  const exclusions = f.exclude.keywords.map((k) => k.toLowerCase())
  // A sentence naming an exclusion (where competitors live) is dropped whole,
  // so neither the name nor a dangling "worked with ." reaches Meta.
  const mentionsExclusion = (sentence: string) => exclusions.some((x) => sentence.toLowerCase().includes(x))
  let text = brief.split(/(?<=[.!?\n])\s+/).filter((s) => !SENSITIVE.test(s) && !mentionsExclusion(s)).join(' ')
  text = text.replace(QUERY_STRIP, ' ').replace(/\s+/g, ' ').trim()
  if (text.length > QUERY_MAX) text = text.slice(0, QUERY_MAX).replace(/\s+\S*$/, '')
  return text.length >= 3 ? text : null
}

/** Extracted mode: a short keyword phrase from what was read. Never the
 *  exclusions. */
export function extractedQuery(f: BriefFilters): string | null {
  const excluded = new Set(f.exclude.keywords)
  const terms = [...f.mustHave.keywords, f.context.productCategory, ...f.niceToHave.keywords, ...f.context.tone]
    .filter((t): t is string => !!t && !excluded.has(t))
  const phrase = Array.from(new Set(terms)).join(' ').replace(QUERY_STRIP, ' ').replace(/\s+/g, ' ').trim()
  const cut = phrase.length > 100 ? phrase.slice(0, 100).replace(/\s+\S*$/, '') : phrase
  return cut.length >= 3 ? cut : null
}

/** Guapd filters + brand options → Meta params, then the strict check. Null
 *  means the result did not validate and no call is made. */
export function buildMetaParams(f: BriefFilters, brief: string, mode: 'direct' | 'extracted', o: MetaOptions): MetaParams | null {
  const p: Record<string, unknown> = {}
  const country = f.hard.country && !/^(india|bharat)$/i.test(f.hard.country) ? null : 'IN'
  if (!country) return null // Guapd invites creators in India only
  p.creator_countries = [country]
  const states = f.hard.cities.map((c) => CITY_STATE[c.toLowerCase()])
  if (states.length && states.every(Boolean)) p.creator_states = Array.from(new Set(states))
  if (f.hard.followersMin !== null) { const v = snapDown(f.hard.followersMin, MIN_FOLLOWERS); if (v !== undefined && v > 0) p.creator_min_followers = v }
  if (f.hard.followersMax !== null) { const v = snapUp(f.hard.followersMax, MAX_FOLLOWERS); if (v !== undefined) p.creator_max_followers = v }
  const interests = Array.from(new Set([...f.mustHave.niches, ...f.niceToHave.niches].flatMap((n) => NICHE_TO_INTERESTS[n] ?? []))).slice(0, 5)
  if (interests.length) p.creator_interests = interests
  const langs = f.hard.languages.map((l) => LANGUAGE_ISO[l]).filter(Boolean)
  if (langs.length) p.creator_language = Array.from(new Set(langs))
  if (o.minEngagedAccounts !== null && o.minEngagedAccounts > 0) p.creator_min_engaged_accounts = o.minEngagedAccounts
  if (o.maxEngagedAccounts !== null) p.creator_max_engaged_accounts = o.maxEngagedAccounts
  if (o.reelsInteractionRate !== null) p.reels_interaction_rate = o.reelsInteractionRate
  if (o.latestPostActivity) p.creator_latest_post_activity = o.latestPostActivity
  if (o.hasPublicContactEmail) p.has_public_contact_email = true
  if (o.excludeMessagedCreators) p.exclude_messaged_creators = true
  if (o.verifiedAccount) p.verified_account = true
  const q = mode === 'direct' ? directQuery(brief, f) : extractedQuery(f)
  if (q) p.query = q
  const r = MetaParamsSchema.safeParse(p)
  return r.success ? r.data : null
}
