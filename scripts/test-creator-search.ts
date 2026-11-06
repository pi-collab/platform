/**
 * Guapd AI creator search (0585, lib/ai/*, /api/creators/search).
 *
 *   1. validateFilters: the one gate every filter set passes. Rejects unknown
 *      keys, markup or SQL-ish characters, wrong types, reversed ranges.
 *   2. rankCreators: pure. No padding, known mismatch excludes, a blank is
 *      kept with its gap, engagement needs a verified figure, verified and
 *      self-reported never mixed, reasons built from stored facts, cap.
 *   3. STAGING, live: creator_search_pool returns exactly /browse's creators
 *      minus hidden ones, no contact fields; anon cannot run it or read the
 *      new tables; "Your visibility" counts cannot be inflated by one brand.
 *   4. The brief parser against injection, only if ANTHROPIC_API_KEY is set.
 *
 * Run from the repo root:
 *   NODE_OPTIONS=--conditions=react-server NODE_PATH=apps/web/node_modules ./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json scripts/test-creator-search.ts
 */
import * as fs from 'fs'
import * as path from 'path'
for (const line of fs.readFileSync(path.resolve(__dirname, '../apps/web/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { createClient } from '@supabase/supabase-js'
import { EMPTY_BRIEF_FILTERS, MAX_BRIEF, RESULT_CAP, validateFilters, type BriefFilters } from '../apps/web/lib/ai/creator-search-types'
import { engagementPct, rankCreators, suggestLoosen, type PoolCreator } from '../apps/web/lib/ai/rank-creators'
import { applyEdit, chipsFor, withoutFilter } from '../apps/web/lib/ai/filter-chips'

let passed = 0, failed = 0
const ok = (n: string, c: boolean, d = '') => { c ? passed++ : failed++; console.log(`  ${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`) }

const base: PoolCreator = {
  id: '', fullName: '', handle: null, photoUrl: null, hasStorefront: false, bio: null, niches: [], city: null, state: null,
  languages: [], pastBrands: [], deliverableTypes: [],
  typedFollowers: null, followerBand: null, verified: false, verifiedFollowers: null, igMedia: [], igSyncedAt: null,
  startingRatePaise: null, completedDeals: 0, onTimeMeasured: 0, onTime: 0, offersReceived: 0, offersResponded: 0,
}
const c = (id: string, x: Partial<PoolCreator>): PoolCreator => ({ ...base, id, fullName: id, ...x })
type Partial2 = { hard?: Partial<BriefFilters['hard']>; mustHave?: Partial<BriefFilters['mustHave']>; niceToHave?: Partial<BriefFilters['niceToHave']>; exclude?: Partial<BriefFilters['exclude']>; context?: Partial<BriefFilters['context']>; summary?: string; question?: string | null; unused?: string[] }
const E = EMPTY_BRIEF_FILTERS
const f = (x: Partial2): BriefFilters => ({
  ...E, ...x,
  hard: { ...E.hard, ...(x.hard ?? {}) }, mustHave: { ...E.mustHave, ...(x.mustHave ?? {}) },
  niceToHave: { ...E.niceToHave, ...(x.niceToHave ?? {}) }, exclude: { ...E.exclude, ...(x.exclude ?? {}) },
  context: { ...E.context, ...(x.context ?? {}) },
} as BriefFilters)
const ids = (pool: PoolCreator[], fl: BriefFilters) => rankCreators(pool, fl).results.map((r) => r.id)
const media = (n: number, likes: number, comments: number) => Array.from({ length: n }, () => ({ likes, comments }))
const SYNCED = new Date().toISOString()
const HOME = 'Home, Interior Design & DIY'

async function main() {
  console.log('== 1. validateFilters')
  ok('accepts a normal filter set', validateFilters(f({ mustHave: { niches: [HOME], keywords: ['home fragrance'] }, hard: { cities: ['Mumbai'], followersMin: 10000 } })) !== null)
  ok('rejects an unknown top-level key', validateFilters({ ...f({}), sql: 'x' }) === null)
  ok('rejects an unknown nested key (hard.phone)', validateFilters({ ...f({}), hard: { ...E.hard, phone: true } }) === null)
  ok('rejects a missing group', validateFilters({ ...f({}), exclude: undefined }) === null)
  ok('rejects markup in a keyword', validateFilters(f({ mustHave: { keywords: ['<script>alert(1)</script>'] } })) === null)
  ok('rejects SQL-ish text in a city', validateFilters(f({ hard: { cities: ["Mumbai'); drop table creators;--"] } })) === null)
  ok('rejects braces or quotes in the summary', validateFilters(f({ summary: 'Read as {"hard":1}' })) === null)
  ok('rejects a summary over 300 characters', validateFilters(f({ summary: 'a'.repeat(301) })) === null)
  ok('rejects a niche off the list', validateFilters(f({ mustHave: { niches: ['Astrology'] as never } })) === null)
  ok('rejects a language off the list', validateFilters(f({ hard: { languages: ['Klingon'] as never } })) === null)
  ok('rejects a deliverable off the list', validateFilters(f({ context: { deliverables: ['podcast'] as never } })) === null)
  ok('rejects a reversed follower range', validateFilters(f({ hard: { followersMin: 50000, followersMax: 1000 } })) === null)
  ok('rejects a negative follower count', validateFilters(f({ hard: { followersMin: -1 } })) === null)
  ok('rejects engagement over 100%', validateFilters(f({ hard: { minEngagementPct: 400 } })) === null)
  ok('rejects a string where a number belongs', validateFilters({ ...f({}), hard: { ...E.hard, followersMin: '10000' } }) === null)
  ok('rejects too many must-have keywords', validateFilters(f({ mustHave: { keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) } })) === null)
  ok('rejects a term that is both a must-have and an exclusion', validateFilters(f({ mustHave: { keywords: ['candles'] }, exclude: { keywords: ['candles'] } })) === null)
  ok('accepts Hindi letters with vowel signs', validateFilters(f({ niceToHave: { keywords: ['हिन्दी'] } })) !== null)
  ok('accepts a plain question', validateFilters(f({ question: 'I could not tell the city. Add one or remove it.' })) !== null)
  ok(`brief limit is ${MAX_BRIEF}`, MAX_BRIEF === 6000)

  console.log('\n== 2. rankCreators')
  const home = c('home', { niches: [HOME], bio: 'Styling small homes, candles and home fragrance reels. Warm minimal aesthetic.', city: 'Mumbai', languages: ['Hindi', 'English'], deliverableTypes: ['Instagram Reel'], verified: true, verifiedFollowers: 40000, igSyncedAt: SYNCED, igMedia: media(10, 1500, 100), completedDeals: 6, onTimeMeasured: 6, onTime: 5, offersReceived: 10, offersResponded: 9 })
  const decor = c('decor', { niches: ['home decor'], bio: 'Interiors on a budget', typedFollowers: 12000 })
  const fashion = c('fashion', { niches: ['Fashion & Apparel'], bio: 'Street style', city: 'Delhi', typedFollowers: 500000, languages: ['Punjabi'] })
  const rival = c('rival', { niches: [HOME], bio: 'Home fragrance and candles', pastBrands: ['BrandX Candles'] })
  const blank = c('blank', {})
  const pool = [fashion, blank, decor, home, rival]
  const homeF = f({ mustHave: { niches: [HOME], keywords: ['home fragrance'] } })

  const r1 = ids(pool, homeF)
  ok('must-haves gate: only matching creators', r1.includes('home') && r1.includes('decor') && !r1.includes('fashion') && !r1.includes('blank'), r1.join(','))
  ok('exclusions remove a creator who worked with a competitor', !ids(pool, f({ mustHave: { niches: [HOME] }, exclude: { keywords: ['brandx'] } })).includes('rival'))
  ok('excluding a niche removes creators in it', !ids(pool, f({ mustHave: { keywords: ['street style'] }, exclude: { niches: ['Fashion & Apparel'] } })).includes('fashion'))
  ok('excluding a subject removes creators who mention it', !ids(pool, f({ mustHave: { niches: [HOME] }, exclude: { keywords: ['candles'] } })).includes('home'))
  const nice = rankCreators(pool, f({ mustHave: { niches: [HOME] }, niceToHave: { keywords: ['candles'] }, context: { tone: ['minimal'], deliverables: ['reels'] } })).results
  ok('nice-to-haves, tone and deliverables add to the score', nice[0].id === 'home', nice.map((r) => r.id).join(','))
  const top = nice[0]
  ok('reason uses the brief\'s words', top.reason === 'matches: home; also: candles; tone: minimal; sells reels; verified 40k followers', top.reason)
  ok('reason never shows what /browse does not (engagement, deals, on time, replies, city, languages)', !/engagement|deals? completed|on time|replied|\bin mumbai\b|makes content in/i.test(rankCreators(pool, f({ mustHave: { niches: [HOME] }, hard: { cities: ['mumbai'], languages: ['Hindi'] } })).results.map((r) => r.reason).join(' | ')))
  ok('cards carry no city or engagement field', !('city' in top) && !('engagementPct' in (top.verified ?? {})))
  ok('nice-to-haves alone never pad: a creator matching nothing is out', !ids(pool, f({ niceToHave: { keywords: ['candles'] } })).includes('fashion'))
  ok('only hard filters: everyone who fits them', ids([fashion, decor], f({ hard: { followersMax: 100000 } })).join() === 'decor')
  ok('engagement = avg(likes+comments) / followers', engagementPct(home) === 4)
  ok('verified creator: verified figures, no self-reported field', top.verified?.followers === 40000 && top.selfReported === null)
  const dec = rankCreators(pool, homeF).results.find((r) => r.id === 'decor')!
  ok('unverified creator: self-reported only, no verified claim in the reason', dec.verified === null && dec.selfReported?.followers === 12000 && !dec.reason.includes('verified'), dec.reason)
  ok('a known language that does not match excludes', !ids([fashion], f({ mustHave: { keywords: ['street style'] }, hard: { languages: ['Hindi'] } })).includes('fashion'))
  const langKept = rankCreators([decor], f({ mustHave: { keywords: ['interiors'] }, hard: { languages: ['Hindi'] } })).results
  ok('no languages on file is kept, with the gap named', langKept.length === 1 && langKept[0].gaps.includes('languages not on file'))
  ok('a known city that does not match excludes', !ids([fashion], f({ mustHave: { keywords: ['street style'] }, hard: { cities: ['mumbai'] } })).includes('fashion'))
  ok('a region does not rule a city out', ids([fashion], f({ mustHave: { keywords: ['street style'] }, hard: { cities: ['north india'] } })).includes('fashion'))
  ok('a known rate over budget excludes', ids([c('pricey', { niches: [HOME], startingRatePaise: 9_000_000 })], f({ mustHave: { niches: [HOME] }, hard: { budgetMaxRupees: 50000 } })).length === 0)
  const er = rankCreators(pool, f({ mustHave: { niches: [HOME] }, hard: { minEngagementPct: 3 } }))
  ok('min engagement: only verified creators can meet it; the rest counted', er.results.map((r) => r.id).join() === 'home' && er.hiddenUnverified === 2, `hidden ${er.hiddenUnverified}`)
  ok('a country outside India returns nobody', rankCreators(pool, f({ hard: { country: 'usa' } })).outsideIndia)
  ok('handles are shown without a stored @', rankCreators([c('at', { niches: [HOME], handle: '@@someone' })], f({ mustHave: { niches: [HOME] } })).results[0].handle === 'someone')
  ok('results never carry past brands', !JSON.stringify(rankCreators(pool, f({ mustHave: { niches: [HOME] } }))).includes('BrandX'))
  const many = Array.from({ length: 30 }, (_, i) => c(`m${i}`, { niches: ['Fashion & Apparel'] }))
  ok(`results are capped at ${RESULT_CAP}`, rankCreators(many, f({ mustHave: { niches: ['Fashion & Apparel'] } })).results.length === RESULT_CAP)
  const hint = suggestLoosen(pool, f({ mustHave: { niches: [HOME] }, hard: { cities: ['pune'] } }), 2)
  ok('suggests the filter whose removal shows more', hint?.key === 'hard:city:pune', JSON.stringify(hint))
  ok('never suggests dropping the last must-have', suggestLoosen(pool, f({ mustHave: { niches: [HOME] } }), 0)?.key !== `must:niche:${HOME}`)
  ok('same input, same order (deterministic)', ids(pool, homeF).join() === ids([...pool].reverse(), homeF).join())

  console.log('\n== 2a. paging order and restricted mode')
  const big = Array.from({ length: 57 }, (_, i) => c(`p${String(i).padStart(2, '0')}`, { niches: ['Fashion & Apparel'], verified: i % 3 === 0, verifiedFollowers: i % 3 === 0 ? 1000 : null, igSyncedAt: i % 3 === 0 ? SYNCED : null, completedDeals: i % 4 }))
  const fullOrder = rankCreators(big, f({ mustHave: { niches: ['Fashion & Apparel'] } }), Infinity).results.map((r) => r.id)
  const pages = [0, 20, 40].map((o) => fullOrder.slice(o, o + 20))
  ok('pages of the stored order cover every match once', pages.flat().length === 57 && new Set(pages.flat()).size === 57)
  ok('the order is total and repeatable (ties broken by id)', JSON.stringify(fullOrder) === JSON.stringify(rankCreators([...big].reverse(), f({ mustHave: { niches: ['Fashion & Apparel'] } }), Infinity).results.map((r) => r.id)))
  const mumbai = c('mumbai', { niches: ['Fashion & Apparel'], city: 'Mumbai', languages: ['Hindi'] })
  const delhi = c('delhi', { niches: ['Fashion & Apparel'], city: 'Delhi', languages: ['Punjabi'], completedDeals: 9, onTimeMeasured: 9, onTime: 9 })
  const rf = f({ mustHave: { niches: ['Fashion & Apparel'] }, hard: { cities: ['mumbai'], languages: ['Hindi'], minEngagementPct: 5 } })
  ok('approved: city, language and engagement filters apply', ids([mumbai, delhi], rf).length === 0)
  ok('restricted: they do not, so they reveal nothing', rankCreators([mumbai, delhi], rf, 20, { restricted: true }).results.length === 2)
  const ro = rankCreators([delhi, mumbai], f({ mustHave: { niches: ['Fashion & Apparel'] } }), 20, { restricted: true }).results.map((r) => r.id)
  ok('restricted: Guapd history does not change the order', JSON.stringify(ro) === '["delhi","mumbai"]', ro.join(','))

  console.log('\n== 2b. chips')
  const cf = f({ hard: { cities: ['mumbai'], followersMin: 10000, followersMax: 100000, languages: ['Hindi'] }, mustHave: { niches: [HOME], keywords: ['candles'] }, niceToHave: { keywords: ['travel'] }, exclude: { keywords: ['alcohol'] } })
  const groups = chipsFor(cf).map((x) => x.group)
  ok('four chip groups', ['hard', 'must', 'nice', 'exclude'].every((g) => groups.includes(g as never)), groups.join(','))
  ok('removing a chip removes only that item', JSON.stringify(withoutFilter(cf, 'exclude:keyword:alcohol').exclude.keywords) === '[]' && withoutFilter(cf, 'exclude:keyword:alcohol').mustHave.keywords.length === 1)
  const edited = applyEdit(cf, 'hard:followers', '50k+')
  ok('editing followers reads 50k+', edited?.hard.followersMin === 50000 && edited.hard.followersMax === null)
  ok('editing budget reads under 1L', applyEdit(cf, 'hard:budget', 'under 1L')?.hard.budgetMaxRupees === 100000)
  ok('an unreadable edit is refused', applyEdit(cf, 'hard:followers', 'lots') === null)
  ok('an edited chip still passes the strict check', validateFilters(applyEdit(cf, 'must:keyword:candles', 'home fragrance')) !== null)

  console.log('\n== 2c. wording')
  const { CARD_NOT_VERIFIED, CARD_SELF_REPORTED, BRANDS_SEE, BRANDS_NEVER_SEE, SWITCH_OFF_CONFIRM, SEARCH_SWITCH } = await import('../apps/web/lib/ai/search-visibility-copy')
  const drafts = fs.readFileSync(path.resolve(__dirname, '../docs/whatsapp-templates-draft.md'), 'utf8')
  const reconnect = drafts.slice(drafts.indexOf('## 2. `instagram_reconnect_verified`'), drafts.indexOf('## In-app copy'))
  ok('reconnect message quotes the card\'s exact labels', reconnect.includes(`"${CARD_NOT_VERIFIED}"`) && reconnect.includes(`"${CARD_SELF_REPORTED}"`))
  const card = fs.readFileSync(path.resolve(__dirname, '../apps/web/app/ai/GuapdAiClient.tsx'), 'utf8')
  ok('the card renders those same labels', card.includes('{CARD_NOT_VERIFIED}') && card.includes('${CARD_SELF_REPORTED}'))
  ok('the copy names phone and email as never shown', BRANDS_NEVER_SEE.includes('phone') && BRANDS_NEVER_SEE.includes('email') && !/phone|email/.test(BRANDS_SEE))
  ok('switch-off warning says what stays (Browse, profile, current deals)', /Browse/.test(SWITCH_OFF_CONFIRM.body) && /profile/.test(SWITCH_OFF_CONFIRM.body) && /current deals carry on/.test(SWITCH_OFF_CONFIRM.body))
  ok('switch-off warning does not overclaim', !/won't get (any )?(deals|offers)|far fewer|no offers/i.test(SWITCH_OFF_CONFIRM.body + SEARCH_SWITCH.hint))
  ok('Keep me visible / Turn off', SWITCH_OFF_CONFIRM.keep === 'Keep me visible' && SWITCH_OFF_CONFIRM.off === 'Turn off')

  console.log('\n== 2d. WhatsApp product-updates consent is not used to send anything')
  const { execSync } = await import('child_process')
  const readers = execSync(`grep -rln "whatsapp_updates_consent_at" ${path.resolve(__dirname, '../apps/web')} --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next || true`).toString().trim().split('\n').filter(Boolean).map((f) => path.relative(path.resolve(__dirname, '..'), f)).sort()
  ok('only the consent helper and creator Settings touch the consent field', JSON.stringify(readers) === JSON.stringify(['apps/web/app/creator/settings/page.tsx', 'apps/web/lib/creator-consent.ts']), readers.join(', '))
  const form = fs.readFileSync(path.resolve(__dirname, '../apps/web/app/signup/creator/onboarding/CreatorProfileForm.tsx'), 'utf8')
  ok('signup checkbox starts unticked and is not required', /const \[waUpdates, setWaUpdates\] = useState\(false\)/.test(form) && !/checked=\{waUpdates\}[^>]*required/.test(form))

  console.log('\n== 3. staging, live')
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  if (!URL.includes('dswlplxyizvljzaihmjw')) throw new Error('not staging')
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })

  const livePool = async () => {
    const r = await admin.rpc('creator_search_pool', { p_followers_min: null, p_followers_max: null, p_budget_max_paise: null })
    return { ids: new Set((r.data ?? []).map((x: { creator_id: string }) => x.creator_id)), rows: r.data ?? [], error: r.error }
  }
  // /browse's rule, as app/browse/page.tsx queries it.
  const { data: browse } = await admin.from('creators').select('id, search_hidden_at').eq('is_bookable', true).eq('is_guapd', false)
  const browseVisible = (browse ?? []).filter((c) => !c.search_hidden_at).map((c) => c.id).sort()
  const p0 = await livePool()
  ok('search covers exactly the creators /browse shows, minus hidden ones', JSON.stringify(Array.from(p0.ids).sort()) === JSON.stringify(browseVisible), `${p0.ids.size} vs ${browseVisible.length}`)
  const cols = Object.keys(p0.rows[0] ?? {})
  ok('the pool carries no phone, email, rate card, UPI, token or snapshot', cols.length > 0 && !cols.some((k) => /phone|email|rate_card|upi|token|snapshot/.test(k)), cols.join(','))
  const { data: house } = await admin.from('creators').select('id').eq('is_guapd', true)
  ok('the Guapd house account is never in the pool', !(house ?? []).some((h) => p0.ids.has(h.id)))
  const { data: notBookable } = await admin.from('creators').select('id').eq('is_bookable', false).limit(50)
  ok('creators /browse does not show (not bookable) are never in the pool', !(notBookable ?? []).some((c) => p0.ids.has(c.id)))

  const target = browseVisible[0]
  try {
    await admin.from('creators').update({ search_hidden_at: new Date().toISOString() }).eq('id', target)
    ok('a creator who switched "Show me in Guapd AI search" off is not in the pool', !(await livePool()).ids.has(target))
    await admin.from('creators').update({ search_hidden_at: null }).eq('id', target)
    ok('switching it back on returns them', (await livePool()).ids.has(target))
  } finally {
    await admin.from('creators').update({ search_hidden_at: null }).eq('id', target)
  }

  const a1 = await anon.rpc('creator_search_pool', { p_followers_min: null, p_followers_max: null, p_budget_max_paise: null })
  ok('anon cannot run creator_search_pool', !!a1.error, a1.error?.message)
  const a2 = await anon.from('brand_creator_searches').select('id').limit(1)
  ok('anon cannot read brand_creator_searches', !!a2.error, a2.error?.message)
  const a3 = await anon.rpc('creator_search_visibility', { p_creator_id: target })
  ok('anon cannot run creator_search_visibility', !!a3.error, a3.error?.message)

  {
    const { data: bm } = await admin.from('brand_members').select('users(auth_id), brands!inner(is_guapd)').eq('brands.is_guapd', false).limit(1).single()
    const email = (await admin.auth.admin.getUserById((bm as any).users.auth_id)).data.user?.email
    const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: email! })
    const sess = await (await fetch(`${URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: link!.properties!.hashed_token }) })).json()
    const brand = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${sess.access_token}` } }, auth: { persistSession: false } })
    ok('a signed-in brand cannot run creator_search_pool', !!(await brand.rpc('creator_search_pool', { p_followers_min: null, p_followers_max: null, p_budget_max_paise: null })).error)
    ok('a signed-in brand cannot run creator_search_visibility', !!(await brand.rpc('creator_search_visibility', { p_creator_id: target })).error)
    ok('a signed-in brand cannot read brand_creator_searches', !!(await brand.from('brand_creator_searches').select('id').limit(1)).error)
    ok('a signed-in brand cannot write brand_creator_searches', !!(await brand.from('brand_creator_searches').insert({ brand_id: '00000000-0000-0000-0000-000000000000', brief: 'x', filters: {} })).error)
    ok('a signed-in brand cannot read brand_search_interactions', !!(await brand.from('brand_search_interactions').select('id').limit(1)).error)
    ok('a signed-in brand cannot read creators.search_hidden_at', !!(await brand.from('creators').select('search_hidden_at').limit(1)).error)
    ok('a signed-in brand cannot read creators.languages', !!(await brand.from('creators').select('languages').limit(1)).error)
  }

  console.log('\n== 3b. "Your visibility" counts')
  const { data: brandRows } = await admin.from('brands').select('id, is_guapd').limit(200)
  const real = (brandRows ?? []).filter((x) => !x.is_guapd).slice(0, 2).map((x) => x.id)
  const houseBrand = (brandRows ?? []).find((x) => x.is_guapd)?.id
  const made: string[] = []
  const seed = async (brandId: string) => {
    const { data } = await admin.from('brand_creator_searches').insert({ brand_id: brandId, brief: 'visibility test', filters: {}, result_ids: [target] }).select('id').single()
    made.push(data!.id); return data!.id
  }
  try {
    const before = (await admin.rpc('creator_search_visibility', { p_creator_id: target })).data as any
    const s1 = await seed(real[0]); await seed(real[0]); await seed(real[0])
    const after1 = (await admin.rpc('creator_search_visibility', { p_creator_id: target })).data as any
    ok('one brand running three searches in a day counts once', after1.appeared - before.appeared === 1, `${before.appeared} → ${after1.appeared}`)
    await seed(real[1])
    const after2 = (await admin.rpc('creator_search_visibility', { p_creator_id: target })).data as any
    ok('a second brand adds one', after2.appeared - before.appeared === 2)
    if (houseBrand) { await seed(houseBrand); ok('Guapd house brands are not counted', ((await admin.rpc('creator_search_visibility', { p_creator_id: target })).data as any).appeared === after2.appeared) }
    await admin.from('brand_search_interactions').insert({ search_id: s1, brand_id: real[0], creator_id: target, kind: 'profile_open' })
    const dup = await admin.from('brand_search_interactions').insert({ search_id: s1, brand_id: real[0], creator_id: target, kind: 'profile_open' })
    ok('the same click twice on one search is one row', !!dup.error)
    const s2 = made[1]
    await admin.from('brand_search_interactions').insert({ search_id: s2, brand_id: real[0], creator_id: target, kind: 'profile_open' })
    const after3 = (await admin.rpc('creator_search_visibility', { p_creator_id: target })).data as any
    ok('one brand opening the profile from two searches the same day counts once', after3.opened_profile - before.opened_profile === 1)
    ok('counts only: no brand, search or brief in what the creator gets', JSON.stringify(Object.keys(after3).sort()) === '["appeared","opened_profile","started_offer"]')
    const a4 = await anon.from('brand_search_interactions').select('id').limit(1)
    ok('anon cannot read brand_search_interactions', !!a4.error, a4.error?.message)
  } finally {
    if (made.length) await admin.from('brand_creator_searches').delete().in('id', made)
    const { count } = await admin.from('brand_search_interactions').select('id', { count: 'exact', head: true }).in('search_id', made.length ? made : ['00000000-0000-0000-0000-000000000000'])
    ok('teardown: test searches and clicks removed', (count ?? 0) === 0)
  }

  console.log('\n== 4. brief parser (model)')
  const { cleanBrief } = await import('../apps/web/lib/ai/brief-filters')
  const messy = '  Line one\r\n\r\n\r\n\r\nLine   two <script>  \u0007 '
  ok('cleanBrief: trims, keeps paragraphs, strips angle brackets and control characters', cleanBrief(messy) === 'Line one\n\nLine two script', JSON.stringify(cleanBrief(messy)))
  ok('cleanBrief caps at the limit', cleanBrief('x'.repeat(9000)).length === MAX_BRIEF)
  console.log('  (model checks run against staging: scripts/test-creator-search-staging.ts)')

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
