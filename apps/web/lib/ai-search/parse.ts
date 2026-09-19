import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { AGE_BANDS, EMPTY_FILTERS, SEARCH_NICHES, type SearchFilters } from './types'

/**
 * Turn a brand's sentence into structured filters. The ONLY model call in this
 * feature.
 *
 * Ranking is deliberately not done here. A model asked to rank creators can
 * produce a confident order over numbers it half-remembers from the prompt, and
 * a reason sentence that reads well and is not true. Parsing is the part a
 * model is uniquely good at and cannot fabricate: the output is a fixed schema
 * of the brand's own words, and every figure in the result comes from the
 * database afterwards.
 *
 * Structured outputs rather than a prose reply: the schema is the contract, and
 * an unparseable answer is a failure we can see rather than a filter set with a
 * field quietly missing.
 */

const MODEL = 'claude-opus-5'

/** Mirrors SearchFilters. Kept beside it deliberately: this is the wire
 *  contract with the model, and a drift between the two is a silent filter. */
const FiltersSchema = z.object({
  niches: z.array(z.enum(SEARCH_NICHES as unknown as [string, ...string[]])),
  platforms: z.array(z.enum(['instagram', 'youtube'])),
  locations: z.array(z.string()),
  followersMin: z.number().nullable(),
  followersMax: z.number().nullable(),
  budgetRupees: z.number().nullable(),
  audience: z.object({
    ageBands: z.array(z.enum(AGE_BANDS as unknown as [string, ...string[]])),
    genderSkew: z.enum(['women', 'men']).nullable(),
    cities: z.array(z.string()),
  }),
  pastBrandCategories: z.array(z.string()),
  unusedTerms: z.array(z.string()),
})

const SYSTEM = `You turn a brand's plain-language request for influencer creators into structured search filters for an Indian creator marketplace.

Return ONLY what the brand actually asked for. An empty array or null means "not asked for", and that is the correct answer whenever a field was not mentioned. Never fill a field with a plausible guess: every filter you emit narrows or reorders real search results, so an invented one hides creators the brand never excluded.

Field rules:
- niches: only from the allowed list. Map the brand's words onto it ("finfluencer" and "personal finance" are Finance; "gym" and "workout" are Fitness; "makeup" and "skincare" are Fashion / Beauty). If nothing in the list fits, leave it empty and put the brand's word in unusedTerms.
- platforms: only if named or strongly implied ("reels" implies instagram, "shorts" or "videos on YouTube" implies youtube).
- locations: the place words as the brand wrote them ("Mumbai", "metros", "south India"). Do not expand a region into a list of cities.
- followersMin / followersMax: absolute numbers, not text. "50k+" is followersMin 50000 and followersMax null. "between 10k and 50k" sets both. "micro creators" is roughly followersMax 100000; "nano" is roughly followersMax 10000.
- budgetRupees: the amount the brand is willing to pay ONE creator, in rupees. "₹40k" is 40000. "budget of 2 lakh for the campaign" is a campaign total, not a per-creator rate: leave budgetRupees null and put the phrase in unusedTerms.
- audience: only when the brand asks about the creator's AUDIENCE rather than the creator themselves. "creators who are women" is not an audience filter; "audience is mostly women" is. Age bands must come from the allowed list, rounded to the nearest bands the brand's words cover.
- pastBrandCategories: the kind of brand a creator should have worked with before ("worked with fintech" gives ["fintech"]).
- unusedTerms: anything you understood as a requirement but could not express in the fields above. Subjective asks ("premium", "authentic", "good for a launch", "high engagement") belong here. This list is shown to the brand as "not used", so it must be honest and complete rather than empty.`

export interface ParseOutcome {
  filters: SearchFilters
  model: string
  inputTokens: number
  outputTokens: number
}

/** Whether the feature is switched on at all. Absent key = the search box is
 *  hidden and the manual filters carry on working. */
export function aiSearchConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export async function parseSearchQuery(query: string): Promise<ParseOutcome> {
  const client = new Anthropic()

  const response = await client.messages.parse({
    model: MODEL,
    // Small, fixed-shape output. The ceiling is a guard, not a target.
    max_tokens: 2000,
    // Low effort: this is a short extraction against a closed vocabulary, and
    // thinking harder about it buys nothing but latency the brand waits through.
    output_config: {
      effort: 'low',
      format: zodOutputFormat(FiltersSchema),
    },
    system: SYSTEM,
    messages: [{ role: 'user', content: query }],
  })

  const parsed = response.parsed_output
  if (!parsed) {
    // Schema-invalid output. Treated as a failure rather than salvaged: a
    // half-parsed filter set silently searches for something else.
    throw new Error('the model did not return a usable filter set')
  }

  return {
    // Spread over the empty shape so a field the model omits is the documented
    // "not asked for" rather than undefined reaching the ranker.
    filters: { ...EMPTY_FILTERS, ...parsed, audience: { ...EMPTY_FILTERS.audience, ...parsed.audience } } as SearchFilters,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}
