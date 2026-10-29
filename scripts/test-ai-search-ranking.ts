/**
 * AI creator search ranking (lib/ai-search/score.ts). Pure, no model call.
 *
 * Fixed 2026-10-29: a filter on a field fewer than 80% of creators had filled
 * in did not filter at all, so "beauty creators under 50k" returned every
 * creator, 500k fashion creators included. Now:
 *   - a creator whose field is FILLED and does not match is ruled out
 *   - a creator whose field is EMPTY is kept, after the matches, with the gap
 *   - a region ("metros", "south India") never rules a city out
 *   - past brands only ever boost
 * Then the same two queries brands ran on staging, against staging's live
 * creators, checked for no known mismatch in the results.
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-ai-search-ranking.ts
 */
import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { rankCandidates } from '../apps/web/lib/ai-search/score'
import { loadCandidates } from '../apps/web/lib/ai-search/candidates'
import { EMPTY_FILTERS, type SearchCandidate, type SearchFilters } from '../apps/web/lib/ai-search/types'

let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }

const base: SearchCandidate = {
  id: '', fullName: '', handle: null, photoUrl: null, slug: null, followers: null, followersVerified: false, followerBand: null,
  platforms: [], categories: [], location: null, bio: null, startingRatePaise: null, audience: null, pastBrands: [], completedDeals: 0,
}
const c = (id: string, x: Partial<SearchCandidate>): SearchCandidate => ({ ...base, id, fullName: id, ...x })
const f = (x: Partial<SearchFilters>): SearchFilters => ({ ...EMPTY_FILTERS, ...x, audience: { ...EMPTY_FILTERS.audience, ...(x.audience ?? {}) } })
const ids = (cs: SearchCandidate[], fl: SearchFilters) => rankCandidates(cs, fl).results.map(r => r.candidate.id)

async function main() {
  console.log('== niche + followers ("beauty creators under 50k")')
  const roster = [
    c('beauty-20k', { categories: ['Beauty & Skincare'], followers: 20_000 }),
    c('beauty-500k', { categories: ['Beauty & Skincare'], followers: 500_000 }),
    c('fashion-20k', { categories: ['Fashion & Style'], followers: 20_000 }),
    c('beauty-unknown', { categories: ['Beauty & Skincare'] }),
    c('blank', {}),
    c('beauty-55k', { categories: ['Beauty & Skincare'], followers: 55_000 }),
  ]
  const q1 = f({ niches: ['Beauty & Skincare'], followersMax: 50_000 })
  const r1 = ids(roster, q1)
  ok('a match comes first', r1[0] === 'beauty-20k', r1.join(', '))
  ok('a known 500k creator is ruled out of "under 50k"', !r1.includes('beauty-500k'))
  ok('a known fashion creator is ruled out of "beauty"', !r1.includes('fashion-20k'))
  ok('a near miss (55k) is kept', r1.includes('beauty-55k'))
  ok('no follower count on file: kept', r1.includes('beauty-unknown'))
  ok('nothing on file: kept, last', r1[r1.length - 1] === 'blank')
  const out1 = rankCandidates(roster, q1)
  ok('ruled-out count is told', out1.excludedCount === 2, String(out1.excludedCount))
  ok('the brand is told some creators have no follower count', out1.softened.some(s => s.label === 'Followers'))

  console.log('== location')
  const cities = [c('mumbai', { location: 'Mumbai, Maharashtra' }), c('pune', { location: 'Pune' }), c('nocity', {})]
  ok('"Mumbai" rules out a known Pune creator', !ids(cities, f({ locations: ['Mumbai'] })).includes('pune'))
  ok('"Mumbai" keeps a creator with no city', ids(cities, f({ locations: ['Mumbai'] })).includes('nocity'))
  ok('a region ("south India") rules no city out', ids(cities, f({ locations: ['south India'] })).length === 3)
  ok('"metros" rules no city out', ids(cities, f({ locations: ['metros'] })).length === 3)

  console.log('== platform, budget, audience, past brands')
  const plat = [c('ig', { platforms: ['instagram'] }), c('yt', { platforms: ['youtube'] }), c('none', {})]
  const rp = ids(plat, f({ platforms: ['youtube'] }))
  ok('YouTube rules out an Instagram-only creator, keeps one with none', !rp.includes('ig') && rp.includes('none') && rp[0] === 'yt')
  const price = [c('cheap', { startingRatePaise: 30_000_00 }), c('dear', { startingRatePaise: 90_000_00 }), c('noprice', {})]
  const rb = ids(price, f({ budgetRupees: 40_000 }))
  ok('budget rules out a published rate above it, keeps no rate', !rb.includes('dear') && rb.includes('noprice'))
  const aud = [
    c('women70', { audience: { topAgeBand: '25-34', womenPct: 70, topCities: [] } }),
    c('men70', { audience: { topAgeBand: '25-34', womenPct: 30, topCities: [] } }),
    c('genderonly', { audience: { topAgeBand: null, womenPct: 70, topCities: [] } }),
  ]
  const ra = ids(aud, f({ audience: { genderSkew: 'women', ageBands: [], cities: [] } }))
  ok('"audience mostly women" rules out a 70% men audience', !ra.includes('men70') && ra.includes('women70'))
  const rage = ids(aud, f({ audience: { genderSkew: null, ageBands: ['18-24'], cities: [] } }))
  ok('asking an age band does not rule out a creator with no age data', rage.includes('genderonly'))
  const pb = [c('fin', { pastBrands: ['Groww'] }), c('other', { pastBrands: ['Nykaa'] })]
  ok('past brands never rule anyone out', ids(pb, f({ pastBrandCategories: ['Groww'] })).length === 2)

  console.log('== staging, live creators')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('dswlplxyizvljzaihmjw')) { console.error('ABORT: not staging'); process.exit(1) }
  const live = await loadCandidates()
  ok('candidates loaded (bookable creators)', live.length > 0, `${live.length}`)
  for (const [label, fl] of [
    ['Find me 5 beauty creators under 50k', f({ niches: ['Beauty & Skincare'], followersMax: 50_000 })],
    ['beauty creators in Mumbai with followers more than 500k', f({ niches: ['Beauty & Skincare'], locations: ['Mumbai'], followersMin: 500_000 })],
  ] as const) {
    const out = rankCandidates(live, fl)
    const bad = out.results.filter(r => {
      const x = r.candidate
      if (x.categories.length && !x.categories.some(k => k.toLowerCase().includes('beauty'))) return true
      if (x.followers !== null && fl.followersMax !== null && x.followers > fl.followersMax * 1.25) return true
      if (x.followers !== null && fl.followersMin !== null && x.followers < fl.followersMin * 0.8) return true
      if (x.location && fl.locations.length && !/mumbai/i.test(x.location)) return true
      return false
    })
    ok(`"${label}": no known mismatch shown`, bad.length === 0, `${out.results.length} shown of ${live.length}, ${out.excludedCount} ruled out${bad.length ? '; wrong: ' + bad.map(b => b.candidate.fullName).join(', ') : ''}`)
  }

  console.log(`\n${failed ? `${failed} FAILED, ` : 'ALL '}${passed} passed`)
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
