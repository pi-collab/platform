import {
  type MatchStrength,
  type SearchCandidate,
  type SearchFilters,
  type SearchResult,
  type SkippedFilter,
} from './types'

/**
 * Rank creators against parsed filters. No model, no network, no randomness.
 *
 * ── Why the ranking is code and not a prompt ────────────────────────────────
 * Every number shown to a brand here was read from a row a moment earlier, and
 * every "why matched" line is assembled from those same values. A model asked
 * to rank and explain will write a fluent sentence about a follower count it
 * approximated from the prompt, which is precisely the thing this product sells
 * against. It is also free, instant and reproducible, which a re-rank is not.
 *
 * ── Hard filter or soft signal: decided by COVERAGE ─────────────────────────
 * Most fields are empty for most creators today: 17 of 118 vetted creators have
 * a city, 31 have a category, 1 has verified audience data. A hard filter on a
 * field that thin returns an empty page and reads as a broken feature, so a
 * filter only EXCLUDES when the field is present for most of the set; below
 * that it reorders instead, and the caller tells the brand it did.
 *
 * That threshold is the design's self-improving part: nothing needs rewriting
 * when creators fill their profiles in or connect Instagram. Location becomes a
 * real filter on the day enough creators have one.
 */

/** A filter may exclude only when this share of candidates has the field. */
const COVERAGE_FOR_HARD_FILTER = 0.8

/* Weights. Only the filters a brand actually asked for are counted, so a query
   naming one thing is not diluted by the eight it did not mention. */
const W = {
  niche: 40,
  followers: 25,
  budget: 20,
  audience: 15,
  location: 10,
  pastBrands: 10,
  /** Ready, and zero for everyone until deals complete. Deliberately left in:
   *  reliability then starts working without a code change. */
  reliability: 10,
  /** Small, and not a filter: a verified count is worth more than a typed one
   *  to a brand deciding, but it is not what they asked for. */
  verified: 5,
} as const

const fmtFollowers = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}k`
      : String(n)

const fmtRupees = (paise: number): string => {
  const rupees = Math.round(paise / 100)
  return rupees >= 100_000 ? `₹${(rupees / 100_000).toFixed(2).replace(/\.00$/, '')}L` : `₹${rupees.toLocaleString('en-IN')}`
}

const norm = (s: string): string => s.toLowerCase().trim()

/** Loose containment both ways, so "Mumbai" matches "Mumbai, Maharashtra" and
 *  "south india" matches "South India". Deliberately not fuzzy beyond that:
 *  a spelling-distance match here would quietly widen a brand's filter. */
const looseMatch = (needle: string, hay: string): boolean => {
  const n = norm(needle), h = norm(hay)
  return n.length > 0 && h.length > 0 && (h.includes(n) || n.includes(h))
}

const coverage = (candidates: SearchCandidate[], has: (c: SearchCandidate) => boolean): number =>
  candidates.length === 0 ? 0 : candidates.filter(has).length / candidates.length

export interface RankOutcome {
  results: SearchResult[]
  softened: SkippedFilter[]
  excludedCount: number
}

export function rankCandidates(
  candidates: SearchCandidate[],
  filters: SearchFilters,
  limit = 20,
): RankOutcome {
  const softened: SkippedFilter[] = []

  const wantsNiche = filters.niches.length > 0
  const wantsPlatform = filters.platforms.length > 0
  const wantsLocation = filters.locations.length > 0
  const wantsFollowers = filters.followersMin !== null || filters.followersMax !== null
  const wantsBudget = filters.budgetRupees !== null
  const wantsAudience =
    filters.audience.ageBands.length > 0 ||
    filters.audience.genderSkew !== null ||
    filters.audience.cities.length > 0
  const wantsPastBrands = filters.pastBrandCategories.length > 0

  const total = candidates.length
  const withFollowers = coverage(candidates, c => c.followers !== null)
  const withCategories = coverage(candidates, c => c.categories.length > 0)
  const withLocation = coverage(candidates, c => Boolean(c.location))
  const withAudience = coverage(candidates, c => c.audience !== null)
  const withPastBrands = coverage(candidates, c => c.pastBrands.length > 0)
  const withPlatforms = coverage(candidates, c => c.platforms.length > 0)

  const pct = (n: number) => `${Math.round(n * 100)}%`
  const countOf = (n: number) => Math.round(n * total)

  /** A filter excludes only where the field is mostly present. Otherwise it is
   *  recorded as softened, and the brand is told, in the same breath as the
   *  results rather than in a tooltip nobody opens. */
  function hard(wants: boolean, cov: number, label: string, field: string): boolean {
    if (!wants) return false
    if (cov >= COVERAGE_FOR_HARD_FILTER) return true
    softened.push({
      label,
      reason: `only ${countOf(cov)} of ${total} creators have ${field} on file (${pct(cov)}), so this ranked them instead of filtering them out`,
    })
    return false
  }

  const hardFollowers = hard(wantsFollowers, withFollowers, 'Followers', 'a follower count')
  const hardPlatform = hard(wantsPlatform, withPlatforms, 'Platform', 'a platform')
  const hardNiche = hard(wantsNiche, withCategories, 'Category', 'a category')
  const hardLocation = hard(wantsLocation, withLocation, 'Location', 'a city')
  const hardAudience = hard(wantsAudience, withAudience, 'Audience', 'verified audience data')
  const hardPastBrands = hard(wantsPastBrands, withPastBrands, 'Past brands', 'past brands')

  if (wantsBudget) {
    const withPrice = coverage(candidates, c => c.startingRatePaise !== null)
    if (withPrice < COVERAGE_FOR_HARD_FILTER) {
      softened.push({
        label: 'Budget',
        reason: `${countOf(withPrice)} of ${total} creators publish a starting rate (${pct(withPrice)}); anyone priced above your budget is excluded, the rest are ranked`,
      })
    }
  }

  let excludedCount = 0
  const results: SearchResult[] = []

  for (const c of candidates) {
    const reasons: string[] = []
    const gaps: string[] = []
    let earned = 0
    let applicable = 0
    let excluded = false

    /* ── Followers ── */
    if (wantsFollowers) {
      applicable += W.followers
      if (c.followers === null) {
        gaps.push('no follower count on file')
        if (hardFollowers) excluded = true
      } else {
        const min = filters.followersMin ?? 0
        const max = filters.followersMax ?? Number.MAX_SAFE_INTEGER
        const inside = c.followers >= min && c.followers <= max
        // A near miss is a near miss, not a mismatch: 48k against "50k+" is
        // worth showing below the matches rather than hiding.
        const near = !inside && c.followers >= min * 0.8 && c.followers <= max * 1.25
        if (inside) {
          earned += W.followers
          reasons.push(`${fmtFollowers(c.followers)} followers${c.followersVerified ? ', verified from Instagram' : ''}`)
        } else if (near) {
          earned += W.followers * 0.4
          reasons.push(`${fmtFollowers(c.followers)} followers, just outside your range`)
        } else if (hardFollowers) {
          excluded = true
        }
      }
    } else if (c.followers !== null) {
      reasons.push(`${fmtFollowers(c.followers)} followers${c.followersVerified ? ', verified' : ''}`)
    }

    /* ── Platform ── */
    if (wantsPlatform) {
      const hit = c.platforms.some(p => filters.platforms.includes(p))
      if (!hit && c.platforms.length > 0 && hardPlatform) excluded = true
      if (hit) reasons.push(c.platforms.filter(p => filters.platforms.includes(p)).join(' and '))
    }

    /* ── Niche ── */
    if (wantsNiche) {
      applicable += W.niche
      if (c.categories.length === 0) {
        gaps.push('no category on file')
        if (hardNiche) excluded = true
      } else {
        const hits = c.categories.filter(cat => filters.niches.some(n => looseMatch(n, cat)))
        if (hits.length > 0) {
          earned += W.niche
          reasons.push(hits.join(', '))
        } else if (hardNiche) {
          excluded = true
        }
      }
    }

    /* ── Budget. The one soft-data field that still EXCLUDES on a known value:
       a published rate above the stated budget is a fact, not a gap. ── */
    if (wantsBudget) {
      applicable += W.budget
      const budgetPaise = (filters.budgetRupees ?? 0) * 100
      if (c.startingRatePaise === null) {
        gaps.push('no published rate')
      } else if (c.startingRatePaise <= budgetPaise) {
        earned += W.budget
        reasons.push(`from ${fmtRupees(c.startingRatePaise)}, within your budget`)
      } else {
        excluded = true
        }
    } else if (c.startingRatePaise !== null) {
      reasons.push(`from ${fmtRupees(c.startingRatePaise)}`)
    }

    /* ── Location ── */
    if (wantsLocation) {
      applicable += W.location
      if (!c.location) {
        gaps.push('no city on file')
        if (hardLocation) excluded = true
      } else if (filters.locations.some(l => looseMatch(l, c.location as string))) {
        earned += W.location
        reasons.push(c.location)
      } else if (hardLocation) {
        excluded = true
      }
    }

    /* ── Audience, only ever from a connected account's snapshot ── */
    if (wantsAudience) {
      applicable += W.audience
      if (!c.audience) {
        gaps.push('no verified audience data')
        if (hardAudience) excluded = true
      } else {
        let hit = false
        const { genderSkew, ageBands, cities } = filters.audience
        if (genderSkew && c.audience.womenPct !== null) {
          const pctWanted = genderSkew === 'women' ? c.audience.womenPct : 100 - c.audience.womenPct
          if (pctWanted >= 55) {
            hit = true
            reasons.push(`${Math.round(pctWanted)}% ${genderSkew}`)
          }
        }
        if (ageBands.length > 0 && c.audience.topAgeBand && ageBands.includes(c.audience.topAgeBand)) {
          hit = true
          reasons.push(`mostly ${c.audience.topAgeBand}`)
        }
        if (cities.length > 0 && c.audience.topCities.length > 0) {
          const cityHit = c.audience.topCities.filter(city => cities.some(w => looseMatch(w, city)))
          if (cityHit.length > 0) {
            hit = true
            reasons.push(`audience in ${cityHit.join(', ')}`)
          }
        }
        if (hit) earned += W.audience
        else if (hardAudience) excluded = true
      }
    }

    /* ── Past brands ── */
    if (wantsPastBrands) {
      applicable += W.pastBrands
      if (c.pastBrands.length === 0) {
        gaps.push('no past brands on file')
        if (hardPastBrands) excluded = true
      } else {
        const hits = c.pastBrands.filter(b => filters.pastBrandCategories.some(w => looseMatch(w, b)))
        if (hits.length > 0) {
          earned += W.pastBrands
          reasons.push(`worked with ${hits.slice(0, 2).join(', ')}`)
        }
      }
    }

    /* ── Always-on signals. Not filters: they break ties between creators who
       answer the query equally well on what was asked. ── */
    applicable += W.verified
    if (c.followersVerified) earned += W.verified

    if (c.completedDeals > 0) {
      applicable += W.reliability
      earned += W.reliability
      reasons.push(`${c.completedDeals} completed deal${c.completedDeals === 1 ? '' : 's'} on Guapd`)
    }

    if (excluded) {
      excludedCount += 1
      continue
    }

    const ratio = applicable === 0 ? 0 : earned / applicable
    const strength: MatchStrength = ratio >= 0.75 ? 'strong' : ratio >= 0.4 ? 'good' : 'possible'

    results.push({
      candidate: c,
      score: Math.round(ratio * 100),
      strength,
      reasons,
      gaps,
    })
  }

  results.sort((a, b) =>
    b.score - a.score ||
    (b.candidate.followers ?? 0) - (a.candidate.followers ?? 0) ||
    a.candidate.fullName.localeCompare(b.candidate.fullName),
  )

  return { results: results.slice(0, limit), softened, excludedCount }
}
